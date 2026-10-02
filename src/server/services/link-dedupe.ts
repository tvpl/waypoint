import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { canonicalUrl } from "@/lib/url";
import { favoriteVisibleTo, getFavorite, updateFavorite, archiveFavorite } from "./links";
import { tagsForFavorites } from "./tags";
import { UserError } from "./workspaces";

export type DuplicateGroup = {
  key: string;
  links: { id: string; title: string; url: string; collectionId: string | null; collectionName: string | null; createdAt: number; openCount: number; tags: string[] }[];
};

/** Live links of the workspace that point to the same page (canonical URL), visible to the user. */
export function findDuplicateGroups(workspaceId: string, userId: string, limit = 200): DuplicateGroup[] {
  const rows = getDb()
    .select({ f: schema.favorites, collectionName: schema.collections.name })
    .from(schema.favorites)
    .leftJoin(schema.collections, eq(schema.collections.id, schema.favorites.collectionId))
    .where(and(eq(schema.favorites.workspaceId, workspaceId), isNull(schema.favorites.archivedAt), favoriteVisibleTo(workspaceId, userId)))
    .all();
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = canonicalUrl(r.f.url);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const dupes = [...groups.entries()].filter(([, g]) => g.length > 1).slice(0, limit);
  const tagMap = tagsForFavorites(dupes.flatMap(([, g]) => g.map((r) => r.f.id)));
  return dupes.map(([key, g]) => ({
    key,
    links: g
      // Keeper first: most opened, then oldest.
      .sort((a, b) => b.f.openCount - a.f.openCount || a.f.createdAt.getTime() - b.f.createdAt.getTime())
      .map((r) => ({
        id: r.f.id,
        title: r.f.title,
        url: r.f.url,
        collectionId: r.f.collectionId,
        collectionName: r.collectionName,
        createdAt: r.f.createdAt.getTime(),
        openCount: r.f.openCount,
        tags: tagMap.get(r.f.id) ?? [],
      })),
  }));
}

/**
 * Merges duplicates into `keeperId`: tags, notes, missing metadata, opens and every user's
 * star/pin/recent move to the keeper; the others are archived (not deleted), so plan blocks
 * that point to them keep resolving.
 */
export function mergeLinks(workspaceId: string, keeperId: string, otherIds: string[]): number {
  const db = getDb();
  const keeper = getFavorite(keeperId);
  if (!keeper || keeper.workspaceId !== workspaceId) throw new UserError("Link não encontrado.");
  const others = otherIds
    .filter((id) => id !== keeperId)
    .map((id) => getFavorite(id))
    .filter((f): f is NonNullable<typeof f> => !!f && f.workspaceId === workspaceId && !f.archivedAt);
  if (!others.length) return 0;
  const key = canonicalUrl(keeper.url);
  if (others.some((o) => canonicalUrl(o.url) !== key)) throw new UserError("Só é possível mesclar links da mesma página.");

  const tagMap = tagsForFavorites([keeperId, ...others.map((o) => o.id)]);
  const tags = [...new Set([keeperId, ...others.map((o) => o.id)].flatMap((id) => tagMap.get(id) ?? []))];
  const notes = [keeper.notes, ...others.map((o) => o.notes)].filter((n): n is string => !!n?.trim());
  const pick = <K extends "description" | "favicon" | "coverImage" | "keywords" | "icon">(k: K) => keeper[k] ?? others.find((o) => o[k])?.[k] ?? null;
  updateFavorite(keeperId, {
    tags,
    notes: notes.length ? [...new Set(notes)].join("\n\n") : null,
    description: pick("description"),
    favicon: pick("favicon"),
    coverImage: pick("coverImage"),
    keywords: pick("keywords"),
    icon: pick("icon"),
  });
  const ids = others.map((o) => o.id);
  db.transaction((tx) => {
    tx.update(schema.favorites)
      .set({ openCount: sql`${schema.favorites.openCount} + ${others.reduce((s, o) => s + o.openCount, 0)}` })
      .where(eq(schema.favorites.id, keeperId))
      .run();
    // Marks and recents follow the keeper (ignore the ones the user already has on it).
    tx.run(sql`update or ignore user_marks set entity_id = ${keeperId} where entity_type = 'favorite' and entity_id in ${ids}`);
    tx.delete(schema.userMarks).where(and(eq(schema.userMarks.entityType, "favorite"), inArray(schema.userMarks.entityId, ids))).run();
    tx.run(
      sql`update or ignore recents set entity_id = ${keeperId} where entity_type = 'favorite' and entity_id in ${ids}`,
    );
    tx.delete(schema.recents).where(and(eq(schema.recents.entityType, "favorite"), inArray(schema.recents.entityId, ids))).run();
  });
  for (const id of ids) archiveFavorite(id, true);
  return ids.length;
}
