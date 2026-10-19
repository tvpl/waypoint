"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { toast } from "sonner";
import {
  Copy,
  ClipboardPaste,
  ArrowDownUp,
  Archive, Clock, FolderPlus, Inbox, Link2, Plus, SearchX, ShieldCheck, Star, Upload, Users,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/menu";
import { CollectionList } from "./collection-picker";
import { BatchLinksDialog } from "./batch-dialog";
import { TagBatchDialog } from "./tag-batch-dialog";
import { LibraryDisplayOptions } from "./display-options";
import {
  groupLinks,
  DEFAULT_DISPLAY,
  readDisplay,
  reorderLinks,
  type DisplaySettings,
} from "./display";
import { parseBatchUrls } from "./batch-urls";
import { Button } from "@/components/ui/button";
import { EmptyState, Kbd } from "@/components/ui/misc";
import {
  applyRedirectAction,
  archiveCollectionAction,
  bulkLinksAction,
  createSavedSearchAction,
  deleteCollectionAction,
  deleteSavedSearchAction,
  loadMoreLinksAction,
  markTriagedAction,
  moveCollectionAction,
  moveLinksAction,
  toggleStarAction,
  togglePinCollectionAction,
  togglePinLinkAction,
  updateCollectionAction,
  updateSavedSearchAction,
} from "@/app/(app)/links/actions";
import { ask } from "@/components/ui/ask";
import { trashedToast } from "@/features/trash/undo-toast";
import { prefersReducedMotion } from "@/lib/utils";
import { highlightTerms, isEmptyQuery, matchesLinkQuery, parseLinkQuery } from "@/domain/link-query";
import { CollectionsPanel, type PanelHandlers } from "./collections-panel";
import { LibraryHeader } from "./library-header";
import { Toolbar } from "./toolbar";
import { LinkViews } from "./link-views";
import { createSelectionStore, LibraryContext, type LibraryApi } from "./library-context";
import { LinkOpenerProvider } from "./link-opener";
import { LinkPreview } from "./link-preview";
import { LinkDialog, type LinkDialogState } from "./link-dialog";
import { CollectionDialog, type CollectionDialogState } from "./collection-dialog";
import { ShareDialog } from "./share-dialog";
import { BulkBar, MoveDialog } from "./bulk-bar";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { CollectionGlyph, CollectionTile } from "./collection-style";
import { getDrag } from "./dnd";
import {
  getJson,
  setJson,
  getPref,
  PREF_SUMMARY,
  PREF_VIEW,
  setPref,
  setViewCookie,
} from "./prefs";
import { flatNodesClient } from "./tree-utils";
import { checkLinksNow, healthText, shortUrl, useHealthRun } from "./health";
import { useEnrichRun } from "./enrich";
import {
  SORT_MODES,
  VIEW_MODES,
  VISIBILITY_LABEL,
  type CurrentCollection,
  type LibraryCounts,
  type LinkItem,
  type SavedSearchItem,
  type Scope,
  type SortMode,
  type SummaryMode,
  type TagCount,
  type TreeNode,
  type ViewMode,
} from "./types";
import { overlayOpen } from "@/lib/dom";
import { DuplicatesDialog } from "./duplicates-dialog";
import { TriageDialog } from "./triage-dialog";

export type LibraryProps = {
  tree: TreeNode[];
  current: CurrentCollection | null;
  scope: Scope;
  links: LinkItem[];
  /** More links exist after `links` (loaded on scroll). */
  hasMore: boolean;
  /** View remembered for this browser (cookie), so the server renders it without a flash. */
  storedView: ViewMode | null;
  saved: SavedSearchItem[];
  /** The saved search being viewed (?saved=). */
  savedSearch: SavedSearchItem | null;
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
  inbox: { title: "Caixa de entrada", subtitle: "O que você salvou pela extensão ou pela API e ainda não organizou. Use Triar para decidir rápido." },
  recent: { title: "Recentes", subtitle: "Links que você abriu, do mais recente ao mais antigo." },
  starred: { title: "Favoritos", subtitle: "Os links que você marcou com estrela." },
  unsorted: { title: "Sem coleção", subtitle: "Links que ainda não estão em nenhuma coleção." },
  broken: { title: "Links quebrados", subtitle: "Links que não responderam na última verificação. Corrija a URL, arquive ou exclua." },
  archived: { title: "Arquivados", subtitle: "Links arquivados ficam fora das coleções e da busca. Restaure quando quiser." },
  shared: { title: "Compartilhados", subtitle: "Coleções que qualquer pessoa com o link pode ver." },
};

type Op =
  | { type: "patch"; ids: string[]; patch: Partial<LinkItem> }
  | { type: "tags"; ids: string[]; add: string[]; remove: string[] }
  | { type: "addTag"; ids: string[]; tag: string }
  | { type: "removeTag"; ids: string[]; tag: string }
  | { type: "remove"; ids: string[] }
  | { type: "order"; ids: string[] };

function reduce(state: LinkItem[], op: Op): LinkItem[] {
  if (op.type === "remove") return state.filter((l) => !op.ids.includes(l.id));
  if (op.type === "patch") return state.map((l) =>
      op.ids.includes(l.id) ? { ...l, ...op.patch } : l,
    );
  if (op.type === "tags")
    return state.map((l) =>
      op.ids.includes(l.id)
        ? {
            ...l,
            tags: [
              ...new Set([
                ...l.tags.filter((t) => !op.remove.includes(t)),
                ...op.add,
              ]),
            ],
          }
        : l,
    );
  if (op.type === "addTag")
    return state.map((l) =>
      op.ids.includes(l.id) && !l.tags.includes(op.tag) ? { ...l, tags: [...l.tags, op.tag] } : l,
    );
  if (op.type === "removeTag")
    return state.map((l) =>
      op.ids.includes(l.id) ? { ...l, tags: l.tags.filter((t) => t !== op.tag) } : l,
    );
  const byId = new Map(state.map((l) => [l.id, l]));
  return op.ids.map((id) => byId.get(id)!).filter(Boolean);
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};
const anyDialogOpen = overlayOpen;
const extractUrl = (text: string) => {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  if (/^https?:\/\/[^\s]+$/i.test(t)) return t;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t)) return t;
  return null;
};

export function LinksLibrary(props: LibraryProps) {
  const { tree, current, scope, links, sharedCollections, tags, counts, canEdit, q, activeTags, sort, viewParam,
    filtering,
    saved,
    savedSearch,
  } = props;
  const router = useRouter();
  const sp = useSearchParams();
  const openId = sp.get("open");
  const preferenceKey = `wp-links-display:${current?.id ?? scope}`;
  const [displayState, setDisplayState] = React.useState<{
    key: string;
    settings: DisplaySettings;
  }>({ key: preferenceKey, settings: DEFAULT_DISPLAY });
  const display =
    displayState.key === preferenceKey
      ? displayState.settings
      : DEFAULT_DISPLAY;
  React.useEffect(
    () =>
      setDisplayState({
        key: preferenceKey,
        settings: readDisplay(getJson(preferenceKey, null)),
      }),
    [preferenceKey],
  );
  React.useEffect(() => {
    if (displayState.key !== preferenceKey) return;
    const timer = setTimeout(
      () => setJson(preferenceKey, displayState.settings),
      200,
    );
    return () => clearTimeout(timer);
  }, [displayState, preferenceKey]);
  const updateDisplay = React.useCallback(
    (patch: Partial<DisplaySettings>) =>
      setDisplayState((prev) => ({
        key: preferenceKey,
        settings: {
          ...(prev.key === preferenceKey ? prev.settings : DEFAULT_DISPLAY),
          ...patch,
        },
      })),
    [preferenceKey],
  );
  const scrollRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const key = `wp-links-scroll:${current?.id ?? scope}`;
    let frame = requestAnimationFrame(() => {
      try {
        el.scrollTop = Number(sessionStorage.getItem(key) ?? 0);
      } catch {}
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      try {
        sessionStorage.setItem(key, String(el.scrollTop));
      } catch {}
    };
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 150);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      save();
      el.removeEventListener("scroll", onScroll);
    };
  }, [current?.id, scope]);
  const [pending, startTransition] = React.useTransition();
  const filterRef = React.useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------- paging
  // Further pages append to the server's first page; a new first page (navigation) resets them.
  const [more, setMore] = React.useState<{
    base: LinkItem[];
    links: LinkItem[];
    hasMore: boolean;
  }>({ base: links, links: [], hasMore: props.hasMore });
  if (more.base !== links)
    setMore({ base: links, links: [], hasMore: props.hasMore });
  const loaded = React.useMemo(
    () => (more.links.length ? [...links, ...more.links] : links),
    [links, more.links],
  );
  const [items, apply] = React.useOptimistic(loaded, reduce);
  const loadingMore = React.useRef(false);
  const loadMore = React.useCallback(() => {
    if (loadingMore.current || !more.hasMore) return;
    loadingMore.current = true;
    const base = more.base;
    loadMoreLinksAction(sp.toString(), base.length + more.links.length)
      .then((r) => {
        if (!r.ok) return void toast.error(r.error);
        setMore((m) =>
          m.base === base
            ? {
                base,
                links: [...m.links, ...r.data!.links],
                hasMore: r.data!.hasMore,
              }
            : m,
        );
      })
      .finally(() => (loadingMore.current = false));
  }, [more, sp]);

  // ---------------------------------------------------------------- instant filter
  // While the debounced URL update is in flight, filter what's loaded right away.
  const [liveQ, setLiveQ] = React.useState(q);
  const parsedLive = React.useMemo(() => parseLinkQuery(liveQ), [liveQ]);
  const visible = React.useMemo(() => {
    const filtered =
      liveQ.trim() === q.trim() || isEmptyQuery(parsedLive)
        ? items
        : items.filter((l) => matchesLinkQuery(l, parsedLive));
    return groupLinks(filtered, display.group).flatMap((g) => g.links);
  }, [items, liveQ, q, parsedLive, display.group]);
  const highlight = React.useMemo(
    () => highlightTerms(parsedLive),
    [parsedLive],
  );
  const tagColors = React.useMemo(
    () => new Map(tags.filter((t) => t.color).map((t) => [t.name, t.color!])),
    [tags],
  );

  const [linkDialog, setLinkDialog] = React.useState<LinkDialogState>(null);
  const [batchText, setBatchText] = React.useState<string | null>(null);
  const [tagIds, setTagIds] = React.useState<string[] | null>(null);
  const [collectionToMove, setCollectionToMove] =
    React.useState<TreeNode | null>(null);
  const [colDialog, setColDialog] = React.useState<CollectionDialogState>(null);
  const [shareNode, setShareNode] = React.useState<TreeNode | null>(null);
  const [moveIds, setMoveIds] = React.useState<string[] | null>(null);
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null);
  const [selection] = React.useState(createSelectionStore);
  const selected = React.useSyncExternalStore(
    selection.subscribe,
    selection.get,
    selection.get,
  );
  const setSelected = selection.set;
  const lastSelected = React.useRef<string | null>(null);
  const [storedView, setStoredView] = React.useState<ViewMode | null>(
    props.storedView,
  );
  const [summary, setSummary] = React.useState<SummaryMode>("default");
  const [externalOver, setExternalOver] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const [dupesOpen, setDupesOpen] = React.useState(false);
  const [triageOpen, setTriageOpen] = React.useState(false);
  const spKey = sp.toString();
  // the phone drawer closes whenever the library navigates
  React.useEffect(() => setDrawer(false), [spKey]);

  React.useEffect(() => {
    setSummary(
      getPref<SummaryMode>(
        PREF_SUMMARY,
        ["default", "always", "hover", "hidden"],
        "default",
      ),
    );
    // One-time move of the view preference from localStorage to the cookie the server reads.
    if (!props.storedView) {
      const legacy = getPref<ViewMode | "">(PREF_VIEW, [...VIEW_MODES, ""], "");
      if (legacy) {
        setViewCookie(legacy);
        setStoredView(legacy);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const localView = sp.get("view");
  const view: ViewMode =
    localView && VIEW_MODES.includes(localView as ViewMode)
      ? (localView as ViewMode)
      : (display.view ??
        viewParam ??
        (current ? current.defaultView : (storedView ?? "cards")));
  const archivedScope = !current && scope === "archived";

  // ---------------------------------------------------------------- URL state
  const navigate = React.useCallback(
    (
      patch: Record<string, string | string[] | null>,
      opts?: { push?: boolean },
    ) => {
      const p = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        p.delete(k);
        if (v == null) continue;
        if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
        else p.set(k, v);
      }
      const qs = p.toString();
      const href = qs ? `/links?${qs}` : "/links";
      if (Object.keys(patch).every((k) => k === "open" || k === "view")) {
        if (opts?.push) window.history.pushState(null, "", href);
        else window.history.replaceState(null, "", href);
        return;
      }
      startTransition(() => {
        if (opts?.push) router.push(href, { scroll: false });
        else router.replace(href, { scroll: false });
      });
    },
    [sp, router],
  );

  React.useEffect(() => {
    if (
      displayState.key !== preferenceKey ||
      !display.sort ||
      sp.has("sort") ||
      display.sort === sort
    )
      return;
    if (display.sort === "manual" && !current && scope !== "unsorted") return;
    navigate({ sort: display.sort });
  }, [
    display.sort,
    displayState.key,
    preferenceKey,
    sp,
    sort,
    current,
    scope,
    navigate,
  ]);
  const changeSort = React.useCallback(
    (sort: SortMode) => {
      updateDisplay({ sort });
      navigate({ sort });
    },
    [navigate, updateDisplay],
  );
  const toggleTag = React.useCallback(
    (tag: string) =>
      navigate({
        tag: activeTags.includes(tag)
          ? activeTags.filter((t) => t !== tag)
          : [...activeTags, tag],
      }),
    [activeTags, navigate],
  );
  const tagHref = React.useCallback(
    (tag: string) => {
      const p = new URLSearchParams(sp.toString());
      const next = activeTags.includes(tag)
        ? activeTags.filter((t) => t !== tag)
        : [...activeTags, tag];
      p.delete("tag");
      p.delete("open");
      next.forEach((t) => p.append("tag", t));
      const qs = p.toString();
      return qs ? `/links?${qs}` : "/links";
    },
    [sp, activeTags],
  );
  const onQuery = React.useCallback(
    // Editing the text leaves the saved search (its name would no longer describe the results).
    (v: string) =>
      navigate({
        q: v.trim() || null,
        ...(savedSearch && v.trim() !== savedSearch.query
          ? { saved: null }
          : {}),
      }),
    [navigate, savedSearch],
  );

  // URL-driven dialogs (command palette: ?add=1&url=…, ?newCollection=1).
  React.useEffect(() => {
    if (props.add && canEdit) {
      setLinkDialog({
        mode: "add",
        url: props.addUrl ?? undefined,
        collectionId: current?.id ?? null,
      });
      navigate({ add: null, url: null });
    }
    if (props.newCollection && canEdit) {
      setColDialog({
        mode: "create",
        parent: current ? { id: current.id, name: current.name } : null,
      });
      navigate({ newCollection: null });
    }
  }, [
    props.add,
    props.addUrl,
    props.newCollection,
    canEdit,
    current,
    navigate,
  ]);

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
  // Latest values for the window-level key handler (it's registered once).
  const keyCtx = React.useRef({
    visible: [] as LinkItem[],
    api: null as LibraryApi | null,
  });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || anyDialogOpen()) return;
      const api = keyCtx.current.api;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && canEdit) {
        e.preventDefault();
        setSelected(new Set(keyCtx.current.visible.map((l) => l.id)));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        api &&
        canEdit &&
        api.selection.get().size
      ) {
        e.preventDefault();
        api.archive([...api.selection.get()], !api.archivedScope);
        return;
      }
      if (handleListKey(e, keyCtx.current.visible, keyCtx.current.api)) return;
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
      const text = e.clipboardData?.getData("text") ?? "";
      const batch = parseBatchUrls(text);
      if (text.trim().includes("\n") && batch.urls.length) {
        e.preventDefault();
        setBatchText(text);
        return;
      }
      const url = extractUrl(text);
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
  const reorderable =
    canEdit &&
    !more.hasMore &&
    display.group === "none" &&
    sort === "manual" &&
    !filtering &&
    (!!current || scope === "unsorted");

  const run = React.useCallback(
    (
      optimistic: Op | null,
      action: () => Promise<{ ok: boolean; error?: string }>,
      success?: string | (() => void),
    ) =>
      new Promise<boolean>((resolve) =>
        startTransition(async () => {
          if (optimistic) apply(optimistic);
          const res = await action().catch(() => ({
            ok: false,
            error: "Não foi possível concluir. Tente novamente.",
          }));
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
  const enrich = useEnrichRun();
  const checkLinks = React.useCallback(
    (ids: string[]) => {
      if (!canEdit || !ids.length) return;
      const n = ids.length;
      const id = toast.loading(
        n === 1 ? "Verificando link…" : `Verificando ${n} links…`,
      );
      checkLinksNow(ids.slice(0, 200))
        .then((results) => {
          router.refresh();
          if (n === 1 && results[0]) {
            const r = results[0];
            const text = healthText({
              healthStatus: r.status,
              healthCode: r.code,
              healthFinalUrl: r.finalUrl,
              healthCheckedAt: null,
            });
            if (r.status === "ok") toast.success(text, { id });
            else toast.warning(text, { id });
          } else {
            const bad = results.filter(
              (r) => r.status === "broken" || r.status === "unreachable",
            ).length;
            toast[bad ? "warning" : "success"](
              `${results.length} ${results.length === 1 ? "link verificado" : "links verificados"}`,
              {
                id,
                description: bad ? `${bad} com problema` : "Todos funcionando.",
              },
            );
          }
        })
        .catch((e: Error) => toast.error(e.message, { id }));
    },
    [canEdit, router],
  );

  const flat = React.useMemo(() => flatNodesClient(tree), [tree]);
  const nameOf = React.useCallback(
    (id: string | null) =>
      id ? (flat.find((n) => n.id === id)?.name ?? "coleção") : "Sem coleção",
    [flat],
  );

  const moveLinks = React.useCallback(
    (ids: string[], collectionId: string | null) => {
      if (!ids.length) return;
      const leaves =
        (current && collectionId !== current.id) ||
        (!current &&
          (scope === "unsorted" || scope === "inbox") &&
          collectionId !== null);
      const n = ids.length;
      const previous = new Map<string | null, string[]>();
      for (const link of items.filter(l => ids.includes(l.id))) previous.set(link.collectionId, [...(previous.get(link.collectionId) ?? []), link.id]);
      run(
        leaves
          ? { type: "remove", ids }
          : {
              type: "patch",
              ids,
              patch: {
                collectionId,
                collectionName: collectionId ? nameOf(collectionId) : null,
              },
            },
        () => moveLinksAction({ ids, collectionId }),
        () => toast.success(`${n === 1 ? "Link movido" : `${n} links movidos`} para “${nameOf(collectionId)}”`, {
          action: { label: "Desfazer", onClick: async () => {
            for (const [destination, restoreIds] of previous) {
              const restored = await moveLinksAction({ ids: restoreIds, collectionId: destination });
              if (!restored.ok) { toast.error(restored.error); return; }
            }
            toast.success("Movimentação desfeita");
          } },
        }),
      );
      setSelected(new Set());
    },
    [items, current, scope, run, nameOf],
  );

  const archive = React.useCallback(
    (ids: string[], archived: boolean) => {
      const n = ids.length;
      run(
        { type: "remove", ids },
        () => bulkLinksAction({ op: "archive", ids, archived }),
        () =>
          toast.success(
            archived
              ? n === 1
                ? "Link arquivado"
                : `${n} links arquivados`
              : n === 1
                ? "Link restaurado"
                : `${n} links restaurados`,
            {
              action: {
                label: "Desfazer",
                onClick: () => {
                  bulkLinksAction({
                    op: "archive",
                    ids,
                    archived: !archived,
                  }).then((r) => !r.ok && toast.error(r.error));
                },
              },
            },
          ),
      );
      setSelected(new Set());
    },
    [run],
  );

  // Delete without a confirmation step: the links go to the trash right away;
  // "Desfazer" (or the Lixeira, for 30 days) brings them back.
  const remove = React.useCallback(
    (ids: string[]) => {
      const n = ids.length;
      setSelected(new Set());
      run({ type: "remove", ids }, () => bulkLinksAction({ op: "delete", ids }), () =>
        trashedToast(
          n === 1 ? "Link movido para a lixeira" : `${n} links movidos para a lixeira`,
          ids.map((id) => ({ type: "favorite" as const, id })),
          {
            description:
              n === 1
                ? "Fica lá por 30 dias. Enquanto isso, blocos de plans que apontam para ele não o encontram."
                : "Ficam lá por 30 dias. Enquanto isso, blocos de plans que apontam para eles não os encontram.",
            onUndone: () => router.refresh(),
          },
        ),
      );
    },
    [run, setSelected, router],
  );

  const star = React.useCallback(
    (link: LinkItem) =>
      new Promise<boolean | null>((resolve) =>
        startTransition(async () => {
          const removeFromView =
            !current && scope === "starred" && link.starred;
          apply(
            removeFromView
              ? { type: "remove", ids: [link.id] }
              : {
                  type: "patch",
                  ids: [link.id],
                  patch: { starred: !link.starred },
                },
          );
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
          const ids = visible.map((l) => l.id);
          const a = ids.indexOf(lastSelected.current);
          const b = ids.indexOf(id);
          if (a >= 0 && b >= 0) {
            ids
              .slice(Math.min(a, b), Math.max(a, b) + 1)
              .forEach((x) => next.add(x));
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
    [visible, setSelected],
  );

  const pin = React.useCallback(
    (link: LinkItem) =>
      startTransition(async () => {
        apply({
          type: "patch",
          ids: [link.id],
          patch: { pinned: !link.pinned },
        });
        const res = await togglePinLinkAction(link.id);
        if (!res.ok) toast.error(res.error);
        else
          toast.success(
            res.data?.pinned
              ? "Fixado no acesso rápido da Início"
              : "Removido do acesso rápido",
          );
      }),
    [apply],
  );

  const dropOnLink = React.useCallback(
    (dragIds: string[], targetId: string, pos: "before" | "after") => {
      const order = reorderLinks(items, dragIds, targetId, pos);
      if (!order || !order.moving.length) return;
      run({ type: "order", ids: order.ids }, () =>
        moveLinksAction({
          ids: order.moving,
          collectionId: current?.id ?? null,
          index: order.index,
        }),
      );
    },
    [items, run, current],
  );

  const bulkStar = React.useCallback(
    (ids: string[], on: boolean) => {
      run(
        { type: "patch", ids, patch: { starred: on } },
        () => bulkLinksAction({ op: "star", ids, on }),
        on ? "Favoritos atualizados" : "Estrelas removidas",
      );
    },
    [run],
  );
  const copyUrls = React.useCallback(
    async (ids: string[]) => {
      const targets = new Set(ids);
      const text = visible
        .filter((l) => targets.has(l.id))
        .map((l) => l.url)
        .join("\n");
      try {
        await navigator.clipboard.writeText(text);
        toast.success(ids.length === 1 ? "URL copiada" : "URLs copiadas");
      } catch {
        toast.error("Não foi possível copiar.");
      }
    },
    [visible],
  );
  React.useEffect(() => {
    const ids = new Set(visible.map((l) => l.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visible, setSelected]);
  const api: LibraryApi = React.useMemo(
    () => ({
      display,
      updateDisplay,
      addTags: (ids) => setTagIds(ids),
      bulkStar,
      copyUrls,
      inspect: (l) => navigate({ open: l.id }, { push: true }),
      canEdit,
      archivedScope,
      selection,
      toggleSelect,
      pin,
      highlight,
      tagColor: (t) => tagColors.get(t) ?? null,
      summaryFor: (l) =>
        (display.summary ?? summary) === "default"
          ? l.summaryBehavior
          : ((display.summary ?? summary) as Exclude<SummaryMode, "default">),
      reorderable,
      dropOnLink,
      star,
      edit: (l) => navigate({ open: l.id }, { push: true }),
      move: (ids) => setMoveIds(ids),
      archive,
      remove,
      filterTag: (t) => !activeTags.includes(t) && toggleTag(t),
      sortBy: changeSort,
      sort,
      checkLinks,
      applyRedirect: (link) => {
        if (!link.healthFinalUrl) return;
        const url = link.healthFinalUrl;
        const leaves = !current && scope === "broken";
        run(
          leaves
            ? { type: "remove", ids: [link.id] }
            : {
                type: "patch",
                ids: [link.id],
                patch: {
                  url,
                  domain: shortUrl(url).split("/")[0],
                  healthStatus: "ok",
                  healthFinalUrl: null,
                },
              },
          () => applyRedirectAction(link.id),
          `URL atualizada para ${shortUrl(url)}`,
        );
      },
    }),
    [
      changeSort,
      display,
      updateDisplay,
      bulkStar,
      copyUrls,
      canEdit,
      archivedScope,
      selection,
      toggleSelect,
      pin,
      highlight,
      tagColors,
      summary,
      reorderable,
      dropOnLink,
      star,
      archive,
      remove,
      activeTags,
      toggleTag,
      navigate,
      sort,
      checkLinks,
      current,
      scope,
      run,
    ],
  );

  keyCtx.current = { visible, api };

  // ---------------------------------------------------------------- collection operations
  const isInCurrent = (node: TreeNode) => {
    if (!current) return false;
    return current.id === node.id || current.path.some((p) => p.id === node.id);
  };
  const handlers: PanelHandlers = {
    newCollection: (parent) =>
      setColDialog({
        mode: "create",
        parent: parent ? { id: parent.id, name: parent.name } : null,
      }),
    edit: (node) => setColDialog({ mode: "edit", node }),
    rename: (node, name) =>
      run(null, () => updateCollectionAction(node.id, { name })),
    share: (node) => setShareNode(node),
    togglePin: (node) =>
      run(null, () =>
        togglePinCollectionAction(node.id).then((r) => {
          if (r.ok)
            toast.success(
              r.data?.pinned
                ? `“${node.name}” fixada na Início`
                : `“${node.name}” removida da Início`,
            );
          return r;
        }),
      ),
    archive: (node) => {
      const wasCurrent = isInCurrent(node);
      run(
        null,
        () => archiveCollectionAction(node.id, true),
        () => {
          toast.success(`Coleção “${node.name}” arquivada`, {
            action: {
              label: "Desfazer",
              onClick: () =>
                archiveCollectionAction(node.id, false).then(
                  (r) => !r.ok && toast.error(r.error),
                ),
            },
          });
          if (wasCurrent)
            router.push(node.parentId ? `/links?c=${node.parentId}` : "/links");
        },
      );
    },
    remove: (node) =>
      setConfirm({
        title: `Excluir “${node.name}”?`,
        description: node.totalCount ? (
          <>
            A coleção
            {node.children.length ? " e suas subcoleções vão" : " vai"} para a
            lixeira com {node.totalCount === 1 ? "o link" : `os ${node.totalCount} links`}{" "}
            que {node.totalCount === 1 ? "está" : "estão"} nela. Por 30 dias você
            restaura tudo de uma vez; se ela for excluída de vez, os links irão
            para{" "}
            <strong>
              {node.parentId ? nameOf(node.parentId) : "Sem coleção"}
            </strong>{" "}
            — nenhum link é perdido.
          </>
        ) : (
          <>
            A coleção
            {node.children.length ? " e suas subcoleções vão" : " vai"} para a
            lixeira. Por 30 dias você pode restaurá-la; depois disso, ela é
            excluída de vez.
          </>
        ),
        confirmLabel: "Mover para a lixeira",
        danger: true,
        run: async () => {
          const wasCurrent = isInCurrent(node);
          const ok = await run(
            null,
            () => deleteCollectionAction(node.id),
            () =>
              trashedToast(
                `Coleção “${node.name}” movida para a lixeira`,
                [{ type: "collection", id: node.id }],
                { onUndone: () => router.refresh() },
              ),
          );
          if (ok && wasCurrent)
            router.push(node.parentId ? `/links?c=${node.parentId}` : "/links");
        },
      }),
    chooseCollectionDestination: (node) => setCollectionToMove(node),
    moveCollection: (id, parentId, index) =>
      run(null, () => moveCollectionAction({ id, parentId, index })),
    moveLinks,
    tagHref,
    checkHealth: (node) =>
      runHealth({ collectionId: node?.id ?? null, name: node?.name }),
    renameSaved: async (s) => {
      const name = await ask.prompt({
        title: "Renomear busca",
        label: "Nome",
        initial: s.name,
        confirmLabel: "Renomear",
      });
      if (name && name !== s.name)
        run(null, () => updateSavedSearchAction(s.id, { name }));
    },
    deleteSaved: async (s) => {
      const ok = await ask.confirm({
        title: `Excluir “${s.name}”?`,
        description:
          "Só a busca salva é excluída — os links continuam onde estão.",
        confirmLabel: "Excluir",
        danger: true,
      });
      if (!ok) return;
      const was = savedSearch?.id === s.id;
      run(
        null,
        () => deleteSavedSearchAction(s.id),
        () => {
          toast.success("Busca excluída");
          if (was) navigate({ saved: null });
        },
      );
    },
  };

  const saveSearch = async () => {
    const query = (filterRef.current?.value ?? q).trim();
    if (!query) return;
    const name = await ask.prompt({
      title: "Salvar busca",
      description:
        "Ela aparece na barra lateral e se atualiza sozinha com os links que combinarem.",
      label: "Nome",
      initial:
        query
          .replace(/\b[a-z]+:/g, "")
          .replace(/["#]/g, "")
          .trim()
          .slice(0, 40) || "Minha busca",
      confirmLabel: "Salvar",
    });
    if (!name) return;
    const res = await createSavedSearchAction({
      name,
      query,
      sort: sp.get("sort"),
    });
    if (!res.ok) return void toast.error(res.error);
    toast.success(`“${name}” salva na barra lateral`);
    navigate({ q: query, saved: res.data!.id });
  };

  const updateSaved = () => {
    if (!savedSearch) return;
    const query = (filterRef.current?.value ?? q).trim();
    run(
      null,
      () =>
        updateSavedSearchAction(savedSearch.id, {
          query,
          sort: sp.get("sort"),
        }),
      "Busca salva atualizada",
    );
  };

  const currentNode = current;
  const copy = savedSearch
    ? {
        title: savedSearch.name,
        subtitle: `Busca salva · ${savedSearch.query}`,
      }
    : SCOPE_COPY[scope];
  const pinnedSet = React.useMemo(() => new Set(props.pinned), [props.pinned]);
  const previewNav = React.useMemo(() => {
    const at = openId ? visible.findIndex((l) => l.id === openId) : -1;
    if (at < 0) return undefined;
    return {
      prev: visible[at - 1]?.id ?? null,
      next: visible[at + 1]?.id ?? null,
      index: at,
      total: visible.length,
      go: (id: string) => navigate({ open: id }),
    };
  }, [openId, visible, navigate]);
  const childrenOf = React.useCallback(
    (id: string | null) =>
      id ? (flat.find((n) => n.id === id)?.children ?? []) : tree,
    [flat, tree],
  );
  const collectionNames = React.useMemo(() => flat.map((n) => n.name), [flat]);
  const domains = React.useMemo(() => {
    const count = new Map<string, number>();
    for (const l of links)
      if (l.domain) count.set(l.domain, (count.get(l.domain) ?? 0) + 1);
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([d]) => d.replace(/^www\./, ""));
  }, [links]);

  // ---------------------------------------------------------------- render
  const sortOptions: SortMode[] = SORT_MODES.filter(
    (s) => s !== "manual" || !!current || scope === "unsorted",
  );
  const empty =
    scope === "shared" && !current
      ? sharedCollections.length === 0
      : visible.length === 0;

  return (
    <LibraryContext.Provider value={api}>
      <LinkOpenerProvider
        onPreview={(id) => navigate({ open: id }, { push: true })}
      >
        <div className="flex min-h-0 flex-1">
          <CollectionsPanel
            className="max-md:hidden"
            tree={tree}
            currentId={current?.id ?? null}
            scope={scope}
            counts={counts}
            tags={tags}
            activeTags={activeTags}
            pinned={pinnedSet}
            canEdit={canEdit}
            handlers={handlers}
            saved={saved}
            savedId={savedSearch?.id ?? null}
          />
          <D.Root open={drawer} onOpenChange={setDrawer}>
            <D.Portal>
              <D.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out md:hidden" />
              <D.Content
                aria-describedby={undefined}
                onOpenAutoFocus={(e) => {
                  // focus the panel itself: avoids popping the first button's tooltip on open
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).focus();
                }}
                className="fixed inset-y-0 left-0 z-50 flex w-[min(300px,86vw)] flex-col bg-surface-2 shadow-pop outline-none data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out md:hidden"
                onClickCapture={(e) => {
                  // any link inside (scope, collection, tag) navigates: close right away
                  if ((e.target as HTMLElement).closest("a[href]"))
                    setDrawer(false);
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
                  pinned={pinnedSet}
                  canEdit={canEdit}
                  saved={saved}
                  savedId={savedSearch?.id ?? null}
                  handlers={{
                    ...handlers,
                    newCollection: (p) => (
                      setDrawer(false),
                      handlers.newCollection(p)
                    ),
                    edit: (n) => (setDrawer(false), handlers.edit(n)),
                    share: (n) => (setDrawer(false), handlers.share(n)),
                    remove: (n) => (setDrawer(false), handlers.remove(n)),
                    checkHealth: (n) => (
                      setDrawer(false),
                      handlers.checkHealth(n)
                    ),
                  }}
                />
              </D.Content>
            </D.Portal>
          </D.Root>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <main
                ref={scrollRef}
                className="scrollbar-thin relative min-w-0 flex-1 overflow-y-auto"
                onDragOver={(e) => {
                  if (
                    !canEdit ||
                    getDrag() ||
                    !e.dataTransfer.types.includes("text/uri-list")
                  )
                    return;
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
                  const url = extractUrl(
                    e.dataTransfer.getData("text/uri-list").split("\n")[0] ??
                      "",
                  );
                  if (!url) return;
                  e.preventDefault();
                  openAdd(url);
                }}
              >
                {externalOver && (
                  <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/70 text-sm font-medium text-accent-ink">
                    Solte para adicionar o link
                    {current ? ` em “${current.name}”` : ""}
                  </div>
                )}
                <div className="mx-auto flex max-w-[1480px] flex-col gap-[18px] px-4 py-5 sm:gap-[22px] sm:px-6 sm:py-7 lg:px-10">
                  <LibraryHeader
                    current={currentNode}
                    title={copy.title}
                    subtitle={copy.subtitle}
                    canEdit={canEdit}
                    pending={pending}
                    onRename={(name) =>
                      current && handlers.rename(current, name)
                    }
                    onDescribe={(d) =>
                      current &&
                      run(null, () =>
                        updateCollectionAction(current.id, {
                          description: d || null,
                        }),
                      )
                    }
                    onShare={() => current && setShareNode(current)}
                    onEdit={() =>
                      current && setColDialog({ mode: "edit", node: current })
                    }
                    onNewSub={() => current && handlers.newCollection(current)}
                    onTogglePin={() => current && handlers.togglePin(current)}
                    onArchive={() => current && handlers.archive(current)}
                    onDelete={() => current && handlers.remove(current)}
                    onCheckHealth={() => handlers.checkHealth(current)}
                    onEnrich={() =>
                      enrich({
                        collectionId: current?.id ?? null,
                        name: current?.name,
                      })
                    }
                    childrenOf={childrenOf}
                    onDuplicates={() => setDupesOpen(true)}
                    onOpenCollections={() => setDrawer(true)}
                    onAdd={() => openAdd()}
                  />

                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        data-tour="links-batch"
                        size="sm"
                        variant="secondary"
                        onClick={() => setBatchText("")}
                      >
                        <ClipboardPaste />
                        Adicionar vários links
                      </Button>
                      <span className="text-caption text-muted">
                        Coleções guardam os links · tags identificam assuntos ·
                        buscas salvas agrupam automaticamente
                      </span>
                    </div>
                  )}
                  {!(scope === "shared" && !current) && (
                    <div className="flex flex-col gap-3">
                      <Toolbar
                        q={q}
                        onQuery={onQuery}
                        onLiveQuery={setLiveQ}
                        filterRef={filterRef}
                        placeholder={
                          current
                            ? "Filtrar nesta coleção… (tag:, site:, is:)"
                            : "Filtrar links… (tag:, site:, in:, is:)"
                        }
                        activeTags={activeTags}
                        tags={tags}
                        collections={collectionNames}
                        domains={domains}
                        onSaveSearch={
                          savedSearch && savedSearch.query === q.trim()
                            ? undefined
                            : saveSearch
                        }
                        onToggleTag={toggleTag}
                        sort={sort}
                        sortOptions={sortOptions}
                        onSort={changeSort}
                        summary={display.summary ?? summary}
                        onSummary={(s) => {
                          updateDisplay({ summary: s });
                          setSummary(s);
                          setPref(PREF_SUMMARY, s);
                        }}
                        view={view}
                        onView={(v) => {
                          updateDisplay({ view: v });
                          if (!current) {
                            setViewCookie(v);
                            setStoredView(v);
                          }
                          navigate({ view: v });
                        }}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-caption text-muted"
                          aria-live="polite"
                        >
                          <ResultCount
                            n={visible.length}
                            more={more.hasMore}
                            deep={filtering}
                          />
                          {selected.size > 0 &&
                            ` · ${selected.size} selecionados`}
                        </span>
                        <LibraryDisplayOptions
                          settings={display}
                          onChange={updateDisplay}
                          summary={display.summary ?? summary}
                          onSummary={(s) => {
                            updateDisplay({ summary: s });
                            setSummary(s);
                            setPref(PREF_SUMMARY, s);
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {!current &&
                    scope === "inbox" &&
                    canEdit &&
                    visible.length > 0 && (
                      <div className="-mt-1 flex flex-wrap items-center gap-3 rounded-card border border-accent-line bg-accent-soft/50 px-4 py-3">
                        <span className="inline-flex size-9 items-center justify-center rounded-control bg-accent text-white">
                          <Inbox className="size-[18px]" aria-hidden />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-body font-semibold text-accent-ink">
                            {visible.length}{" "}
                            {visible.length === 1
                              ? "link esperando"
                              : "links esperando"}
                          </span>
                          <span className="text-caption text-muted">
                            Um de cada vez: 1–9 move para a coleção sugerida, ↵
                            deixa como está, a arquiva.
                          </span>
                        </span>
                        <Button
                          variant="primary"
                          onClick={() => setTriageOpen(true)}
                        >
                          Triar agora
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            run(
                              { type: "remove", ids: visible.map((l) => l.id) },
                              () => markTriagedAction(visible.map((l) => l.id)),
                              "Caixa de entrada limpa",
                            )
                          }
                        >
                          Marcar tudo como visto
                        </Button>
                      </div>
                    )}

                  {savedSearch &&
                    savedSearch.query !== q.trim() &&
                    q.trim() && (
                      <div className="-mt-1 flex animate-in flex-wrap items-center gap-2 rounded-control border border-accent-line bg-accent-soft/60 px-3 py-2 text-body text-accent-ink">
                        <span className="flex-1">
                          A busca mudou desde que foi salva.
                        </span>
                        <Button size="sm" variant="soft" onClick={updateSaved}>
                          Atualizar “{savedSearch.name}”
                        </Button>
                      </div>
                    )}

                  {current && (current.children.length > 0 || canEdit) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {current.children.length > 0 && (
                        <span className="mr-1 text-xs text-muted">
                          Subcoleções
                        </span>
                      )}
                      {current.children.map((c) => (
                        <Link
                          key={c.id}
                          href={`/links?c=${c.id}`}
                          className="inline-flex h-8 items-center gap-2 rounded-control border border-line bg-surface px-3 text-body hover:bg-surface-2"
                        >
                          <CollectionGlyph icon={c.icon} color={c.color} />
                          <span>{c.name}</span>
                          <span className="text-xs text-muted">
                            {c.totalCount}
                          </span>
                        </Link>
                      ))}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handlers.newCollection(current)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-control border border-dashed border-line-2 px-3 text-body text-muted hover:border-ink-2 hover:text-ink"
                        >
                          <FolderPlus className="size-[15px]" aria-hidden />
                          Subcoleção
                        </button>
                      )}
                      <span
                        className="ml-auto text-xs text-muted"
                        aria-live="polite"
                      >
                        <ResultCount
                          n={visible.length}
                          more={more.hasMore}
                          deep={filtering}
                        />
                      </span>
                    </div>
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
                    <>
                      <LinkViews links={visible} view={view} />
                      {more.hasMore && <LoadMore onVisible={loadMore} />}
                    </>
                  )}
                  {reorderable && visible.length > 1 && (
                    <p className="text-center text-xs text-muted">
                      Arraste os links para reordenar ou solte-os em uma coleção
                      na barra lateral.
                    </p>
                  )}
                </div>
              </main>
            </ContextMenuTrigger>
            <ContextMenuContent>
              {canEdit && (
                <>
                  <ContextMenuItem onSelect={() => openAdd()}>
                    <Plus />
                    Adicionar link
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => setBatchText("")}>
                    <ClipboardPaste />
                    Adicionar vários links
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        const batch = parseBatchUrls(text);
                        if (
                          batch.urls.length === 1 &&
                          !text.trim().includes("\n")
                        )
                          openAdd(batch.urls[0]);
                        else setBatchText(text);
                      } catch {
                        toast.error(
                          "Não foi possível ler a área de transferência. Use Adicionar vários links.",
                        );
                      }
                    }}
                  >
                    <ClipboardPaste />
                    Colar URLs
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => handlers.newCollection(current)}
                  >
                    <FolderPlus />
                    Nova coleção
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                </>
              )}
              <ContextMenuItem
                onSelect={() => {
                  updateDisplay({ view: "list" });
                  navigate({ view: "list" });
                }}
              >
                Visualizar como lista
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  updateDisplay({ view: "cards" });
                  navigate({ view: "cards" });
                }}
              >
                Visualizar como cards
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => changeSort("title")}>
                <ArrowDownUp />
                Ordenar por título
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>

        {canEdit && (
          <BulkBar
            onCopy={() => copyUrls([...selected])}
            count={selected.size}
            archivedScope={archivedScope}
            tags={tags}
            allSelected={selected.size === visible.length}
            onSelectAll={() => setSelected(new Set(visible.map((l) => l.id)))}
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
            onCheck={() => checkLinks([...selected])}
            selectedTags={[
              ...new Set(
                visible
                  .filter((l) => selected.has(l.id))
                  .flatMap((l) => l.tags),
              ),
            ].sort()}
            onRemoveTag={(tag) => {
              const ids = [...selected];
              run(
                { type: "removeTag", ids, tag },
                () => bulkLinksAction({ op: "removeTag", ids, tag }),
                `#${tag} removida`,
              );
            }}
            onStar={(on) => {
              const ids = [...selected];
              run(
                { type: "patch", ids, patch: { starred: on } },
                () => bulkLinksAction({ op: "star", ids, on }),
                on ? "Estrelas adicionadas" : "Estrelas removidas",
              );
            }}
            onOpenBehavior={(value) => {
              const ids = [...selected];
              run(
                { type: "patch", ids, patch: { openBehavior: value } },
                () => bulkLinksAction({ op: "openBehavior", ids, value }),
                "Comportamento ao abrir atualizado",
              );
            }}
            onDelete={() => remove([...selected])}
            onClear={() => setSelected(new Set())}
          />
        )}
        {canEdit && (
          <MoveDialog
            ids={moveIds}
            tree={tree}
            onClose={() => setMoveIds(null)}
            onMove={moveLinks}
          />
        )}
        {canEdit && (
          <BatchLinksDialog
            initial={batchText}
            collectionId={current?.id ?? null}
            tree={tree}
            tags={tags}
            onClose={() => setBatchText(null)}
            onSaved={(ids, collectionId, shouldEnrich) => {
              if (shouldEnrich)
                void enrich({ ids, collectionId, name: nameOf(collectionId) });
            }}
          />
        )}
        {canEdit && (
          <TagBatchDialog
            ids={tagIds}
            tags={tags}
            existing={[
              ...new Set(
                items
                  .filter((l) => tagIds?.includes(l.id))
                  .flatMap((l) => l.tags),
              ),
            ]}
            onClose={() => setTagIds(null)}
            onApply={(ids, add, remove) =>
              run(
                { type: "tags", ids, add, remove },
                () => bulkLinksAction({ op: "tags", ids, add, remove }),
                "Tags atualizadas",
              )
            }
          />
        )}
        <D.Root
          open={!!collectionToMove}
          onOpenChange={(o) => !o && setCollectionToMove(null)}
        >
          <D.Portal>
            <D.Overlay className="fixed inset-0 z-50 bg-scrim" />
            <D.Content
              aria-describedby={undefined}
              className="fixed left-1/2 top-1/2 z-50 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-line bg-surface p-4 shadow-pop"
            >
              <D.Title className="mb-3 text-lead font-semibold">
                Mover coleção “{collectionToMove?.name}”
              </D.Title>
              <CollectionList
                tree={tree}
                noneLabel="Raiz da biblioteca"
                exclude={
                  new Set(
                    collectionToMove
                      ? [
                          collectionToMove.id,
                          ...flatNodesClient(collectionToMove.children).map(
                            (n) => n.id,
                          ),
                        ]
                      : [],
                  )
                }
                onSelect={async (parentId) => {
                  if (!collectionToMove) return;
                  if (
                    await run(
                      null,
                      () =>
                        moveCollectionAction({
                          id: collectionToMove.id,
                          parentId,
                        }),
                      "Coleção movida",
                    )
                  )
                    setCollectionToMove(null);
                }}
              />
              <D.Close asChild>
                <Button variant="ghost" className="mt-2">
                  Cancelar
                </Button>
              </D.Close>
            </D.Content>
          </D.Portal>
        </D.Root>
        <LinkPreview
          tree={tree}
          tags={tags}
          linkId={openId}
          initial={items.find((l) => l.id === openId)}
          onClose={() => navigate({ open: null })}
          onEdit={(l) => setLinkDialog({ mode: "edit", link: l })}
          onToggleStar={star}
          nav={previewNav}
        />
        {canEdit && (
          <LinkDialog
            state={linkDialog}
            onClose={() => setLinkDialog(null)}
            tree={tree}
            tags={tags}
          />
        )}
        {canEdit && (
          <CollectionDialog
            state={colDialog}
            onClose={() => setColDialog(null)}
            onCreated={(id) => router.push(`/links?c=${id}`)}
          />
        )}
        {canEdit && (
          <ShareDialog
            node={shareNode}
            initialToken={
              shareNode && current?.id === shareNode.id
                ? current.shareToken
                : null
            }
            onClose={() => setShareNode(null)}
          />
        )}
        <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
        {canEdit && (
          <DuplicatesDialog
            open={dupesOpen}
            onClose={() => setDupesOpen(false)}
          />
        )}
        {canEdit && (
          <TriageDialog
            open={triageOpen}
            onClose={() => setTriageOpen(false)}
            links={visible}
            tree={tree}
            handlers={{
              file: (l, collectionId) => moveLinks([l.id], collectionId),
              archive: (l) => archive([l.id], true),
              done: (l) =>
                void run({ type: "remove", ids: [l.id] }, () =>
                  markTriagedAction([l.id]),
                ),
              star,
            }}
          />
        )}
      </LinkOpenerProvider>
    </LibraryContext.Provider>
  );
}

function ResultCount({ n, more, deep }: { n: number; more: boolean; deep: boolean }) {
  return (
    <>
      {n}
      {more ? "+" : ""} {n === 1 && !more ? "link" : "links"}
      {deep ? " (incluindo subcoleções)" : ""}
    </>
  );
}

/** Sentinel that asks for the next page when it scrolls into view. */
function LoadMore({ onVisible }: { onVisible: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onVisible(), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible]);
  return (
    <div ref={ref} className="flex justify-center py-4" role="status" aria-label="Carregando mais links">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-accent" />
    </div>
  );
}

function SharedGrid({ nodes }: { nodes: TreeNode[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
      {nodes.map((n) => (
        <Link
          key={n.id}
          href={`/links?c=${n.id}`}
          className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-raise"
        >
          <div className="flex items-center gap-3">
            <CollectionTile icon={n.icon} color={n.color} size={32} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-lead font-semibold">{n.name}</span>
              <span className="text-xs text-muted">
                {n.totalCount} {n.totalCount === 1 ? "link" : "links"}
              </span>
            </div>
          </div>
          {n.description && <p className="line-clamp-2 text-body leading-[19px] text-ink-2">{n.description}</p>}
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-accent-soft px-2 py-0.5 text-caption font-medium text-accent-ink">
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
          <p className="font-display font-semibold text-[24px] leading-tight">Sua biblioteca começa aqui</p>
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
    inbox: { icon: <Inbox />, title: "Caixa de entrada vazia", description: "Links salvos pela extensão (sem coleção) chegam aqui para você organizar com calma." },
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

// ------------------------------------------------------------------ keyboard navigation of the list

const primaryOf = (id: string) => document.querySelector<HTMLElement>(`[data-link-primary="${CSS.escape(id)}"]`);

function focusedLinkId(): string | null {
  return (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-link-primary]")?.dataset.linkPrimary ?? null;
}

/** Nearest item in a direction, by on-screen geometry (works for grid, compact and list). */
function neighbor(ids: string[], fromId: string, dir: "up" | "down"): string | null {
  const from = primaryOf(fromId)?.getBoundingClientRect();
  if (!from) return null;
  let best: { id: string; score: number } | null = null;
  for (const id of ids) {
    if (id === fromId) continue;
    const r = primaryOf(id)?.getBoundingClientRect();
    if (!r) continue;
    const dy = dir === "down" ? r.top - from.bottom : from.top - r.bottom;
    if (dy < -4) continue;
    const score = Math.max(dy, 0) * 4 + Math.abs(r.left - from.left);
    if (!best || score < best.score) best = { id, score };
  }
  return best?.id ?? null;
}

function focusLink(id: string) {
  const el = primaryOf(id);
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/**
 * j/k (and arrows once a link has focus) move between links; x s p e o # act on the
 * focused one. Returns true when the key was handled.
 */
function handleListKey(
  e: KeyboardEvent,
  visible: LinkItem[],
  api: LibraryApi | null,
): boolean {
  if (!api || !visible.length) return false;
  const ids = visible.map((l) => l.id);
  const current = focusedLinkId();
  const at = current ? ids.indexOf(current) : -1;
  const move = (id: string | null | undefined) => {
    if (!id) return true;
    e.preventDefault();
    focusLink(id);
    return true;
  };
  switch (e.key) {
    case "j":
      return move(ids[Math.min(at + 1, ids.length - 1)]);
    case "k":
      return move(ids[Math.max(at - 1, 0)]);
    case "ArrowRight":
      return at >= 0 && move(ids[Math.min(at + 1, ids.length - 1)]);
    case "ArrowLeft":
      return at >= 0 && move(ids[Math.max(at - 1, 0)]);
    case "ArrowDown":
      return at >= 0 && move(neighbor(ids, ids[at], "down"));
    case "ArrowUp":
      return at >= 0 && move(neighbor(ids, ids[at], "up"));
  }
  if (at < 0) return false;
  const link = visible[at];
  switch (e.key) {
    case "x":
      if (!api.canEdit) return false;
      api.toggleSelect(link.id);
      break;
    case "s":
      if (api.selection.get().has(link.id) && api.selection.get().size > 1)
        api.bulkStar([...api.selection.get()], true);
      else void api.star(link);
      break;
    case "p":
      api.pin(link);
      break;
    case "m":
      if (!api.canEdit) return false;
      api.move(
        api.selection.get().has(link.id) ? [...api.selection.get()] : [link.id],
      );
      break;
    case "e":
      if (!api.canEdit) return false;
      api.edit(link);
      break;
    case "o":
      window.open(link.url, "_blank", "noopener,noreferrer");
      fetch(`/api/links/${link.id}/open`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
      break;
    case "#":
      if (!api.canEdit) return false;
      api.archive([link.id], !link.archived);
      // keep the keyboard flow going on the next link
      setTimeout(() => focusLink(ids[at + 1] ?? ids[at - 1]), 50);
      break;
    default:
      return false;
  }
  e.preventDefault();
  return true;
}
