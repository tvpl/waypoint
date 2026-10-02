import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canEditWorkspace, requireWorkspace } from "@/server/services/workspaces";
import { collectionPath, listMarks } from "@/server/services/links";
import { listTags } from "@/server/services/tags";
import { shareTokenFor } from "@/server/services/permissions";
import { flatNodes, isPinned, libraryCounts, loadLibraryPage, resolveLibraryParams, visibleTree } from "@/features/links/server-data";
import { LinksLibrary } from "@/features/links/library";
import { listSavedSearches } from "@/server/services/saved-searches";
import { PREF_VIEW_COOKIE } from "@/features/links/view-cookie";
import { SORT_MODES, VIEW_MODES, type CurrentCollection, type SavedSearchItem, type SortMode, type ViewMode } from "@/features/links/types";

export const metadata: Metadata = { title: "Links" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LinksPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const wsId = ctx.workspace.id;
  const userId = ctx.user.id;
  const { tree, hidden } = visibleTree(wsId, userId);
  const { one, node, scope, q, activeTags, filtering, sort, viewParam, filter, invalidCollection } = resolveLibraryParams(sp, tree);
  if (invalidCollection) redirect("/links");

  const saved: SavedSearchItem[] = listSavedSearches(userId, wsId).map((s) => ({
    id: s.id,
    name: s.name,
    query: s.query,
    sort: s.sort && (SORT_MODES as string[]).includes(s.sort) ? (s.sort as SortMode) : null,
  }));
  const savedSearch = saved.find((s) => s.id === one("saved")) ?? null;
  const cookieView = (await cookies()).get(PREF_VIEW_COOKIE)?.value;
  const storedView = cookieView && (VIEW_MODES as string[]).includes(cookieView) ? (cookieView as ViewMode) : null;

  const allNodes = flatNodes(tree);
  const sharedCollections = allNodes.filter((n) => n.visibility === "link" || n.visibility === "public");

  const page = scope === "shared" && !node ? { links: [], hasMore: false } : loadLibraryPage(wsId, userId, filter, 0);

  const current: CurrentCollection | null = node
    ? {
        ...node,
        pinned: isPinned(userId, node.id),
        shareToken: node.visibility === "link" || node.visibility === "public" ? shareTokenFor("collection", node.id) : null,
        path: collectionPath(node.id).map((c) => ({ id: c.id, name: c.name })),
      }
    : null;

  const tags = listTags(wsId, userId)
    .filter((t) => t.links > 0)
    .map((t) => ({ name: t.name, count: t.links }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const pinned = listMarks(userId, "pin")
    .filter((m) => m.entityType === "collection")
    .map((m) => m.entityId);

  return (
    <LinksLibrary
      tree={tree}
      current={current}
      scope={scope}
      links={page.links}
      hasMore={page.hasMore}
      storedView={storedView}
      saved={saved}
      savedSearch={savedSearch}
      sharedCollections={sharedCollections}
      tags={tags}
      counts={libraryCounts(wsId, userId, hidden, sharedCollections.length)}
      pinned={pinned}
      canEdit={canEditWorkspace(ctx.role)}
      q={q}
      activeTags={activeTags}
      sort={sort}
      viewParam={viewParam}
      openId={one("open")}
      add={one("add") === "1"}
      addUrl={one("url")}
      newCollection={one("newCollection") === "1"}
      filtering={filtering}
    />
  );
}
