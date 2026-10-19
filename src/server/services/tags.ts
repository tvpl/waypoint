import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { newId, normalizeTag } from "@/lib/utils";
import { favoriteVisibleTo, reindexFavorites } from "./links";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Conn = ReturnType<typeof getDb> | Tx;

/** Returns tag ids for the given names, creating missing tags. */
export function ensureTags(conn: Conn, workspaceId: string, names: string[]): string[] {
  const clean = [...new Set(names.map(normalizeTag).filter(Boolean))];
  if (clean.length === 0) return [];
  const existing = conn
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.tags)
    .where(and(eq(schema.tags.workspaceId, workspaceId), inArray(schema.tags.name, clean)))
    .all();
  const map = new Map(existing.map((t) => [t.name, t.id]));
  for (const name of clean) {
    if (!map.has(name)) {
      const id = newId();
      conn.insert(schema.tags).values({ id, workspaceId, name }).run();
      map.set(name, id);
    }
  }
  return clean.map((n) => map.get(n)!);
}

export function setFavoriteTags(conn: Conn, workspaceId: string, favoriteId: string, names: string[]) {
  const ids = ensureTags(conn, workspaceId, names);
  conn.delete(schema.favoriteTags).where(eq(schema.favoriteTags.favoriteId, favoriteId)).run();
  for (const tagId of ids) conn.insert(schema.favoriteTags).values({ favoriteId, tagId }).run();
}

export function setPlanTags(conn: Conn, workspaceId: string, planId: string, names: string[]) {
  const ids = ensureTags(conn, workspaceId, names);
  conn.delete(schema.planTags).where(eq(schema.planTags.planId, planId)).run();
  for (const tagId of ids) conn.insert(schema.planTags).values({ planId, tagId }).run();
}

export function tagsForFavorites(favoriteIds: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (favoriteIds.length === 0) return out;
  const rows = getDb()
    .select({ favoriteId: schema.favoriteTags.favoriteId, name: schema.tags.name })
    .from(schema.favoriteTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.favoriteTags.tagId))
    .where(inArray(schema.favoriteTags.favoriteId, favoriteIds))
    .all();
  for (const r of rows) out.set(r.favoriteId, [...(out.get(r.favoriteId) ?? []), r.name]);
  return out;
}

export function tagsForPlans(planIds: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (planIds.length === 0) return out;
  const rows = getDb()
    .select({ planId: schema.planTags.planId, name: schema.tags.name })
    .from(schema.planTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.planTags.tagId))
    .where(inArray(schema.planTags.planId, planIds))
    .all();
  for (const r of rows) out.set(r.planId, [...(out.get(r.planId) ?? []), r.name]);
  return out;
}

/**
 * All tags of a workspace with usage counts across both modules. Link counts only
 * include links `userId` can see (not inside someone else's private collection).
 */
export function listTags(workspaceId: string, userId: string) {
  return getDb()
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      color: schema.tags.color,
      // Subqueries reference `tags.id` literally: a single-table select renders columns unqualified,
      // and a bare "id" would resolve to the inner table instead.
      links: sql<number>`(select count(*) from favorite_tags ft join favorites on favorites.id = ft.favorite_id where ft.tag_id = tags.id and favorites.archived_at is null and ${favoriteVisibleTo(workspaceId, userId)})`,
      plans: sql<number>`(select count(*) from plan_tags pt join plans p on p.id = pt.plan_id where pt.tag_id = tags.id and p.archived_at is null and p.deleted_at is null)`,
    })
    .from(schema.tags)
    .where(eq(schema.tags.workspaceId, workspaceId))
    .orderBy(schema.tags.name)
    .all();
}

export function getTagByName(workspaceId: string, name: string) {
  return getDb()
    .select()
    .from(schema.tags)
    .where(and(eq(schema.tags.workspaceId, workspaceId), eq(schema.tags.name, normalizeTag(name))))
    .get();
}

export function renameTag(workspaceId: string, tagId: string, name: string) {
  getDb()
    .update(schema.tags)
    .set({ name: normalizeTag(name) })
    .where(and(eq(schema.tags.id, tagId), eq(schema.tags.workspaceId, workspaceId)))
    .run();
  // The search index stores tag names: refresh the links that carry this tag.
  const ids = getDb()
    .select({ id: schema.favoriteTags.favoriteId })
    .from(schema.favoriteTags)
    .where(eq(schema.favoriteTags.tagId, tagId))
    .all()
    .map((r) => r.id);
  reindexFavorites(ids);
}

export function setTagColor(workspaceId: string, tagId: string, color: string | null) {
  getDb()
    .update(schema.tags)
    .set({ color })
    .where(and(eq(schema.tags.id, tagId), eq(schema.tags.workspaceId, workspaceId)))
    .run();
}

export function deleteTag(workspaceId: string, tagId: string) {
  getDb().delete(schema.tags).where(and(eq(schema.tags.id, tagId), eq(schema.tags.workspaceId, workspaceId))).run();
}
