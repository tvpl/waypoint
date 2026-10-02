import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { getWorkspaceContext } from "@/server/services/workspaces";
import { searchIndex } from "@/server/services/search";
import { getDb, schema } from "@/server/db";
import { planAccess } from "@/server/services/permissions";
import { listTags } from "@/server/services/tags";
import { normalizeTag } from "@/lib/utils";

export type SearchResponse = {
  plans: { id: string; title: string; snippet: string }[];
  nodes: { planId: string; planTitle: string; nodeId: string; title: string; snippet: string }[];
  links: { id: string; title: string; url: string; domain: string; favicon: string | null; collectionName: string | null; openBehavior: string }[];
  collections: { id: string; name: string; snippet: string }[];
  tags: { name: string; links: number; plans: number }[];
};

export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  const empty: SearchResponse = { plans: [], nodes: [], links: [], collections: [], tags: [] };
  if (!q) return NextResponse.json(empty);

  const hits = searchIndex(ctx.workspace.id, q, 80);
  const db = getDb();

  const planIds = [...new Set(hits.flatMap((h) => (h.type === "plan" ? [h.id] : h.type === "node" && h.parentId ? [h.parentId] : [])))];
  const plans = planIds.length
    ? db.select().from(schema.plans).where(and(inArray(schema.plans.id, planIds), isNull(schema.plans.archivedAt))).all()
    : [];
  const visible = new Map(plans.filter((p) => planAccess(ctx.user.id, p)).map((p) => [p.id, p]));

  const favIds = hits.filter((h) => h.type === "favorite").map((h) => h.id);
  const favs = favIds.length
    ? db
        .select({ f: schema.favorites, collectionName: schema.collections.name })
        .from(schema.favorites)
        .leftJoin(schema.collections, eq(schema.collections.id, schema.favorites.collectionId))
        .where(inArray(schema.favorites.id, favIds))
        .all()
    : [];
  const favMap = new Map(favs.map((r) => [r.f.id, r]));

  const res: SearchResponse = { ...empty };
  for (const h of hits) {
    if (h.type === "plan" && visible.has(h.id)) res.plans.push({ id: h.id, title: h.title, snippet: h.snippet });
    if (h.type === "node" && h.parentId && visible.has(h.parentId)) {
      res.nodes.push({ planId: h.parentId, planTitle: visible.get(h.parentId)!.title, nodeId: h.id.split(":")[1], title: h.title, snippet: h.snippet });
    }
    if (h.type === "favorite" && favMap.has(h.id)) {
      const { f, collectionName } = favMap.get(h.id)!;
      res.links.push({ id: f.id, title: f.title, url: f.url, domain: f.domain, favicon: f.favicon, collectionName, openBehavior: f.openBehavior });
    }
    if (h.type === "collection") res.collections.push({ id: h.id, name: h.title, snippet: h.snippet });
  }
  res.nodes = res.nodes.slice(0, 8);
  res.links = res.links.slice(0, 10);
  const tagQ = normalizeTag(q);
  if (tagQ) {
    const names = new Set(
      db
        .select({ name: schema.tags.name })
        .from(schema.tags)
        .where(and(eq(schema.tags.workspaceId, ctx.workspace.id), like(schema.tags.name, `%${tagQ}%`)))
        .limit(6)
        .all()
        .map((t) => t.name),
    );
    res.tags = listTags(ctx.workspace.id)
      .filter((t) => names.has(t.name))
      .map((t) => ({ name: t.name, links: t.links, plans: t.plans }));
  }
  return NextResponse.json(res);
}
