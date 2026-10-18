import "server-only";
import { and, eq, inArray, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db";
import { fetchLinkMetadata } from "./metadata";
import { descendantIds, favoriteNotTrashed, updateFavorite } from "./links";

/**
 * Fills in favicon, cover and description for links that arrived bare (browser imports
 * only carry title + URL). Every request goes through safeFetch (via fetchLinkMetadata).
 * Each link is attempted once (enrichedAt), whether or not the page had metadata.
 */

export const MAX_ENRICH_PER_CALL = 40;
const CONCURRENCY = 4;

export type EnrichSelector = {
  ids?: string[];
  collectionId?: string | null;
  /** Collections the caller can't see (private collections of others). */
  hiddenCollections?: Set<string>;
  limit?: number;
};

export type EnrichSummary = { processed: number; enriched: number; remaining: number };

/** Links still waiting for metadata: never attempted and missing icon, cover and description. */
function pendingWhere(workspaceId: string, sel: EnrichSelector): SQL | undefined {
  const f = schema.favorites;
  const conds: (SQL | undefined)[] = [
    eq(f.workspaceId, workspaceId),
    isNull(f.archivedAt),
    favoriteNotTrashed(),
    isNull(f.enrichedAt),
    isNull(f.favicon),
    isNull(f.coverImage),
    isNull(f.description),
  ];
  if (sel.ids?.length) conds.push(inArray(f.id, sel.ids));
  if (sel.collectionId) conds.push(inArray(f.collectionId, descendantIds(sel.collectionId)));
  const hidden = [...(sel.hiddenCollections ?? [])];
  if (hidden.length) conds.push(sql`(${f.collectionId} is null or ${notInArray(f.collectionId, hidden)})`);
  return and(...conds);
}

export function countPendingEnrichment(workspaceId: string, sel: EnrichSelector = {}): number {
  return (
    getDb()
      .select({ n: sql<number>`count(*)` })
      .from(schema.favorites)
      .where(pendingWhere(workspaceId, sel))
      .get()?.n ?? 0
  );
}

export async function enrichFavorites(workspaceId: string, sel: EnrichSelector, opts: { deadlineMs?: number } = {}): Promise<EnrichSummary> {
  const db = getDb();
  const limit = Math.min(sel.limit ?? 12, MAX_ENRICH_PER_CALL);
  const rows = db
    .select({ id: schema.favorites.id, url: schema.favorites.url, title: schema.favorites.title, domain: schema.favorites.domain })
    .from(schema.favorites)
    .where(pendingWhere(workspaceId, sel))
    .limit(limit)
    .all();
  const deadline = Date.now() + (opts.deadlineMs ?? 25_000);
  let enriched = 0;
  let processed = 0;
  let next = 0;
  const worker = async () => {
    while (next < rows.length && Date.now() < deadline) {
      const row = rows[next++];
      const meta = await fetchLinkMetadata(row.url);
      const patch: Parameters<typeof updateFavorite>[1] = {};
      if (meta.favicon) patch.favicon = meta.favicon;
      if (meta.image) patch.coverImage = meta.image;
      if (meta.description) patch.description = meta.description.slice(0, 5000);
      // Bookmark titles are often just the URL or the domain: prefer the page's title then.
      if (meta.title && (!row.title.trim() || row.title === row.url || row.title === row.domain)) patch.title = meta.title.slice(0, 500);
      if (Object.keys(patch).length) {
        updateFavorite(row.id, patch);
        enriched++;
      }
      db.update(schema.favorites).set({ enrichedAt: new Date() }).where(eq(schema.favorites.id, row.id)).run();
      processed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  return { processed, enriched, remaining: countPendingEnrichment(workspaceId, sel) };
}
