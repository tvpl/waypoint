import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canEditWorkspace, getWorkspaceContext } from "@/server/services/workspaces";
import { getCollection } from "@/server/services/links";
import { countPendingEnrichment, enrichFavorites, MAX_ENRICH_PER_CALL } from "@/server/services/link-enrich";
import { rateLimit } from "@/server/lib/rate-limit";
import { visibleTree } from "@/features/links/server-data";

const body = z.object({
  ids: z.array(z.string().min(1).max(64)).max(MAX_ENRICH_PER_CALL).optional(),
  collectionId: z.string().min(1).max(64).nullable().optional(),
  limit: z.number().int().min(1).max(MAX_ENRICH_PER_CALL).optional(),
  /** Only count what's pending, fetch nothing. */
  dryRun: z.boolean().optional(),
});

/**
 * POST /api/links/enrich { ids?, collectionId?, limit?, dryRun? } → { processed, enriched, remaining }
 * Fetches favicon, cover and description for links that have none (e.g. fresh imports).
 * Clients call again while `remaining > 0`. Editors only; rate-limited; safeFetch only.
 */
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditWorkspace(ctx.role)) return NextResponse.json({ error: "Apenas editores podem completar metadados." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const { ids, collectionId, dryRun } = parsed.data;

  const { hidden } = visibleTree(ctx.workspace.id, ctx.user.id);
  if (collectionId) {
    const c = getCollection(collectionId);
    if (!c || c.workspaceId !== ctx.workspace.id || hidden.has(c.id)) return NextResponse.json({ error: "Coleção não encontrada." }, { status: 404 });
  }
  const sel = { ids, collectionId, hiddenCollections: hidden, limit: parsed.data.limit };
  if (dryRun) return NextResponse.json({ processed: 0, enriched: 0, remaining: countPendingEnrichment(ctx.workspace.id, sel) });

  const limit = rateLimit(`enrich:${ctx.user.id}`, 40, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Muitas requisições seguidas. Tente de novo em instantes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const summary = await enrichFavorites(ctx.workspace.id, sel, { deadlineMs: 25_000 });
  if (summary.processed > 0) revalidatePath("/links");
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
