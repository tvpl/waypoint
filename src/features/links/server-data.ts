import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import {
  collectionPath,
  favoriteVisibleTo,
  getCollection,
  getCollectionTree,
  getFavorite,
  listMarks,
  type CollectionNode,
  type FavoriteView,
} from "@/server/services/links";
import { tagsForFavorites } from "@/server/services/tags";
import { backlinks } from "@/server/services/plans";
import { canEditWorkspace, type WorkspaceContext } from "@/server/services/workspaces";
import type { Backlink, LibraryCounts, LinkDetail, LinkItem, TreeNode } from "./types";

/** Private collections are only visible to their creator (mirrors collectionAccess for members). */
function canSee(node: { visibility: string; createdBy: string | null }, userId: string) {
  return node.visibility !== "private" || node.createdBy === userId;
}

export function toTreeNode(n: CollectionNode, userId: string): TreeNode {
  const children = n.children.filter((c) => canSee(c, userId)).map((c) => toTreeNode(c, userId));
  return {
    id: n.id,
    parentId: n.parentId,
    name: n.name,
    description: n.description,
    icon: n.icon,
    color: n.color,
    visibility: n.visibility,
    defaultView: n.defaultView,
    linkCount: n.linkCount,
    // Only count links this user can see: hidden sub-collections don't add to the total.
    totalCount: n.linkCount + children.reduce((s, c) => s + c.totalCount, 0),
    children,
  };
}

/** Visible collection tree plus the ids hidden from this user (private collections of others, with subtrees). */
export function visibleTree(workspaceId: string, userId: string) {
  const raw = getCollectionTree(workspaceId);
  const hidden = new Set<string>();
  const collectHidden = (nodes: CollectionNode[], parentHidden: boolean) => {
    for (const n of nodes) {
      const h = parentHidden || !canSee(n, userId);
      if (h) hidden.add(n.id);
      collectHidden(n.children, h);
    }
  };
  collectHidden(raw, false);
  const tree = raw.filter((n) => canSee(n, userId)).map((n) => toTreeNode(n, userId));
  return { tree, hidden };
}

export function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return undefined;
}

export function flatNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => [n, ...flatNodes(n.children)]);
}

export function toLinkItem(f: FavoriteView | (typeof schema.favorites.$inferSelect & { tags: string[]; starred: boolean; collectionName: string | null })): LinkItem {
  return {
    id: f.id,
    title: f.title,
    url: f.url,
    domain: f.domain,
    description: f.description,
    keywords: f.keywords,
    favicon: f.favicon,
    coverImage: f.coverImage,
    icon: f.icon,
    openBehavior: f.openBehavior,
    summaryBehavior: f.summaryBehavior,
    collectionId: f.collectionId,
    collectionName: f.collectionName,
    tags: f.tags,
    starred: f.starred,
    openCount: f.openCount,
    lastOpenedAt: f.lastOpenedAt ? f.lastOpenedAt.getTime() : null,
    createdAt: f.createdAt.getTime(),
    updatedAt: f.updatedAt.getTime(),
    archived: f.archivedAt != null,
    healthStatus: f.healthStatus,
    healthCode: f.healthCode,
    healthCheckedAt: f.healthCheckedAt ? f.healthCheckedAt.getTime() : null,
    healthFinalUrl: f.healthFinalUrl,
  };
}

/** Sidebar quick-filter counts. */
export function libraryCounts(workspaceId: string, userId: string, hidden: Set<string>, sharedCollections: number): LibraryCounts {
  const client = getDb().$client;
  const hiddenIds = [...hidden];
  const notHidden = hiddenIds.length ? `and (f.collection_id is null or f.collection_id not in (${hiddenIds.map(() => "?").join(",")}))` : "";
  const row = client
    .prepare(
      `select
        sum(case when f.archived_at is null then 1 else 0 end) as "all",
        sum(case when f.archived_at is null and f.collection_id is null then 1 else 0 end) as unsorted,
        sum(case when f.archived_at is not null then 1 else 0 end) as archived,
        sum(case when f.archived_at is null and f.last_opened_at is not null then 1 else 0 end) as recent,
        sum(case when f.archived_at is null and f.health_status in ('broken', 'unreachable') then 1 else 0 end) as broken,
        sum(case when f.archived_at is null and exists (select 1 from user_marks m where m.user_id = ? and m.entity_type = 'favorite' and m.entity_id = f.id and m.mark = 'star') then 1 else 0 end) as starred
       from favorites f where f.workspace_id = ? ${notHidden}`,
    )
    .get(userId, workspaceId, ...hiddenIds) as Record<string, number | null>;
  return {
    all: row.all ?? 0,
    unsorted: row.unsorted ?? 0,
    archived: row.archived ?? 0,
    recent: row.recent ?? 0,
    starred: row.starred ?? 0,
    shared: sharedCollections,
    broken: row.broken ?? 0,
  };
}

export function isPinned(userId: string, collectionId: string) {
  return listMarks(userId, "pin").some((m) => m.entityType === "collection" && m.entityId === collectionId);
}

function isStarred(userId: string, favoriteId: string) {
  return !!getDb()
    .select()
    .from(schema.userMarks)
    .where(
      and(
        eq(schema.userMarks.userId, userId),
        eq(schema.userMarks.entityType, "favorite"),
        eq(schema.userMarks.entityId, favoriteId),
        eq(schema.userMarks.mark, "star"),
      ),
    )
    .get();
}

/** Full detail of one link for the preview panel, or null when not visible to this user. */
export function loadLinkDetail(id: string, ctx: WorkspaceContext): LinkDetail | null {
  const fav = getFavorite(id);
  if (!fav || fav.workspaceId !== ctx.workspace.id) return null;
  const col = fav.collectionId ? getCollection(fav.collectionId) : undefined;
  if (col && !canSee(col, ctx.user.id)) return null;
  const tags = tagsForFavorites([id]).get(id) ?? [];
  const link = toLinkItem({ ...fav, tags, starred: isStarred(ctx.user.id, id), collectionName: col?.name ?? null });
  const path = fav.collectionId ? collectionPath(fav.collectionId).map((c) => ({ id: c.id, name: c.name })) : [];
  const refs: Backlink[] = backlinks("favorite", id, ctx.user.id).map((b) => ({
    planId: b.planId,
    planTitle: b.planTitle,
    nodeId: b.nodeId,
    nodeTitle: b.nodeTitle,
  }));
  return { link, path, backlinks: refs, canEdit: canEditWorkspace(ctx.role) };
}

/** Existing link visible to `userId` with the same normalized URL (duplicate hint). */
export function findByUrl(workspaceId: string, userId: string, url: string) {
  const variants = new Set([url, url.endsWith("/") ? url.slice(0, -1) : `${url}/`]);
  return getDb()
    .select({ id: schema.favorites.id, title: schema.favorites.title, collectionId: schema.favorites.collectionId, archivedAt: schema.favorites.archivedAt })
    .from(schema.favorites)
    .where(
      and(eq(schema.favorites.workspaceId, workspaceId), inArray(schema.favorites.url, [...variants]), favoriteVisibleTo(workspaceId, userId)),
    )
    .get();
}

/** Ids of favorites in the workspace (permission check for bulk operations). */
export function favoritesInWorkspace(workspaceId: string, ids: string[]) {
  if (!ids.length) return [];
  return getDb()
    .select({ id: schema.favorites.id })
    .from(schema.favorites)
    .where(and(eq(schema.favorites.workspaceId, workspaceId), inArray(schema.favorites.id, ids)))
    .all()
    .map((r) => r.id);
}

export function sharedCollectionIds(workspaceId: string) {
  return getDb()
    .select({ id: schema.collections.id })
    .from(schema.collections)
    .where(
      and(
        eq(schema.collections.workspaceId, workspaceId),
        isNull(schema.collections.archivedAt),
        inArray(schema.collections.visibility, ["link", "public"]),
      ),
    )
    .all()
    .map((r) => r.id);
}
