import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { OpenBehavior, SummaryBehavior, Visibility } from "../db/schema";
import { domainOf, newId } from "@/lib/utils";
import { indexEntity, removeEntity } from "./search";
import { ensureTags, setFavoriteTags, tagsForFavorites } from "./tags";
import { UserError } from "./workspaces";

export type CollectionRow = typeof schema.collections.$inferSelect;
export type FavoriteRow = typeof schema.favorites.$inferSelect;

// ================================================================== collections

export type CollectionNode = CollectionRow & { linkCount: number; totalCount: number; children: CollectionNode[] };

/** Whole (non-archived) collection tree of a workspace with link counts. */
export function getCollectionTree(workspaceId: string): CollectionNode[] {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.collections)
    .where(and(eq(schema.collections.workspaceId, workspaceId), isNull(schema.collections.archivedAt)))
    .orderBy(asc(schema.collections.sortOrder), asc(schema.collections.name))
    .all();
  const counts = db
    .select({ collectionId: schema.favorites.collectionId, n: sql<number>`count(*)` })
    .from(schema.favorites)
    .where(and(eq(schema.favorites.workspaceId, workspaceId), isNull(schema.favorites.archivedAt)))
    .groupBy(schema.favorites.collectionId)
    .all();
  const countMap = new Map(counts.map((c) => [c.collectionId, c.n]));
  const nodes = new Map<string, CollectionNode>(
    rows.map((r) => [r.id, { ...r, linkCount: countMap.get(r.id) ?? 0, totalCount: 0, children: [] }]),
  );
  const roots: CollectionNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  const total = (n: CollectionNode): number => (n.totalCount = n.linkCount + n.children.reduce((s, c) => s + total(c), 0));
  roots.forEach(total);
  return roots;
}

export function flattenTree(nodes: CollectionNode[], depth = 0): (CollectionNode & { depth: number })[] {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flattenTree(n.children, depth + 1)]);
}

export function getCollection(id: string) {
  return getDb().select().from(schema.collections).where(eq(schema.collections.id, id)).get();
}

export function collectionPath(id: string): CollectionRow[] {
  const out: CollectionRow[] = [];
  let cur = getCollection(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? getCollection(cur.parentId) : undefined;
  }
  return out;
}

export function descendantIds(id: string): string[] {
  const rows = getDb()
    .$client.prepare(
      `WITH RECURSIVE sub(id) AS (SELECT ? UNION ALL SELECT c.id FROM collections c JOIN sub ON c.parent_id = sub.id)
       SELECT id FROM sub`,
    )
    .all(id) as { id: string }[];
  return rows.map((r) => r.id);
}

function nextSort(table: typeof schema.collections | typeof schema.favorites, where: SQL | undefined) {
  const row = getDb()
    .select({ m: sql<number>`coalesce(max(${table.sortOrder}), -1)` })
    .from(table)
    .where(where)
    .get();
  return (row?.m ?? -1) + 1;
}

export function createCollection(input: {
  workspaceId: string;
  userId: string;
  name: string;
  parentId?: string | null;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
}) {
  if (input.parentId) {
    const parent = getCollection(input.parentId);
    if (!parent || parent.workspaceId !== input.workspaceId) throw new UserError("Coleção pai inválida.");
  }
  const id = newId();
  getDb()
    .insert(schema.collections)
    .values({
      id,
      workspaceId: input.workspaceId,
      parentId: input.parentId ?? null,
      name: input.name.trim() || "Nova coleção",
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortOrder: nextSort(
        schema.collections,
        and(
          eq(schema.collections.workspaceId, input.workspaceId),
          input.parentId ? eq(schema.collections.parentId, input.parentId) : isNull(schema.collections.parentId),
        ),
      ),
      createdBy: input.userId,
    })
    .run();
  indexCollection(id);
  return id;
}

export function updateCollection(
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
    defaultView: "cards" | "compact" | "list";
    visibility: Visibility;
  }>,
) {
  const set: Partial<typeof schema.collections.$inferInsert> = { ...patch, updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim() || "Coleção";
  getDb().update(schema.collections).set(set).where(eq(schema.collections.id, id)).run();
  indexCollection(id);
}

/** Re-parents and/or reorders a collection. Refuses to create cycles. */
export function moveCollection(id: string, parentId: string | null, index?: number) {
  const col = getCollection(id);
  if (!col) throw new UserError("Coleção não encontrada.");
  if (parentId) {
    if (descendantIds(id).includes(parentId)) throw new UserError("Não é possível mover uma coleção para dentro dela mesma.");
    const parent = getCollection(parentId);
    if (!parent || parent.workspaceId !== col.workspaceId) throw new UserError("Coleção de destino inválida.");
  }
  const db = getDb();
  db.transaction((tx) => {
    const siblings = tx
      .select({ id: schema.collections.id })
      .from(schema.collections)
      .where(
        and(
          eq(schema.collections.workspaceId, col.workspaceId),
          parentId ? eq(schema.collections.parentId, parentId) : isNull(schema.collections.parentId),
          sql`${schema.collections.id} != ${id}`,
        ),
      )
      .orderBy(asc(schema.collections.sortOrder), asc(schema.collections.name))
      .all()
      .map((r) => r.id);
    const at = index == null ? siblings.length : Math.max(0, Math.min(index, siblings.length));
    siblings.splice(at, 0, id);
    siblings.forEach((sid, i) => {
      tx.update(schema.collections)
        .set(sid === id ? { parentId, sortOrder: i, updatedAt: new Date() } : { sortOrder: i })
        .where(eq(schema.collections.id, sid))
        .run();
    });
  });
}

export function archiveCollection(id: string, archived: boolean) {
  const ids = descendantIds(id);
  const at = archived ? new Date() : null;
  const db = getDb();
  db.transaction((tx) => {
    tx.update(schema.collections).set({ archivedAt: at }).where(inArray(schema.collections.id, ids)).run();
    tx.update(schema.favorites).set({ archivedAt: at }).where(inArray(schema.favorites.collectionId, ids)).run();
  });
  for (const cid of ids) indexCollection(cid);
  for (const f of db.select({ id: schema.favorites.id }).from(schema.favorites).where(inArray(schema.favorites.collectionId, ids)).all()) {
    indexFavorite(f.id);
  }
}

/** Deletes a collection subtree; its links move up to the parent collection. */
export function deleteCollection(id: string) {
  const col = getCollection(id);
  if (!col) return;
  const ids = descendantIds(id);
  const db = getDb();
  db.transaction((tx) => {
    tx.update(schema.favorites).set({ collectionId: col.parentId }).where(inArray(schema.favorites.collectionId, ids)).run();
    tx.delete(schema.collections).where(eq(schema.collections.id, id)).run();
  });
  for (const cid of ids) removeEntity("collection", cid);
}

function indexCollection(id: string) {
  const c = getCollection(id);
  if (!c) return;
  if (c.archivedAt) return removeEntity("collection", id);
  indexEntity({ workspaceId: c.workspaceId, type: "collection", id, title: c.name, body: c.description });
}

// ================================================================== favorites

export type FavoriteInput = {
  title?: string;
  url: string;
  collectionId?: string | null;
  description?: string | null;
  keywords?: string | null;
  favicon?: string | null;
  coverImage?: string | null;
  icon?: string | null;
  openBehavior?: OpenBehavior;
  summaryBehavior?: SummaryBehavior;
  tags?: string[];
};

export function normalizeUrl(raw: string): string {
  const s = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  const u = new URL(withScheme);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UserError("Apenas links http(s) são suportados.");
  return u.toString();
}

export function createFavorite(workspaceId: string, userId: string, input: FavoriteInput) {
  const url = normalizeUrl(input.url);
  if (input.collectionId) {
    const c = getCollection(input.collectionId);
    if (!c || c.workspaceId !== workspaceId) throw new UserError("Coleção inválida.");
  }
  const id = newId();
  const db = getDb();
  db.transaction((tx) => {
    tx.insert(schema.favorites)
      .values({
        id,
        workspaceId,
        collectionId: input.collectionId ?? null,
        title: input.title?.trim() || domainOf(url) || url,
        url,
        domain: domainOf(url),
        description: input.description?.trim() || null,
        keywords: input.keywords?.trim() || null,
        favicon: input.favicon ?? null,
        coverImage: input.coverImage ?? null,
        icon: input.icon ?? null,
        openBehavior: input.openBehavior ?? "new_tab",
        summaryBehavior: input.summaryBehavior ?? "always",
        sortOrder: nextSort(
          schema.favorites,
          and(
            eq(schema.favorites.workspaceId, workspaceId),
            input.collectionId ? eq(schema.favorites.collectionId, input.collectionId) : isNull(schema.favorites.collectionId),
          ),
        ),
        createdBy: userId,
      })
      .run();
    if (input.tags?.length) setFavoriteTags(tx, workspaceId, id, input.tags);
  });
  indexFavorite(id);
  return id;
}

export function updateFavorite(id: string, patch: Partial<FavoriteInput>) {
  const fav = getFavorite(id);
  if (!fav) throw new UserError("Link não encontrado.");
  const set: Partial<typeof schema.favorites.$inferInsert> = { updatedAt: new Date() };
  if (patch.url !== undefined) {
    set.url = normalizeUrl(patch.url);
    set.domain = domainOf(set.url);
    if (set.url !== fav.url) Object.assign(set, { healthStatus: "unknown", healthCode: null, healthFinalUrl: null, healthCheckedAt: null });
  }
  if (patch.title !== undefined) set.title = patch.title.trim() || fav.domain;
  for (const k of ["description", "keywords", "favicon", "coverImage", "icon"] as const) {
    if (patch[k] !== undefined) set[k] = typeof patch[k] === "string" ? patch[k]!.trim() || null : null;
  }
  if (patch.collectionId !== undefined) set.collectionId = patch.collectionId;
  if (patch.openBehavior) set.openBehavior = patch.openBehavior;
  if (patch.summaryBehavior) set.summaryBehavior = patch.summaryBehavior;
  const db = getDb();
  db.transaction((tx) => {
    tx.update(schema.favorites).set(set).where(eq(schema.favorites.id, id)).run();
    if (patch.tags) setFavoriteTags(tx, fav.workspaceId, id, patch.tags);
  });
  indexFavorite(id);
}

/** Moves a link to a collection (null = "Sem coleção") at an optional position. */
export function moveFavorite(id: string, collectionId: string | null, index?: number) {
  const fav = getFavorite(id);
  if (!fav) throw new UserError("Link não encontrado.");
  if (collectionId) {
    const c = getCollection(collectionId);
    if (!c || c.workspaceId !== fav.workspaceId) throw new UserError("Coleção inválida.");
  }
  const db = getDb();
  db.transaction((tx) => {
    const siblings = tx
      .select({ id: schema.favorites.id })
      .from(schema.favorites)
      .where(
        and(
          eq(schema.favorites.workspaceId, fav.workspaceId),
          collectionId ? eq(schema.favorites.collectionId, collectionId) : isNull(schema.favorites.collectionId),
          isNull(schema.favorites.archivedAt),
          sql`${schema.favorites.id} != ${id}`,
        ),
      )
      .orderBy(asc(schema.favorites.sortOrder), desc(schema.favorites.createdAt))
      .all()
      .map((r) => r.id);
    const at = index == null ? siblings.length : Math.max(0, Math.min(index, siblings.length));
    siblings.splice(at, 0, id);
    siblings.forEach((fid, i) => {
      tx.update(schema.favorites)
        .set(fid === id ? { collectionId, sortOrder: i, updatedAt: new Date() } : { sortOrder: i })
        .where(eq(schema.favorites.id, fid))
        .run();
    });
  });
}

export function archiveFavorite(id: string, archived: boolean) {
  getDb()
    .update(schema.favorites)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(schema.favorites.id, id))
    .run();
  indexFavorite(id);
}

export function deleteFavorite(id: string) {
  removeEntity("favorite", id);
  getDb().delete(schema.favorites).where(eq(schema.favorites.id, id)).run();
}

export function getFavorite(id: string) {
  return getDb().select().from(schema.favorites).where(eq(schema.favorites.id, id)).get();
}

export function recordOpen(id: string, userId: string) {
  const db = getDb();
  db.update(schema.favorites)
    .set({ openCount: sql`${schema.favorites.openCount} + 1`, lastOpenedAt: new Date() })
    .where(eq(schema.favorites.id, id))
    .run();
  touchRecent(userId, "favorite", id);
}

function indexFavorite(id: string) {
  const f = getFavorite(id);
  if (!f) return;
  if (f.archivedAt) return removeEntity("favorite", id);
  const tags = tagsForFavorites([id]).get(id) ?? [];
  indexEntity({
    workspaceId: f.workspaceId,
    type: "favorite",
    id,
    parentId: f.collectionId,
    title: f.title,
    body: [f.description, f.keywords, f.domain, f.url].filter(Boolean).join(" \n"),
    tags: tags.join(" "),
  });
}

export type FavoriteView = FavoriteRow & { tags: string[]; starred: boolean; collectionName: string | null };

export type FavoriteFilter = {
  collectionId?: string | null;
  /** include links of nested collections */
  deep?: boolean;
  scope?: "all" | "recent" | "starred" | "unsorted" | "archived" | "broken";
  tags?: string[];
  q?: string;
  sort?: "manual" | "recent" | "title" | "opened";
  limit?: number;
};

export function listFavorites(workspaceId: string, userId: string, f: FavoriteFilter = {}): FavoriteView[] {
  const db = getDb();
  const conds: (SQL | undefined)[] = [eq(schema.favorites.workspaceId, workspaceId)];
  conds.push(f.scope === "archived" ? isNotNull(schema.favorites.archivedAt) : isNull(schema.favorites.archivedAt));
  if (f.collectionId) {
    conds.push(
      f.deep
        ? inArray(schema.favorites.collectionId, descendantIds(f.collectionId))
        : eq(schema.favorites.collectionId, f.collectionId),
    );
  }
  if (f.scope === "unsorted") conds.push(isNull(schema.favorites.collectionId));
  if (f.scope === "recent") conds.push(isNotNull(schema.favorites.lastOpenedAt));
  if (f.scope === "broken") conds.push(inArray(schema.favorites.healthStatus, ["broken", "unreachable"]));
  if (f.scope === "starred") {
    conds.push(
      sql`exists (select 1 from user_marks m where m.user_id = ${userId} and m.entity_type = 'favorite' and m.entity_id = ${schema.favorites.id} and m.mark = 'star')`,
    );
  }
  if (f.tags?.length) {
    for (const t of f.tags) {
      conds.push(
        sql`exists (select 1 from favorite_tags ft join tags tg on tg.id = ft.tag_id where ft.favorite_id = ${schema.favorites.id} and tg.name = ${t})`,
      );
    }
  }
  if (f.q?.trim()) {
    const like = `%${f.q.trim().toLowerCase().replace(/[%_]/g, "")}%`;
    conds.push(
      sql`(lower(${schema.favorites.title}) like ${like} or lower(coalesce(${schema.favorites.description}, '')) like ${like} or lower(${schema.favorites.url}) like ${like} or lower(coalesce(${schema.favorites.keywords}, '')) like ${like} or exists (select 1 from favorite_tags ft join tags tg on tg.id = ft.tag_id where ft.favorite_id = ${schema.favorites.id} and tg.name like ${like}))`,
    );
  }
  const sort = f.sort ?? (f.scope === "recent" ? "opened" : f.collectionId ? "manual" : "recent");
  const order =
    sort === "manual"
      ? [asc(schema.favorites.sortOrder), desc(schema.favorites.createdAt)]
      : sort === "title"
        ? [asc(sql`lower(${schema.favorites.title})`)]
        : sort === "opened"
          ? [desc(schema.favorites.lastOpenedAt)]
          : [desc(schema.favorites.createdAt)];

  const rows = db
    .select({ fav: schema.favorites, collectionName: schema.collections.name })
    .from(schema.favorites)
    .leftJoin(schema.collections, eq(schema.collections.id, schema.favorites.collectionId))
    .where(and(...conds))
    .orderBy(...order)
    .limit(f.limit ?? 500)
    .all();
  const ids = rows.map((r) => r.fav.id);
  const tagMap = tagsForFavorites(ids);
  const stars = new Set(
    ids.length
      ? db
          .select({ id: schema.userMarks.entityId })
          .from(schema.userMarks)
          .where(
            and(
              eq(schema.userMarks.userId, userId),
              eq(schema.userMarks.entityType, "favorite"),
              eq(schema.userMarks.mark, "star"),
              inArray(schema.userMarks.entityId, ids),
            ),
          )
          .all()
          .map((r) => r.id)
      : [],
  );
  return rows.map((r) => ({ ...r.fav, tags: tagMap.get(r.fav.id) ?? [], starred: stars.has(r.fav.id), collectionName: r.collectionName }));
}

export function countFavorites(workspaceId: string) {
  return (
    getDb()
      .select({ n: sql<number>`count(*)` })
      .from(schema.favorites)
      .where(and(eq(schema.favorites.workspaceId, workspaceId), isNull(schema.favorites.archivedAt)))
      .get()?.n ?? 0
  );
}

// ================================================================== marks & recents

export function toggleMark(userId: string, entityType: "plan" | "collection" | "favorite", entityId: string, mark: "pin" | "star") {
  const db = getDb();
  const where = and(
    eq(schema.userMarks.userId, userId),
    eq(schema.userMarks.entityType, entityType),
    eq(schema.userMarks.entityId, entityId),
    eq(schema.userMarks.mark, mark),
  );
  const exists = db.select().from(schema.userMarks).where(where).get();
  if (exists) db.delete(schema.userMarks).where(where).run();
  else db.insert(schema.userMarks).values({ userId, entityType, entityId, mark }).run();
  return !exists;
}

export function listMarks(userId: string, mark: "pin" | "star") {
  return getDb()
    .select()
    .from(schema.userMarks)
    .where(and(eq(schema.userMarks.userId, userId), eq(schema.userMarks.mark, mark)))
    .orderBy(asc(schema.userMarks.createdAt))
    .all();
}

export function touchRecent(userId: string, entityType: "plan" | "collection" | "favorite", entityId: string) {
  const openedAt = new Date();
  getDb()
    .insert(schema.recents)
    .values({ userId, entityType, entityId, openedAt })
    .onConflictDoUpdate({
      target: [schema.recents.userId, schema.recents.entityType, schema.recents.entityId],
      set: { openedAt },
    })
    .run();
}

export function pinnedCollections(userId: string, workspaceId: string) {
  return getDb()
    .select({ col: schema.collections })
    .from(schema.userMarks)
    .innerJoin(schema.collections, eq(schema.collections.id, schema.userMarks.entityId))
    .where(
      and(
        eq(schema.userMarks.userId, userId),
        eq(schema.userMarks.entityType, "collection"),
        eq(schema.userMarks.mark, "pin"),
        eq(schema.collections.workspaceId, workspaceId),
        isNull(schema.collections.archivedAt),
      ),
    )
    .orderBy(asc(schema.userMarks.createdAt))
    .all()
    .map((r) => r.col);
}

export function recentFavorites(userId: string, workspaceId: string, limit = 6) {
  const opened = getDb()
    .select({ fav: schema.favorites, openedAt: schema.recents.openedAt })
    .from(schema.recents)
    .innerJoin(schema.favorites, eq(schema.favorites.id, schema.recents.entityId))
    .where(
      and(
        eq(schema.recents.userId, userId),
        eq(schema.recents.entityType, "favorite"),
        eq(schema.favorites.workspaceId, workspaceId),
        isNull(schema.favorites.archivedAt),
      ),
    )
    .orderBy(desc(schema.recents.openedAt))
    .limit(limit)
    .all()
    .map((r) => ({ ...r.fav, at: r.openedAt }));
  if (opened.length >= limit) return opened;
  // pad with recently added links
  const seen = new Set(opened.map((o) => o.id));
  const added = getDb()
    .select()
    .from(schema.favorites)
    .where(and(eq(schema.favorites.workspaceId, workspaceId), isNull(schema.favorites.archivedAt)))
    .orderBy(desc(schema.favorites.createdAt))
    .limit(limit * 2)
    .all()
    .filter((f) => !seen.has(f.id))
    .map((f) => ({ ...f, at: f.createdAt }));
  return [...opened, ...added].slice(0, limit);
}

// ================================================================== bulk import

export type ImportFolder = { name: string; children: ImportFolder[]; links: { title: string; url: string; addedAt?: number }[] };

/** Creates collections/favorites from a parsed bookmark tree. Returns counts. */
export function importTree(workspaceId: string, userId: string, root: ImportFolder, parentId: string | null, tags: string[] = []) {
  let collections = 0;
  let links = 0;
  const db = getDb();
  const tagIds = ensureTags(db, workspaceId, tags);
  const insertedIds: string[] = [];
  const walk = (folder: ImportFolder, parent: string | null) => {
    for (const [i, l] of folder.links.entries()) {
      let url: string;
      try {
        url = normalizeUrl(l.url);
      } catch {
        continue;
      }
      const id = newId();
      db.insert(schema.favorites)
        .values({
          id,
          workspaceId,
          collectionId: parent,
          title: l.title?.trim() || domainOf(url) || url,
          url,
          domain: domainOf(url),
          sortOrder: i,
          createdBy: userId,
          createdAt: l.addedAt ? new Date(l.addedAt) : undefined,
        })
        .run();
      for (const tagId of tagIds) db.insert(schema.favoriteTags).values({ favoriteId: id, tagId }).run();
      insertedIds.push(id);
      links++;
    }
    for (const [i, child] of folder.children.entries()) {
      const id = newId();
      db.insert(schema.collections)
        .values({ id, workspaceId, parentId: parent, name: child.name.trim() || "Pasta", sortOrder: i, createdBy: userId })
        .run();
      collections++;
      walk(child, id);
      indexCollection(id);
    }
  };
  db.transaction(() => walk(root, parentId));
  for (const id of insertedIds) indexFavorite(id);
  return { collections, links };
}
