import "server-only";
import { getFavorite } from "@/server/services/links";
import { tagsForFavorites } from "@/server/services/tags";
import { visibleTree } from "@/features/links/server-data";
import type { TreeNode } from "@/features/links/types";

export type ApiCollection = { id: string; name: string; parentId: string | null; path: string; depth: number; icon: string | null; color: string | null; linkCount: number };

/** Collections visible to the user, flattened in tree order with a readable path ("Dev / Frontend"). */
export function flatCollections(workspaceId: string, userId: string): ApiCollection[] {
  const { tree } = visibleTree(workspaceId, userId);
  const out: ApiCollection[] = [];
  const walk = (nodes: TreeNode[], trail: string[], depth: number) => {
    for (const n of nodes) {
      const path = [...trail, n.name];
      out.push({ id: n.id, name: n.name, parentId: n.parentId, path: path.join(" / "), depth, icon: n.icon, color: n.color, linkCount: n.linkCount });
      walk(n.children, path, depth + 1);
    }
  };
  walk(tree, [], 0);
  return out;
}

/** Public JSON shape of a link, or null when it isn't visible to the user. */
export function apiLink(id: string, ctx: { workspaceId: string; user: { id: string } }, origin: string, collections?: ApiCollection[]) {
  const f = getFavorite(id);
  if (!f || f.workspaceId !== ctx.workspaceId) return null;
  const cols = collections ?? flatCollections(ctx.workspaceId, ctx.user.id);
  const col = f.collectionId ? cols.find((c) => c.id === f.collectionId) : null;
  if (f.collectionId && !col) return null; // inside a private collection of someone else
  const appPath = `/links?open=${encodeURIComponent(f.id)}`;
  return {
    id: f.id,
    title: f.title,
    url: f.url,
    domain: f.domain,
    description: f.description,
    favicon: f.favicon,
    coverImage: f.coverImage,
    openBehavior: f.openBehavior,
    collection: col ? { id: col.id, name: col.name, path: col.path } : null,
    tags: tagsForFavorites([f.id]).get(f.id) ?? [],
    archived: f.archivedAt != null,
    createdAt: f.createdAt.toISOString(),
    appPath,
    appUrl: `${origin}${appPath}`,
  };
}

/** Origin the user reaches the app at (honours a reverse proxy's forwarded headers). */
export function appOrigin(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}
