import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canEditWorkspace, getWorkspaceContext } from "@/server/services/workspaces";
import { createCollection, getCollection, importTree, type ImportFolder } from "@/server/services/links";
import { parseBookmarksHtml } from "@/server/lib/bookmarks";
import { normalizeTag } from "@/lib/utils";

const MAX_BYTES = 20 * 1024 * 1024;

function count(f: ImportFolder): { folders: number; links: number } {
  return f.children.reduce(
    (acc, c) => {
      const sub = count(c);
      return { folders: acc.folders + 1 + sub.folders, links: acc.links + sub.links };
    },
    { folders: 0, links: f.links.length },
  );
}

/**
 * POST /api/links/import (multipart):
 *   file      Netscape bookmarks HTML (Chrome, Edge, Firefox, Safari export)
 *   dryRun    "1" → only parse and return counts
 *   parentId  target collection (empty = root)
 *   wrap      "1" → create a new collection named `wrapName` to hold the import
 *   tag       optional tag applied to every imported link
 * Uses a route handler (not a server action) so large exports aren't capped by the action body limit.
 */
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditWorkspace(ctx.role)) return NextResponse.json({ error: "Você não tem permissão para importar neste workspace." }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie o arquivo HTML exportado do navegador." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo muito grande (máx. 20 MB)." }, { status: 400 });
  const html = await file.text();
  if (!/<a\b[^>]*href/i.test(html)) {
    return NextResponse.json({ error: "Não encontramos favoritos neste arquivo. Use o HTML exportado pelo navegador." }, { status: 400 });
  }
  const tree = parseBookmarksHtml(html);
  const counts = count(tree);
  if (form!.get("dryRun") === "1") {
    return NextResponse.json({ ...counts, topFolders: tree.children.slice(0, 8).map((c) => c.name) });
  }

  let parentId = String(form!.get("parentId") ?? "") || null;
  if (parentId) {
    const c = getCollection(parentId);
    if (!c || c.workspaceId !== ctx.workspace.id || (c.visibility === "private" && c.createdBy !== ctx.user.id)) {
      return NextResponse.json({ error: "Coleção de destino inválida." }, { status: 400 });
    }
  }
  if (form!.get("wrap") === "1") {
    const name = String(form!.get("wrapName") ?? "").trim().slice(0, 120) || "Favoritos importados";
    parentId = createCollection({ workspaceId: ctx.workspace.id, userId: ctx.user.id, name, parentId, icon: "star", color: "blue" });
  }
  const tag = normalizeTag(String(form!.get("tag") ?? ""));
  const result = importTree(ctx.workspace.id, ctx.user.id, tree, parentId, tag ? [tag] : []);
  revalidatePath("/links");
  revalidatePath("/");
  return NextResponse.json({ ok: true, ...result, collectionId: parentId });
}
