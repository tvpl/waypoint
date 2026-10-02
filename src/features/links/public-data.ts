import "server-only";
import { getCollection, getCollectionTree, listFavorites, type CollectionNode } from "@/server/services/links";

export type PublicNode = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  linkCount: number;
  totalCount: number;
  children: PublicNode[];
};

export type PublicLink = {
  id: string;
  title: string;
  url: string;
  domain: string;
  description: string | null;
  favicon: string | null;
  icon: string | null;
  coverImage: string | null;
  summaryBehavior: "always" | "hover" | "hidden";
  collectionId: string | null;
  tags: string[];
};

export type PublicCollectionData = {
  /** The shared root collection (what the token grants access to). */
  root: { id: string; name: string };
  /** The collection being shown (root, or a sub-collection when `focusId` was given). */
  collection: { id: string; name: string; description: string | null; icon: string | null; color: string | null; workspaceId: string };
  /** Breadcrumb from the shared root to `collection` (inclusive). */
  path: { id: string; name: string }[];
  /** Visible sub-collections of `collection`, nested (private ones are omitted with their subtrees). */
  children: PublicNode[];
  /** Every link in `collection` and its visible sub-collections (non-archived). */
  links: PublicLink[];
};

function toPublic(n: CollectionNode): PublicNode {
  return {
    id: n.id,
    name: n.name,
    description: n.description,
    icon: n.icon,
    color: n.color,
    linkCount: n.linkCount,
    totalCount: n.totalCount,
    children: n.children.filter((c) => c.visibility !== "private").map(toPublic),
  };
}

function find(nodes: CollectionNode[], id: string): CollectionNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = find(n.children, id);
    if (f) return f;
  }
}

/**
 * Read-only data for a shared collection page (`/share/[token]`).
 * The caller is responsible for authorising access (collectionAccess with the share token).
 * Pass `focusId` (e.g. from `?c=`) to show a sub-collection of the shared root; ids outside
 * the shared subtree fall back to the root.
 */
export function loadPublicCollection(collectionId: string, focusId?: string | null): PublicCollectionData | null {
  const col = getCollection(collectionId);
  if (!col || col.archivedAt) return null;
  const rootNode = find(getCollectionTree(col.workspaceId), col.id);
  if (!rootNode) return null;

  // Walk down from the root to the focus, skipping private branches.
  const path: CollectionNode[] = [rootNode];
  if (focusId && focusId !== rootNode.id) {
    const trail = (n: CollectionNode): CollectionNode[] | null => {
      for (const c of n.children) {
        if (c.visibility === "private") continue;
        if (c.id === focusId) return [c];
        const t = trail(c);
        if (t) return [c, ...t];
      }
      return null;
    };
    path.push(...(trail(rootNode) ?? []));
  }
  const focus = path.at(-1)!;
  const view = toPublic(focus);

  const visible = new Set<string>();
  const collect = (n: PublicNode) => {
    visible.add(n.id);
    n.children.forEach(collect);
  };
  collect(view);

  const links = listFavorites(col.workspaceId, "", { collectionId: focus.id, deep: true, sort: "manual", limit: 5000 })
    .filter((f) => f.collectionId && visible.has(f.collectionId))
    .map((f) => ({
      id: f.id,
      title: f.title,
      url: f.url,
      domain: f.domain,
      description: f.description,
      favicon: f.favicon,
      icon: f.icon,
      coverImage: f.coverImage,
      summaryBehavior: f.summaryBehavior,
      collectionId: f.collectionId,
      tags: f.tags,
    }));

  return {
    root: { id: rootNode.id, name: rootNode.name },
    collection: { id: focus.id, name: focus.name, description: focus.description, icon: focus.icon, color: focus.color, workspaceId: focus.workspaceId },
    path: path.map((p) => ({ id: p.id, name: p.name })),
    children: view.children,
    links,
  };
}
