"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { toast } from "sonner";
import { Archive, Clock, FolderPlus, Inbox, Link2, Plus, SearchX, ShieldCheck, Star, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Kbd } from "@/components/ui/misc";
import {
  applyRedirectAction,
  archiveCollectionAction,
  bulkLinksAction,
  deleteCollectionAction,
  moveCollectionAction,
  moveLinksAction,
  toggleStarAction,
  togglePinCollectionAction,
  updateCollectionAction,
} from "@/app/(app)/links/actions";
import { CollectionsPanel, type PanelHandlers } from "./collections-panel";
import { LibraryHeader } from "./library-header";
import { Toolbar } from "./toolbar";
import { LinkViews } from "./link-views";
import { LibraryContext, type LibraryApi } from "./library-context";
import { LinkOpenerProvider } from "./link-opener";
import { LinkPreview } from "./link-preview";
import { LinkDialog, type LinkDialogState } from "./link-dialog";
import { CollectionDialog, type CollectionDialogState } from "./collection-dialog";
import { ShareDialog } from "./share-dialog";
import { BulkBar, MoveDialog } from "./bulk-bar";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { CollectionGlyph, CollectionTile } from "./collection-style";
import { getDrag } from "./dnd";
import { getPref, PREF_SUMMARY, PREF_VIEW, setPref } from "./prefs";
import { flatNodesClient } from "./tree-utils";
import { checkLinksNow, healthText, shortUrl, useHealthRun } from "./health";
import {
  VIEW_MODES,
  VISIBILITY_LABEL,
  type CurrentCollection,
  type LibraryCounts,
  type LinkItem,
  type Scope,
  type SortMode,
  type SummaryMode,
  type TagCount,
  type TreeNode,
  type ViewMode,
} from "./types";

export type LibraryProps = {
  tree: TreeNode[];
  current: CurrentCollection | null;
  scope: Scope;
  links: LinkItem[];
  sharedCollections: TreeNode[];
  tags: TagCount[];
  counts: LibraryCounts;
  pinned: string[];
  canEdit: boolean;
  q: string;
  activeTags: string[];
  sort: SortMode;
  viewParam: ViewMode | null;
  openId: string | null;
  add: boolean;
  addUrl: string | null;
  newCollection: boolean;
  filtering: boolean;
};

const SCOPE_COPY: Record<Scope, { title: string; subtitle: string }> = {
  all: { title: "Todos os links", subtitle: "Tudo o que você salvou neste workspace." },
  recent: { title: "Recentes", subtitle: "Links que você abriu por último." },
  starred: { title: "Favoritos", subtitle: "Os links que você marcou com estrela." },
  unsorted: { title: "Sem coleção", subtitle: "Links que ainda não estão em nenhuma coleção." },
  broken: { title: "Links quebrados", subtitle: "Links que não responderam na última verificação. Corrija a URL, arquive ou exclua." },
  archived: { title: "Arquivados", subtitle: "Links arquivados ficam fora das coleções e da busca. Restaure quando quiser." },
  shared: { title: "Compartilhados", subtitle: "Coleções que qualquer pessoa com o link pode ver." },
};

type Op =
  | { type: "patch"; ids: string[]; patch: Partial<LinkItem> }
  | { type: "addTag"; ids: string[]; tag: string }
  | { type: "remove"; ids: string[] }
  | { type: "order"; ids: string[] };

function reduce(state: LinkItem[], op: Op): LinkItem[] {
  if (op.type === "remove") return state.filter((l) => !op.ids.includes(l.id));
  if (op.type === "patch") return state.map((l) => (op.ids.includes(l.id) ? { ...l, ...op.patch } : l));
  if (op.type === "addTag") return state.map((l) => (op.ids.includes(l.id) && !l.tags.includes(op.tag) ? { ...l, tags: [...l.tags, op.tag] } : l));
  const byId = new Map(state.map((l) => [l.id, l]));
  return op.ids.map((id) => byId.get(id)!).filter(Boolean);
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};
const anyDialogOpen = () => !!document.querySelector('[role="dialog"], [role="menu"], [role="alertdialog"]');
const extractUrl = (text: string) => {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  if (/^https?:\/\/[^\s]+$/i.test(t)) return t;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t)) return t;
  return null;
};

export function LinksLibrary(props: LibraryProps) {
  const { tree, current, scope, links, sharedCollections, tags, counts, canEdit, q, activeTags, sort, viewParam, openId, filtering } = props;
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [items, apply] = React.useOptimistic(links, reduce);
  const filterRef = React.useRef<HTMLInputElement>(null);

  const [linkDialog, setLinkDialog] = React.useState<LinkDialogState>(null);
  const [colDialog, setColDialog] = React.useState<CollectionDialogState>(null);
  const [shareNode, setShareNode] = React.useState<TreeNode | null>(null);
  const [moveIds, setMoveIds] = React.useState<string[] | null>(null);
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const lastSelected = React.useRef<string | null>(null);
  const [storedView, setStoredView] = React.useState<ViewMode | null>(null);
  const [summary, setSummary] = React.useState<SummaryMode>("default");
  const [externalOver, setExternalOver] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const spKey = sp.toString();
  // the phone drawer closes whenever the library navigates
  React.useEffect(() => setDrawer(false), [spKey]);

  React.useEffect(() => {
    setStoredView(getPref(PREF_VIEW, VIEW_MODES, "cards"));
    setSummary(getPref<SummaryMode>(PREF_SUMMARY, ["default", "always", "hover", "hidden"], "default"));
  }, []);

  const view: ViewMode = viewParam ?? (current ? current.defaultView : (storedView ?? "cards"));
  const archivedScope = !current && scope === "archived";

  // ---------------------------------------------------------------- URL state
  const navigate = React.useCallback(
    (patch: Record<string, string | string[] | null>, opts?: { push?: boolean }) => {
      const p = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        p.delete(k);
        if (v == null) continue;
        if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
        else p.set(k, v);
      }
      const qs = p.toString();
      const href = qs ? `/links?${qs}` : "/links";
      startTransition(() => {
        if (opts?.push) router.push(href, { scroll: false });
        else router.replace(href, { scroll: false });
      });
    },
    [sp, router],
  );

  const toggleTag = React.useCallback(
    (tag: string) => navigate({ tag: activeTags.includes(tag) ? activeTags.filter((t) => t !== tag) : [...activeTags, tag] }),
    [activeTags, navigate],
  );
  const tagHref = React.useCallback(
    (tag: string) => {
      const p = new URLSearchParams(sp.toString());
      const next = activeTags.includes(tag) ? activeTags.filter((t) => t !== tag) : [...activeTags, tag];
      p.delete("tag");
      p.delete("open");
      next.forEach((t) => p.append("tag", t));
      const qs = p.toString();
      return qs ? `/links?${qs}` : "/links";
    },
    [sp, activeTags],
  );
  const onQuery = React.useCallback((v: string) => navigate({ q: v.trim() || null }), [navigate]);

  // URL-driven dialogs (command palette: ?add=1&url=…, ?newCollection=1).
  React.useEffect(() => {
    if (props.add && canEdit) {
      setLinkDialog({ mode: "add", url: props.addUrl ?? undefined, collectionId: current?.id ?? null });
      navigate({ add: null, url: null });
    }
    if (props.newCollection && canEdit) {
      setColDialog({ mode: "create", parent: current ? { id: current.id, name: current.name } : null });
      navigate({ newCollection: null });
    }
  }, [props.add, props.addUrl, props.newCollection, canEdit, current, navigate]);

  // Selection resets when the context changes.
  const contextKey = `${current?.id ?? ""}|${scope}`;
  React.useEffect(() => {
    setSelected(new Set());
  }, [contextKey]);

  const openAdd = React.useCallback(
    (url?: string) => {
      if (!canEdit) return;
      setLinkDialog({ mode: "add", url, collectionId: current?.id ?? null });
    },
    [canEdit, current],
  );

  // ---------------------------------------------------------------- keyboard & paste
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || anyDialogOpen()) return;
      if (e.key === "/") {
        e.preventDefault();
        filterRef.current?.focus();
      } else if (e.key === "n" || e.key === "N") {
        if (!canEdit) return;
        e.preventDefault();
        openAdd();
      } else if (e.key === "Escape") {
        setSelected(new Set());
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!canEdit || isTyping(e.target) || anyDialogOpen()) return;
      const url = extractUrl(e.clipboardData?.getData("text") ?? "");
      if (!url) return;
      e.preventDefault();
      openAdd(url);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste);
    };
  }, [canEdit, openAdd]);

  // ---------------------------------------------------------------- link operations
  const reorderable = canEdit && sort === "manual" && !filtering && (!!current || scope === "unsorted");

  const run = React.useCallback(
    (optimistic: Op | null, action: () => Promise<{ ok: boolean; error?: string }>, success?: string | (() => void)) =>
      new Promise<boolean>((resolve) =>
        startTransition(async () => {
          if (optimistic) apply(optimistic);
          const res = await action();
          if (!res.ok) {
            toast.error(res.error ?? "Algo deu errado.");
            resolve(false);
            return;
          }
          if (typeof success === "string") toast.success(success);
          else success?.();
          resolve(true);
        }),
      ),
    [apply],
  );

  const runHealth = useHealthRun();
  const checkLinks = React.useCallback(
    (ids: string[]) => {
      if (!canEdit || !ids.length) return;
      const n = ids.length;
      const id = toast.loading(n === 1 ? "Verificando link…" : `Verificando ${n} links…`);
      checkLinksNow(ids.slice(0, 200))
        .then((results) => {
          router.refresh();
          if (n === 1 && results[0]) {
            const r = results[0];
            const text = healthText({ healthStatus: r.status, healthCode: r.code, healthFinalUrl: r.finalUrl, healthCheckedAt: null });
            if (r.status === "ok") toast.success(text, { id });
            else toast.warning(text, { id });
          } else {
            const bad = results.filter((r) => r.status === "broken" || r.status === "unreachable").length;
            toast[bad ? "warning" : "success"](`${results.length} ${results.length === 1 ? "link verificado" : "links verificados"}`, {
              id,
              description: bad ? `${bad} com problema` : "Todos funcionando.",
            });
          }
        })
        .catch((e: Error) => toast.error(e.message, { id }));
    },
    [canEdit, router],
  );

  const flat = React.useMemo(() => flatNodesClient(tree), [tree]);
  const nameOf = React.useCallback((id: string | null) => (id ? (flat.find((n) => n.id === id)?.name ?? "coleção") : "Sem coleção"), [flat]);

  const moveLinks = React.useCallback(
    (ids: string[], collectionId: string | null) => {
      if (!ids.length) return;
      const leaves = (current && collectionId !== current.id) || (!current && scope === "unsorted" && collectionId !== null);
      const n = ids.length;
      run(
        leaves ? { type: "remove", ids } : { type: "patch", ids, patch: { collectionId, collectionName: collectionId ? nameOf(collectionId) : null } },
        () => moveLinksAction({ ids, collectionId }),
        `${n === 1 ? "Link movido" : `${n} links movidos`} para “${nameOf(collectionId)}”`,
      );
      setSelected(new Set());
    },
    [current, scope, run, nameOf],
  );

  const archive = React.useCallback(
    (ids: string[], archived: boolean) => {
      const n = ids.length;
      run({ type: "remove", ids }, () => bulkLinksAction({ op: "archive", ids, archived }), () =>
        toast.success(archived ? (n === 1 ? "Link arquivado" : `${n} links arquivados`) : n === 1 ? "Link restaurado" : `${n} links restaurados`, {
          action: {
            label: "Desfazer",
            onClick: () => {
              bulkLinksAction({ op: "archive", ids, archived: !archived }).then((r) => !r.ok && toast.error(r.error));
            },
          },
        }),
      );
      setSelected(new Set());
    },
    [run],
  );

  const remove = React.useCallback(
    (ids: string[]) => {
      const n = ids.length;
      setConfirm({
        title: n === 1 ? "Excluir link?" : `Excluir ${n} links?`,
        description: (
          <>
            {n === 1 ? "O link será excluído" : "Os links serão excluídos"} permanentemente. Blocos de plans que apontam para {n === 1 ? "ele" : "eles"} deixam de
            encontrá-{n === 1 ? "lo" : "los"} na biblioteca. Se quiser apenas tirar da frente, prefira <strong>Arquivar</strong>.
          </>
        ),
        confirmLabel: "Excluir",
        danger: true,
        run: async () => {
          await run({ type: "remove", ids }, () => bulkLinksAction({ op: "delete", ids }), n === 1 ? "Link excluído" : `${n} links excluídos`);
          setSelected(new Set());
        },
      });
    },
    [run],
  );

  const star = React.useCallback(
    (link: LinkItem) =>
      new Promise<boolean | null>((resolve) =>
        startTransition(async () => {
          const removeFromView = !current && scope === "starred" && link.starred;
          apply(removeFromView ? { type: "remove", ids: [link.id] } : { type: "patch", ids: [link.id], patch: { starred: !link.starred } });
          const res = await toggleStarAction(link.id);
          if (!res.ok) {
            toast.error(res.error);
            resolve(null);
          } else resolve(res.data?.starred ?? !link.starred);
        }),
      ),
    [apply, current, scope],
  );

  const toggleSelect = React.useCallback(
    (id: string, opts?: { range?: boolean }) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (opts?.range && lastSelected.current) {
          const ids = items.map((l) => l.id);
          const a = ids.indexOf(lastSelected.current);
          const b = ids.indexOf(id);
          if (a >= 0 && b >= 0) {
            ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => next.add(x));
            lastSelected.current = id;
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        lastSelected.current = id;
        return next;
      });
    },
    [items],
  );

  const dropOnLink = React.useCallback(
    (dragIds: string[], targetId: string, pos: "before" | "after") => {
      const dragId = dragIds[0];
      const rest = items.filter((l) => l.id !== dragId);
      let idx = rest.findIndex((l) => l.id === targetId);
      if (idx < 0) return;
      if (pos === "after") idx += 1;
      const order = [...rest.slice(0, idx).map((l) => l.id), dragId, ...rest.slice(idx).map((l) => l.id)];
      run({ type: "order", ids: order }, () => moveLinksAction({ ids: [dragId], collectionId: current?.id ?? null, index: idx }));
    },
    [items, run, current],
  );

  const api: LibraryApi = {
    canEdit,
    archivedScope,
    selected,
    selectionMode: selected.size > 0,
    toggleSelect,
    summaryFor: (l) => (summary === "default" ? l.summaryBehavior : summary),
    reorderable,
    dropOnLink,
    star,
    edit: (l) => setLinkDialog({ mode: "edit", link: l }),
    move: (ids) => setMoveIds(ids),
    archive,
    remove,
    filterTag: (t) => !activeTags.includes(t) && toggleTag(t),
    sortBy: (s) => navigate({ sort: s }),
    sort,
    checkLinks,
    applyRedirect: (link) => {
      if (!link.healthFinalUrl) return;
      const url = link.healthFinalUrl;
      const leaves = !current && scope === "broken";
      run(
        leaves
          ? { type: "remove", ids: [link.id] }
          : { type: "patch", ids: [link.id], patch: { url, domain: shortUrl(url).split("/")[0], healthStatus: "ok", healthFinalUrl: null } },
        () => applyRedirectAction(link.id),
        `URL atualizada para ${shortUrl(url)}`,
      );
    },
  };

  // ---------------------------------------------------------------- collection operations
  const isInCurrent = (node: TreeNode) => {
    if (!current) return false;
    return current.id === node.id || current.path.some((p) => p.id === node.id);
  };
  const handlers: PanelHandlers = {
    newCollection: (parent) => setColDialog({ mode: "create", parent: parent ? { id: parent.id, name: parent.name } : null }),
    edit: (node) => setColDialog({ mode: "edit", node }),
    rename: (node, name) => run(null, () => updateCollectionAction(node.id, { name })),
    share: (node) => setShareNode(node),
    togglePin: (node) =>
      run(null, () => togglePinCollectionAction(node.id).then((r) => {
        if (r.ok) toast.success(r.data?.pinned ? `“${node.name}” fixada na Início` : `“${node.name}” removida da Início`);
        return r;
      })),
    archive: (node) => {
      const wasCurrent = isInCurrent(node);
      run(null, () => archiveCollectionAction(node.id, true), () => {
        toast.success(`Coleção “${node.name}” arquivada`, {
          action: { label: "Desfazer", onClick: () => archiveCollectionAction(node.id, false).then((r) => !r.ok && toast.error(r.error)) },
        });
        if (wasCurrent) router.push(node.parentId ? `/links?c=${node.parentId}` : "/links");
      });
    },
    remove: (node) =>
      setConfirm({
        title: `Excluir “${node.name}”?`,
        description: (
          <>
            A coleção{node.children.length ? " e suas subcoleções serão excluídas" : " será excluída"}. Os {node.totalCount}{" "}
            {node.totalCount === 1 ? "link irá" : "links irão"} para <strong>{node.parentId ? nameOf(node.parentId) : "Sem coleção"}</strong> — nenhum link é perdido.
          </>
        ),
        confirmLabel: "Excluir coleção",
        danger: true,
        run: async () => {
          const wasCurrent = isInCurrent(node);
          const ok = await run(null, () => deleteCollectionAction(node.id), "Coleção excluída");
          if (ok && wasCurrent) router.push(node.parentId ? `/links?c=${node.parentId}` : "/links");
        },
      }),
    moveCollection: (id, parentId, index) => run(null, () => moveCollectionAction({ id, parentId, index })),
    moveLinks,
    tagHref,
    checkHealth: (node) => runHealth({ collectionId: node?.id ?? null, name: node?.name }),
  };

  const currentNode = current;
  const copy = SCOPE_COPY[scope];

  // ---------------------------------------------------------------- render
  const sortOptions: SortMode[] = current || scope === "unsorted" ? ["manual", "recent", "title", "opened"] : ["recent", "title", "opened"];
  const empty = scope === "shared" && !current ? sharedCollections.length === 0 : items.length === 0;

  return (
    <LibraryContext.Provider value={api}>
      <LinkOpenerProvider onPreview={(id) => navigate({ open: id }, { push: true })}>
        <div className="flex min-h-0 flex-1">
          <CollectionsPanel
            className="max-md:hidden"
            tree={tree}
            currentId={current?.id ?? null}
            scope={scope}
            counts={counts}
            tags={tags}
            activeTags={activeTags}
            pinned={new Set(props.pinned)}
            canEdit={canEdit}
            handlers={handlers}
          />
          <D.Root open={drawer} onOpenChange={setDrawer}>
            <D.Portal>
              <D.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-[wp-in_120ms_ease-out] md:hidden" />
              <D.Content
                aria-describedby={undefined}
                onOpenAutoFocus={(e) => {
                  // focus the panel itself: avoids popping the first button's tooltip on open
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).focus();
                }}
                className="fixed inset-y-0 left-0 z-50 flex w-[min(300px,86vw)] flex-col bg-surface-2 shadow-pop outline-none data-[state=open]:animate-[wp-drawer_180ms_cubic-bezier(.2,.8,.2,1)] md:hidden"
                onClickCapture={(e) => {
                  // any link inside (scope, collection, tag) navigates: close right away
                  if ((e.target as HTMLElement).closest("a[href]")) setDrawer(false);
                }}
              >
                <D.Title className="sr-only">Coleções</D.Title>
                <CollectionsPanel
                  className="h-full w-full border-r-0 pb-[env(safe-area-inset-bottom)]"
                  tree={tree}
                  currentId={current?.id ?? null}
                  scope={scope}
                  counts={counts}
                  tags={tags}
                  activeTags={activeTags}
                  pinned={new Set(props.pinned)}
                  canEdit={canEdit}
                  handlers={{
                    ...handlers,
                    newCollection: (p) => (setDrawer(false), handlers.newCollection(p)),
                    edit: (n) => (setDrawer(false), handlers.edit(n)),
                    share: (n) => (setDrawer(false), handlers.share(n)),
                    remove: (n) => (setDrawer(false), handlers.remove(n)),
                    checkHealth: (n) => (setDrawer(false), handlers.checkHealth(n)),
                  }}
                />
              </D.Content>
            </D.Portal>
          </D.Root>
          <main
            className="scrollbar-thin relative min-w-0 flex-1 overflow-y-auto"
            onDragOver={(e) => {
              if (!canEdit || getDrag() || !e.dataTransfer.types.includes("text/uri-list")) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setExternalOver(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setExternalOver(false);
            }}
            onDrop={(e) => {
              setExternalOver(false);
              if (!canEdit || getDrag()) return;
              const url = extractUrl(e.dataTransfer.getData("text/uri-list").split("\n")[0] ?? "");
              if (!url) return;
              e.preventDefault();
              openAdd(url);
            }}
          >
            {externalOver && (
              <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/70 text-sm font-medium text-accent-ink">
                Solte para adicionar o link{current ? ` em “${current.name}”` : ""}
              </div>
            )}
            <div className="mx-auto flex max-w-[1480px] flex-col gap-[18px] px-4 py-5 sm:gap-[22px] sm:px-6 sm:py-7 lg:px-10">
              <LibraryHeader
                current={currentNode}
                title={copy.title}
                subtitle={copy.subtitle}
                canEdit={canEdit}
                pending={pending}
                onRename={(name) => current && handlers.rename(current, name)}
                onDescribe={(d) => current && run(null, () => updateCollectionAction(current.id, { description: d || null }))}
                onShare={() => current && setShareNode(current)}
                onEdit={() => current && setColDialog({ mode: "edit", node: current })}
                onNewSub={() => current && handlers.newCollection(current)}
                onTogglePin={() => current && handlers.togglePin(current)}
                onArchive={() => current && handlers.archive(current)}
                onDelete={() => current && handlers.remove(current)}
                onCheckHealth={() => handlers.checkHealth(current)}
                onOpenCollections={() => setDrawer(true)}
                onAdd={() => openAdd()}
              />

              {!(scope === "shared" && !current) && (
                <Toolbar
                  q={q}
                  onQuery={onQuery}
                  filterRef={filterRef}
                  placeholder={current ? "Filtrar nesta coleção…" : "Filtrar links…"}
                  activeTags={activeTags}
                  tags={tags}
                  onToggleTag={toggleTag}
                  sort={sort}
                  sortOptions={sortOptions}
                  onSort={(s) => navigate({ sort: s })}
                  summary={summary}
                  onSummary={(s) => {
                    setSummary(s);
                    setPref(PREF_SUMMARY, s);
                  }}
                  view={view}
                  onView={(v) => {
                    setPref(PREF_VIEW, v);
                    setStoredView(v);
                    navigate({ view: v });
                  }}
                />
              )}

              {current && (current.children.length > 0 || canEdit) && (
                <div className="flex flex-wrap items-center gap-2">
                  {current.children.length > 0 && <span className="mr-1 text-xs text-muted">Subcoleções</span>}
                  {current.children.map((c) => (
                    <Link
                      key={c.id}
                      href={`/links?c=${c.id}`}
                      className="inline-flex h-8 items-center gap-2 rounded-[9px] border border-line bg-surface px-3 text-[13px] hover:bg-surface-2"
                    >
                      <CollectionGlyph icon={c.icon} color={c.color} />
                      <span>{c.name}</span>
                      <span className="text-xs text-muted">{c.totalCount}</span>
                    </Link>
                  ))}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handlers.newCollection(current)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-dashed border-line-2 px-3 text-[13px] text-muted hover:border-ink-2 hover:text-ink"
                    >
                      <FolderPlus className="size-[15px]" aria-hidden />
                      Subcoleção
                    </button>
                  )}
                  <span className="ml-auto text-xs text-muted" aria-live="polite">
                    <ResultCount n={items.length} deep={filtering} />
                  </span>
                </div>
              )}
              {!current && scope !== "shared" && items.length > 0 && (
                <span className="-mt-2 text-xs text-muted" aria-live="polite">
                  <ResultCount n={items.length} deep={false} />
                </span>
              )}

              {empty ? (
                <Empty
                  scope={scope}
                  current={current}
                  filtering={filtering}
                  totalLinks={counts.all}
                  canEdit={canEdit}
                  onAdd={() => openAdd()}
                  onClear={() => navigate({ q: null, tag: null })}
                />
              ) : scope === "shared" && !current ? (
                <SharedGrid nodes={sharedCollections} />
              ) : (
                <LinkViews links={items} view={view} />
              )}
              {reorderable && items.length > 1 && <p className="text-center text-xs text-muted">Arraste os links para reordenar ou solte-os em uma coleção na barra lateral.</p>}
            </div>
          </main>
        </div>

        <BulkBar
          count={selected.size}
          archivedScope={archivedScope}
          tags={tags}
          allSelected={selected.size === items.length}
          onSelectAll={() => setSelected(new Set(items.map((l) => l.id)))}
          onMove={() => setMoveIds([...selected])}
          onTag={(tag) => {
            const ids = [...selected];
            run(
              { type: "addTag", ids, tag },
              () => bulkLinksAction({ op: "addTag", ids, tag }),
              `#${tag} adicionada a ${ids.length} ${ids.length === 1 ? "link" : "links"}`,
            );
          }}
          onArchive={() => archive([...selected], !archivedScope)}
          onCheck={canEdit ? () => checkLinks([...selected]) : undefined}
          onDelete={() => remove([...selected])}
          onClear={() => setSelected(new Set())}
        />
        {canEdit && <MoveDialog ids={moveIds} tree={tree} onClose={() => setMoveIds(null)} onMove={moveLinks} />}
        <LinkPreview
          linkId={openId}
          initial={items.find((l) => l.id === openId)}
          onClose={() => navigate({ open: null })}
          onEdit={(l) => setLinkDialog({ mode: "edit", link: l })}
          onToggleStar={star}
        />
        {canEdit && <LinkDialog state={linkDialog} onClose={() => setLinkDialog(null)} tree={tree} tags={tags} />}
        {canEdit && (
          <CollectionDialog state={colDialog} onClose={() => setColDialog(null)} onCreated={(id) => router.push(`/links?c=${id}`)} />
        )}
        {canEdit && <ShareDialog node={shareNode} initialToken={shareNode && current?.id === shareNode.id ? current.shareToken : null} onClose={() => setShareNode(null)} />}
        <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      </LinkOpenerProvider>
    </LibraryContext.Provider>
  );
}

function ResultCount({ n, deep }: { n: number; deep: boolean }) {
  return (
    <>
      {n} {n === 1 ? "link" : "links"}
      {deep ? " (incluindo subcoleções)" : ""}
    </>
  );
}

function SharedGrid({ nodes }: { nodes: TreeNode[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
      {nodes.map((n) => (
        <Link
          key={n.id}
          href={`/links?c=${n.id}`}
          className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4 transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_10px_30px_-12px_rgba(23,23,28,.22)]"
        >
          <div className="flex items-center gap-3">
            <CollectionTile icon={n.icon} color={n.color} size={32} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-semibold">{n.name}</span>
              <span className="text-xs text-muted">
                {n.totalCount} {n.totalCount === 1 ? "link" : "links"}
              </span>
            </div>
          </div>
          {n.description && <p className="line-clamp-2 text-[13px] leading-[19px] text-ink-2">{n.description}</p>}
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">
            <Link2 className="size-3" aria-hidden />
            {VISIBILITY_LABEL[n.visibility]}
          </span>
        </Link>
      ))}
    </div>
  );
}

function Empty({
  scope,
  current,
  filtering,
  totalLinks,
  canEdit,
  onAdd,
  onClear,
}: {
  scope: Scope;
  current: CurrentCollection | null;
  filtering: boolean;
  totalLinks: number;
  canEdit: boolean;
  onAdd: () => void;
  onClear: () => void;
}) {
  if (filtering) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="Nenhum link encontrado"
        description="Nada corresponde ao filtro e às tags escolhidas. Tente outro termo ou busque em todo o workspace com ⌘K."
        action={
          <Button variant="secondary" onClick={onClear}>
            Limpar filtros
          </Button>
        }
      />
    );
  }
  if (current) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="Esta coleção está vazia"
        description={
          canEdit ? (
            <>
              Adicione um link, cole uma URL nesta página ou arraste links de outras listas para “{current.name}” na barra lateral.
            </>
          ) : (
            "Ainda não há links aqui."
          )
        }
        action={
          canEdit && (
            <Button variant="primary" onClick={onAdd}>
              <Plus />
              Adicionar link
            </Button>
          )
        }
      />
    );
  }
  if (scope === "all" && totalLinks === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-line-2 px-6 py-16 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
          <Link2 className="size-5" aria-hidden />
        </span>
        <div className="flex max-w-md flex-col gap-1.5">
          <p className="font-display text-[28px] leading-tight">Sua biblioteca começa aqui</p>
          <p className="text-sm leading-6 text-muted">
            {canEdit
              ? "Cole uma URL em qualquer lugar desta página para salvá-la — o Waypoint busca título, descrição e imagem. Ou traga todos os favoritos do navegador de uma vez, com pastas e tudo."
              : "Ainda não há links neste workspace."}
          </p>
        </div>
        {canEdit && (
          <>
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button variant="primary" onClick={onAdd}>
                <Plus />
                Adicionar link
              </Button>
              <Button asChild variant="secondary">
                <Link href="/links/import">
                  <Upload />
                  Importar favoritos do navegador
                </Link>
              </Button>
            </div>
            <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                <Kbd>⌘</Kbd> <Kbd>V</Kbd> colar URL
              </span>
              <span>
                <Kbd>N</Kbd> novo link
              </span>
              <span>
                <Kbd>/</Kbd> filtrar
              </span>
              <span>
                <Kbd>⌘</Kbd> <Kbd>K</Kbd> buscar tudo
              </span>
            </p>
          </>
        )}
      </div>
    );
  }
  const map: Record<Scope, { icon: React.ReactNode; title: string; description: string }> = {
    all: { icon: <Link2 />, title: "Nenhum link", description: "" },
    recent: { icon: <Clock />, title: "Nada aberto ainda", description: "Os links que você abrir aparecem aqui, do mais recente para o mais antigo." },
    starred: { icon: <Star />, title: "Nenhum favorito ainda", description: "Marque links com a estrela para encontrá-los aqui rapidamente." },
    unsorted: { icon: <Inbox />, title: "Tudo organizado", description: "Todos os links estão em alguma coleção." },
    broken: {
      icon: <ShieldCheck />,
      title: "Nenhum link quebrado",
      description: "Use “Verificar links” na barra lateral para checar se os links ainda funcionam. Links que não responderem aparecem aqui.",
    },
    archived: { icon: <Archive />, title: "Nenhum link arquivado", description: "Links arquivados saem das coleções e da busca, mas podem ser restaurados daqui." },
    shared: { icon: <Users />, title: "Nenhuma coleção compartilhada", description: "Abra uma coleção e use Compartilhar para gerar um link de leitura." },
  };
  const m = map[scope];
  return <EmptyState icon={m.icon} title={m.title} description={m.description} />;
}
