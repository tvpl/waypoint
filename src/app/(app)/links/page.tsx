import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canEditWorkspace, requireWorkspace } from "@/server/services/workspaces";
import { collectionPath, listFavorites, listMarks } from "@/server/services/links";
import { listTags } from "@/server/services/tags";
import { shareTokenFor } from "@/server/services/permissions";
import { findNode, flatNodes, isPinned, libraryCounts, toLinkItem, visibleTree } from "@/features/links/server-data";
import { LinksLibrary } from "@/features/links/library";
import { SCOPES, SORT_MODES, VIEW_MODES, type CurrentCollection, type Scope, type SortMode, type ViewMode } from "@/features/links/types";

export const metadata: Metadata = { title: "Links" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LinksPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? null;
  };
  const many = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
  };

  const wsId = ctx.workspace.id;
  const userId = ctx.user.id;
  const { tree, hidden } = visibleTree(wsId, userId);

  const cId = one("c");
  const node = cId ? findNode(tree, cId) : undefined;
  if (cId && !node) redirect("/links");

  const rawScope = one("scope");
  const scope: Scope = !node && rawScope && (SCOPES as string[]).includes(rawScope) ? (rawScope as Scope) : "all";
  const q = (one("q") ?? "").slice(0, 200);
  const activeTags = [...new Set(many("tag").map((t) => t.slice(0, 48)))];
  const filtering = !!q.trim() || activeTags.length > 0;
  const rawSort = one("sort");
  const manualAllowed = !!node || scope === "unsorted";
  const defaultSort: SortMode = scope === "recent" ? "opened" : manualAllowed ? "manual" : "recent";
  const sort: SortMode =
    rawSort && (SORT_MODES as string[]).includes(rawSort) && (rawSort !== "manual" || manualAllowed) ? (rawSort as SortMode) : defaultSort;
  const rawView = one("view");
  const viewParam = rawView && (VIEW_MODES as string[]).includes(rawView) ? (rawView as ViewMode) : null;

  const allNodes = flatNodes(tree);
  const sharedCollections = allNodes.filter((n) => n.visibility === "link" || n.visibility === "public");

  const links =
    scope === "shared" && !node
      ? []
      : listFavorites(wsId, userId, {
          collectionId: node?.id,
          deep: node ? filtering : undefined,
          scope: node ? undefined : scope === "shared" ? "all" : scope,
          tags: activeTags,
          q,
          sort,
          limit: 1000,
        }).map(toLinkItem);

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
      links={links}
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
