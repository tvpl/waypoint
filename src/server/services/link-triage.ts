import "server-only";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { collectionVisibleTo, favoriteVisibleTo, getFavorite } from "./links";
import { tagsForFavorites } from "./tags";

export type CollectionSuggestion = { id: string; name: string; icon: string | null; color: string | null; reason: string };

/**
 * Where a link probably belongs: collections holding other links from the same site
 * (strongest signal) or sharing its tags, then the collections the user files into most.
 */
export function suggestCollections(workspaceId: string, userId: string, favoriteId: string, limit = 6): CollectionSuggestion[] {
  const db = getDb();
  const fav = getFavorite(favoriteId);
  if (!fav || fav.workspaceId !== workspaceId) return [];
  const tags = tagsForFavorites([favoriteId]).get(favoriteId) ?? [];
  const cols = db
    .select()
    .from(schema.collections)
    .where(and(eq(schema.collections.workspaceId, workspaceId), isNull(schema.collections.archivedAt), collectionVisibleTo(workspaceId, userId)))
    .all();
  const score = new Map<string, { score: number; reason: string }>();
  const bump = (id: string | null, by: number, reason: string) => {
    if (!id) return;
    const cur = score.get(id);
    if (!cur) score.set(id, { score: by, reason });
    else cur.score += by;
  };
  const filed = and(eq(schema.favorites.workspaceId, workspaceId), isNull(schema.favorites.archivedAt), isNotNull(schema.favorites.collectionId), favoriteVisibleTo(workspaceId, userId));
  for (const r of db
    .select({ id: schema.favorites.collectionId, n: sql<number>`count(*)` })
    .from(schema.favorites)
    .where(and(filed, eq(schema.favorites.domain, fav.domain)))
    .groupBy(schema.favorites.collectionId)
    .all()) {
    bump(r.id, r.n * 5, r.n === 1 ? `1 link de ${fav.domain}` : `${r.n} links de ${fav.domain}`);
  }
  if (tags.length) {
    for (const r of db
      .select({ id: schema.favorites.collectionId, n: sql<number>`count(*)` })
      .from(schema.favorites)
      .innerJoin(schema.favoriteTags, eq(schema.favoriteTags.favoriteId, schema.favorites.id))
      .innerJoin(schema.tags, eq(schema.tags.id, schema.favoriteTags.tagId))
      .where(and(filed, inArray(schema.tags.name, tags)))
      .groupBy(schema.favorites.collectionId)
      .all()) {
      bump(r.id, r.n * 2, "tags em comum");
    }
  }
  // Fallback: busiest collections lately.
  for (const r of db
    .select({ id: schema.favorites.collectionId, n: sql<number>`count(*)` })
    .from(schema.favorites)
    .where(and(filed, sql`${schema.favorites.createdAt} > ${Date.now() - 60 * 86_400_000}`))
    .groupBy(schema.favorites.collectionId)
    .all()) {
    bump(r.id, Math.min(r.n, 5) * 0.2, "usada recentemente");
  }
  const byId = new Map(cols.map((c) => [c.id, c]));
  return [...score.entries()]
    .filter(([id]) => byId.has(id) && id !== fav.collectionId)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([id, s]) => {
      const c = byId.get(id)!;
      return { id, name: c.name, icon: c.icon, color: c.color, reason: s.reason };
    });
}

/** Takes links out of the inbox without filing them (they stay where they are). */
export function markTriaged(workspaceId: string, ids: string[]) {
  if (!ids.length) return;
  getDb()
    .update(schema.favorites)
    .set({ inboxAt: null })
    .where(and(eq(schema.favorites.workspaceId, workspaceId), inArray(schema.favorites.id, ids)))
    .run();
}
