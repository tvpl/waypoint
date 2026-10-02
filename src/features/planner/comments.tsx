"use client";
/**
 * Comments UI: data hook (load + light polling + mutations), the side panel
 * (threads grouped "No plan" / per node, composer with @mentions, replies,
 * resolve/reopen) and the toggle button with the unresolved count.
 *
 * Shared by Edit Mode and View Mode. Permissions are enforced server-side in
 * comment-actions.ts; the UI only hides affordances that would be refused.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AtSign, Check, CornerDownRight, Ellipsis, Loader2, MessageSquare, MessagesSquare, Pencil, RotateCcw, SendHorizontal, Trash2, X } from "lucide-react";
import { countComments, splitMentions, toThreads, type CommentThread, type CommentView } from "@/domain/comments";
import { COMMENT_MAX_LENGTH } from "@/domain/comments";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/menu";
import { cn, formatDateTime, scrollBehavior, timeAgo } from "@/lib/utils";
import {
  createCommentAction,
  deleteCommentAction,
  editCommentAction,
  loadCommentsAction,
  resolveCommentAction,
  type CommentsSnapshot,
} from "./comment-actions";
import { KIND_LABEL } from "./defaults";
import { Switch } from "./switch";
import type { NodeKind } from "@/domain/plan";

const POLL_MS = 20_000;

// ------------------------------------------------------------------ data

export type CommentsStore = ReturnType<typeof useComments>;

export function useComments({ planId, token, enabled, open }: { planId: string; token?: string | null; enabled: boolean; open: boolean }) {
  const [snapshot, setSnapshot] = useState<CommentsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || inflight.current) return;
    inflight.current = true;
    setLoading(true);
    try {
      const r = await loadCommentsAction(planId, token ?? null);
      if (r.ok) {
        setSnapshot(r.snapshot);
        setError(null);
      } else setError(r.error);
    } catch {
      setError("Não foi possível carregar os comentários.");
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [enabled, planId, token]);

  // first load (badges need it even with the panel closed)
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // light polling while the panel is open; otherwise refresh when the tab comes back
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const t = open ? setInterval(() => document.visibilityState === "visible" && void refresh(), POLL_MS) : null;
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      if (t) clearInterval(t);
    };
  }, [enabled, open, refresh]);

  const apply = useCallback(<T extends { ok: true; snapshot: CommentsSnapshot }>(r: T | { ok: false; error: string }) => {
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    setSnapshot(r.snapshot);
    return true;
  }, []);

  const create = useCallback(
    async (input: { body: string; nodeId?: string | null; parentId?: string | null }) => apply(await createCommentAction(planId, token ?? null, input)),
    [apply, planId, token],
  );
  const edit = useCallback(async (id: string, body: string) => apply(await editCommentAction(planId, token ?? null, id, body)), [apply, planId, token]);
  const remove = useCallback(async (id: string) => apply(await deleteCommentAction(planId, token ?? null, id)), [apply, planId, token]);
  const resolve = useCallback(
    async (id: string, resolved: boolean) => apply(await resolveCommentAction(planId, token ?? null, id, resolved)),
    [apply, planId, token],
  );

  const counts = useMemo(() => countComments(snapshot?.comments ?? []), [snapshot]);

  return { snapshot, error, loading, counts, refresh, create, edit, remove, resolve };
}

/** Open/close state of the panel plus the node it was opened on. */
export function useCommentsPanel() {
  const [state, setState] = useState<{ open: boolean; nodeId: string | null; seq: number }>({ open: false, nodeId: null, seq: 0 });
  const openPanel = useCallback((nodeId: string | null = null) => setState((s) => ({ open: true, nodeId, seq: s.seq + 1 })), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const toggle = useCallback(() => setState((s) => ({ open: !s.open, nodeId: null, seq: s.seq + 1 })), []);
  return { ...state, openPanel, close, toggle };
}

// ------------------------------------------------------------------ toggle

export function CommentsToggle({ count, open, onClick, className }: { count: number; open: boolean; onClick: () => void; className?: string }) {
  const label = count ? `Comentários (${count} ${count === 1 ? "aberto" : "abertos"})` : "Comentários";
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={open}
        data-comments-toggle
        onClick={onClick}
        className={cn(
          "relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-hover hover:text-ink [&_svg]:size-4",
          open && "bg-accent-soft text-accent-ink hover:bg-accent-soft hover:text-accent-ink",
          className,
        )}
      >
        <MessageSquare />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-micro font-semibold leading-none text-white ring-2 ring-surface">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

// ------------------------------------------------------------------ avatars

const TINTS = [
  ["#DCE2FB", "#2440B8"],
  ["#DDF4EE", "#0F6E5C"],
  ["#FFEADB", "#A84A0F"],
  ["#EFE9FF", "#5B3FC4"],
  ["#FDE7EF", "#A3245A"],
  ["#E6F1FB", "#1D5E93"],
];

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase() || "?";
}

function tintFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

function Avatar({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  const [bg, fg] = tintFor(id);
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold" style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.38) }}>
      {initialsOf(name)}
    </span>
  );
}

// ------------------------------------------------------------------ body with mentions

function Body({ text, names }: { text: string; names: string[] }) {
  const parts = useMemo(() => splitMentions(text, names), [text, names]);
  return (
    <p className="whitespace-pre-wrap break-words text-body leading-[19px] text-ink">
      {parts.map((p, i) =>
        p.mention ? (
          <span key={i} className="rounded-[4px] bg-accent-soft px-0.5 font-medium text-accent-ink">
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

// ------------------------------------------------------------------ composer with @mentions

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type Person = { id: string; name: string };

/** Mention query right before the caret: "@ana" → "ana" (null when not mentioning). */
function mentionQuery(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/[\s(\["'“]/.test(before[at - 1])) return null;
  const q = before.slice(at + 1);
  if (q.length > 40 || /[\n@]/.test(q) || /\s{2}/.test(q)) return null;
  return { start: at, query: q };
}

function MentionTextarea({
  value,
  onChange,
  onSubmit,
  onCancel,
  people,
  placeholder,
  autoFocus,
  label,
  rows = 2,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  people: Person[];
  placeholder?: string;
  autoFocus?: boolean;
  label: string;
  rows?: number;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? own;
  const listId = useId();
  const [m, setM] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (!m) return [];
    const q = norm(m.query.trim());
    return people.filter((p) => !q || norm(p.name).split(/\s+/).some((w) => w.startsWith(q)) || norm(p.name).startsWith(q)).slice(0, 6);
  }, [m, people]);
  const showList = !!m && matches.length > 0;

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, ref]);

  // grow with the content (up to a limit)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value, ref]);

  const sync = (el: HTMLTextAreaElement) => {
    const next = mentionQuery(el.value, el.selectionStart ?? el.value.length);
    setM(next);
    if (!next || next.query !== m?.query) setActive(0);
  };

  const pick = (p: Person) => {
    const el = ref.current;
    if (!el || !m) return;
    const caret = el.selectionStart ?? value.length;
    const insert = `@${p.name} `;
    const next = value.slice(0, m.start) + insert + value.slice(caret);
    onChange(next);
    setM(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = m.start + insert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        maxLength={COMMENT_MAX_LENGTH}
        aria-label={label}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          sync(e.target);
        }}
        onSelect={(e) => sync(e.currentTarget)}
        onBlur={() => setTimeout(() => setM(null), 120)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (showList) {
            if (e.key === "ArrowDown") return (e.preventDefault(), setActive((a) => (a + 1) % matches.length));
            if (e.key === "ArrowUp") return (e.preventDefault(), setActive((a) => (a - 1 + matches.length) % matches.length));
            if ((e.key === "Enter" && !e.metaKey && !e.ctrlKey) || e.key === "Tab") return (e.preventDefault(), pick(matches[active]));
            if (e.key === "Escape") return (e.preventDefault(), setM(null));
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          } else if (e.key === "Escape" && onCancel) {
            e.preventDefault();
            onCancel();
          }
        }}
        className="block max-h-[220px] min-h-[38px] w-full resize-none rounded-control border border-line-2 bg-surface px-3 py-2 text-body leading-[19px] text-ink outline-none transition-[border,box-shadow] placeholder:text-muted focus:border-accent focus:ring-3 focus:ring-accent/15"
      />
      {showList && (
        <ul id={listId} role="listbox" aria-label="Mencionar" className="absolute bottom-full left-0 z-30 mb-1.5 w-full max-w-[260px] overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop animate-in">
          {matches.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-body", i === active && "bg-accent-soft text-accent-ink")}
            >
              <Avatar id={p.id} name={p.name} size={20} />
              <span className="truncate">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ panel

export type CommentNodeInfo = { id: string; title: string; kind: string };

export function CommentsPanel({
  store,
  target,
  onClose,
  nodes,
  onSelectNode,
  className,
}: {
  store: CommentsStore;
  /** Node the panel was opened on (seq changes on each request). */
  target: { nodeId: string | null; seq: number };
  onClose: () => void;
  nodes: CommentNodeInfo[];
  onSelectNode?: (id: string) => void;
  className?: string;
}) {
  const snap = store.snapshot;
  const [showResolved, setShowResolved] = useState(false);
  const [composeNode, setComposeNode] = useState<string | null>(target.nodeId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [, tick] = useState(0);
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const labelOf = useCallback(
    (id: string) => {
      const n = nodeById.get(id);
      if (!n) return "Elemento removido";
      return n.title.trim() || KIND_LABEL[n.kind as NodeKind] || "Elemento";
    },
    [nodeById],
  );

  // relative timestamps stay fresh
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // focus management: remember the opener, move focus in, give it back on unmount
  useEffect(() => {
    opener.current = (document.activeElement as HTMLElement | null) ?? null;
    return () => {
      const back = opener.current;
      if (back && document.contains(back)) back.focus();
      else document.querySelector<HTMLElement>("[data-comments-toggle]")?.focus();
    };
  }, []);

  // opened on a node: compose there, reveal its threads
  useEffect(() => {
    setComposeNode(target.nodeId);
    const t = setTimeout(() => {
      if (target.nodeId) {
        const group = listRef.current?.querySelector<HTMLElement>(`[data-node-group="${CSS.escape(target.nodeId)}"]`);
        group?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
        composerRef.current?.focus();
      } else panelRef.current?.querySelector<HTMLElement>("[data-panel-title]")?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [target.nodeId, target.seq]);

  const threads = useMemo(() => toThreads(snap?.comments ?? []), [snap]);
  const resolvedCount = threads.filter((t) => t.root.resolvedAt).length;
  const visible = threads.filter((t) => showResolved || !t.root.resolvedAt);
  const names = useMemo(() => [...new Set([...(snap?.people ?? []).map((p) => p.name), ...threads.flatMap((t) => [t.root, ...t.replies].map((c) => c.author.name))])], [snap, threads]);

  const groups = useMemo(() => {
    const order = new Map(nodes.map((n, i) => [n.id, i]));
    const map = new Map<string, CommentThread[]>();
    for (const t of visible) {
      const k = t.root.nodeId ?? "";
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (!a) return -1;
      if (!b) return 1;
      return (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9);
    });
  }, [visible, nodes]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const ok = await store.create({ body, nodeId: composeNode });
    setSending(false);
    if (ok) {
      setDraft("");
      requestAnimationFrame(() => {
        const key = composeNode ?? "";
        const group = listRef.current?.querySelector<HTMLElement>(`[data-node-group="${CSS.escape(key)}"]`);
        group?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
      });
    }
  };

  return (
    <aside
      ref={panelRef}
      aria-labelledby={titleId}
      data-planner-panel
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          onClose();
        }
      }}
      className={cn("flex w-[340px] max-w-full shrink-0 flex-col overflow-hidden border-l border-line bg-surface text-ink", className)}
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 id={titleId} data-panel-title tabIndex={-1} className="flex-1 text-lead font-semibold outline-none">
          Comentários
          {store.counts.unresolvedThreads > 0 && (
            <span className="ml-1.5 text-body font-normal text-muted">
              {store.counts.unresolvedThreads} {store.counts.unresolvedThreads === 1 ? "aberto" : "abertos"}
            </span>
          )}
        </h2>
        {store.loading && <Loader2 className="size-3.5 animate-spin text-muted" aria-label="Atualizando" />}
        <Button variant="ghost" size="icon-sm" aria-label="Fechar comentários" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 text-[12px] text-ink-2">
        <label htmlFor={`${titleId}-res`} className="cursor-pointer select-none">
          Mostrar resolvidos{resolvedCount > 0 && <span className="text-muted"> ({resolvedCount})</span>}
        </label>
        <Switch id={`${titleId}-res`} checked={showResolved} onChange={setShowResolved} />
      </div>

      <div ref={listRef} className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        {!snap && store.error && <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-body text-muted">{store.error}</p>}
        {!snap && !store.error && (
          <div className="flex flex-1 items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted" aria-label="Carregando comentários" />
          </div>
        )}
        {snap && groups.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
              <MessagesSquare className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">{resolvedCount && !showResolved ? "Tudo resolvido" : "Nenhum comentário ainda"}</p>
              <p className="text-body leading-5 text-muted">
                {resolvedCount && !showResolved ? "Ative “Mostrar resolvidos” para ver as conversas encerradas." : "Comente o plan ou um elemento específico. Use @ para mencionar alguém."}
              </p>
            </div>
          </div>
        )}
        {snap &&
          groups.map(([key, list]) => (
            <section key={key || "plan"} data-node-group={key} aria-label={key ? `Comentários em ${labelOf(key)}` : "Comentários no plan"} className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                {key ? (
                  <button
                    type="button"
                    disabled={!nodeById.has(key) || !onSelectNode}
                    onClick={() => onSelectNode?.(key)}
                    className={cn(
                      "min-w-0 truncate rounded-md text-left text-caption font-semibold uppercase tracking-[.06em] text-muted outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                      nodeById.has(key) && onSelectNode && "hover:text-accent-ink",
                      key === target.nodeId && "text-accent-ink",
                    )}
                    title={nodeById.has(key) ? "Mostrar no canvas" : undefined}
                  >
                    {labelOf(key)}
                  </button>
                ) : (
                  <span className="text-caption font-semibold uppercase tracking-[.06em] text-muted">No plan</span>
                )}
                <span className="h-px flex-1 bg-line" aria-hidden />
                {key && (
                  <Tooltip content="Comentar neste elemento">
                    <button
                      type="button"
                      aria-label={`Comentar em ${labelOf(key)}`}
                      className="inline-flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink [&_svg]:size-3.5"
                      onClick={() => {
                        setComposeNode(key);
                        composerRef.current?.focus();
                      }}
                    >
                      <MessageSquare />
                    </button>
                  </Tooltip>
                )}
              </div>
              {list.map((t) => (
                <Thread
                  key={t.root.id}
                  thread={t}
                  store={store}
                  names={names}
                  onSelectNode={key && nodeById.has(key) ? () => onSelectNode?.(key) : undefined}
                />
              ))}
            </section>
          ))}
      </div>

      {snap && (
        <div className="flex flex-col gap-2 border-t border-line bg-surface px-4 pb-4 pt-3">
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
            <span className="shrink-0">Em</span>
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-subtle py-0.5 pl-2 pr-1 text-ink-2">
              <span className="truncate font-medium">{composeNode ? labelOf(composeNode) : "No plan"}</span>
              {composeNode && (
                <button type="button" aria-label="Comentar no plan em vez do elemento" className="inline-flex size-4 items-center justify-center rounded-full hover:bg-hover [&_svg]:size-3" onClick={() => setComposeNode(null)}>
                  <X />
                </button>
              )}
            </span>
          </div>
          <MentionTextarea
            textareaRef={composerRef}
            label={composeNode ? `Comentar em ${labelOf(composeNode)}` : "Comentar no plan"}
            value={draft}
            onChange={setDraft}
            onSubmit={() => void send()}
            people={snap.people.filter((p) => p.id !== snap.me.id)}
            placeholder="Escreva um comentário… use @ para mencionar"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-caption text-muted">
              <AtSign className="size-3" aria-hidden /> menções · <kbd className="font-mono">⌘/Ctrl ↵</kbd> envia
            </span>
            <Button size="sm" variant="primary" onClick={() => void send()} disabled={!draft.trim() || sending}>
              {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />} Enviar
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}

function Thread({ thread, store, names, onSelectNode }: { thread: CommentThread; store: CommentsStore; names: string[]; onSelectNode?: () => void }) {
  const snap = store.snapshot!;
  const { root, replies } = thread;
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const resolved = !!root.resolvedAt;
  const canResolve = snap.role === "editor" || snap.role === "owner" || root.author.id === snap.me.id;

  const sendReply = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    const ok = await store.create({ body, parentId: root.id });
    setBusy(false);
    if (ok) {
      setDraft("");
      setReplying(false);
    }
  };

  return (
    <article
      id={`comment-${root.id}`}
      aria-label={`Conversa de ${root.author.name}${resolved ? " (resolvida)" : ""}`}
      className={cn("flex flex-col gap-3 rounded-xl border border-line p-3", resolved ? "bg-surface-2" : "bg-surface")}
      onClick={(e) => {
        // clicking the card (not a control) shows the node
        if (onSelectNode && !(e.target as HTMLElement).closest("button, a, textarea, [role=menu]")) onSelectNode();
      }}
    >
      {resolved && (
        <span className="-mb-1 inline-flex items-center gap-1 self-start rounded-full bg-success-bg px-2 py-0.5 text-caption font-medium text-success-ink">
          <Check className="size-3" aria-hidden /> Resolvido
        </span>
      )}
      <CommentItem c={root} store={store} names={names} />
      {replies.length > 0 && (
        <div className="flex flex-col gap-3 border-l-2 border-line pl-3">
          {replies.map((r) => (
            <CommentItem key={r.id} c={r} store={store} names={names} small />
          ))}
        </div>
      )}
      {replying ? (
        <div className="flex flex-col gap-2">
          <MentionTextarea
            label={`Responder a ${root.author.name}`}
            value={draft}
            onChange={setDraft}
            onSubmit={() => void sendReply()}
            onCancel={() => setReplying(false)}
            people={snap.people.filter((p) => p.id !== snap.me.id)}
            placeholder="Responder…"
            autoFocus
            rows={1}
          />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="primary" onClick={() => void sendReply()} disabled={!draft.trim() || busy}>
              {busy && <Loader2 className="animate-spin" />} Responder
            </Button>
          </div>
        </div>
      ) : (
        <div className="-mb-1 flex items-center gap-1">
          <button type="button" onClick={() => setReplying(true)} className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink [&_svg]:size-3.5">
            <CornerDownRight /> Responder
          </button>
          {canResolve && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await store.resolve(root.id, !resolved);
                setBusy(false);
              }}
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50 [&_svg]:size-3.5"
            >
              {resolved ? (
                <>
                  <RotateCcw /> Reabrir
                </>
              ) : (
                <>
                  <Check /> Resolver
                </>
              )}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function CommentItem({ c, store, names, small }: { c: CommentView; store: CommentsStore; names: string[]; small?: boolean }) {
  const snap = store.snapshot!;
  const mine = c.author.id === snap.me.id;
  const canDelete = mine || snap.role === "owner";
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const edited = c.updatedAt - c.createdAt > 1000;

  const save = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    if (body === c.body) return setEditing(false);
    setBusy(true);
    const ok = await store.edit(c.id, body);
    setBusy(false);
    if (ok) setEditing(false);
  };

  return (
    <div className="flex gap-2.5">
      <Avatar id={c.author.id} name={c.author.name} size={small ? 22 : 28} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-body font-semibold">{c.author.name}</span>
          <time dateTime={new Date(c.createdAt).toISOString()} title={formatDateTime(c.createdAt)} className="shrink-0 text-caption text-muted" suppressHydrationWarning>
            {timeAgo(c.createdAt)}
            {edited && " · editado"}
          </time>
          <span className="flex-1" />
          {(mine || canDelete) && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Ações do comentário" className="-my-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink [&_svg]:size-3.5">
                  <Ellipsis />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                {mine && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setDraft(c.body);
                      setEditing(true);
                    }}
                  >
                    <Pencil /> Editar
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem danger onSelect={() => setConfirming(true)}>
                    <Trash2 /> Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <MentionTextarea label="Editar comentário" value={draft} onChange={setDraft} onSubmit={() => void save()} onCancel={() => setEditing(false)} people={snap.people} autoFocus rows={1} />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" onClick={() => void save()} disabled={!draft.trim() || busy}>
                {busy && <Loader2 className="animate-spin" />} Salvar
              </Button>
            </div>
          </div>
        ) : (
          <Body text={c.body} names={names} />
        )}
        {confirming && (
          <div role="alert" className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
            <span className="flex-1">{c.parentId ? "Excluir este comentário?" : "Excluir a conversa inteira?"}</span>
            <button type="button" autoFocus className="rounded-md px-1.5 py-0.5 font-medium text-ink-2 hover:bg-hover" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-md bg-surface px-1.5 py-0.5 font-semibold text-danger hover:brightness-95"
              onClick={async () => {
                setConfirming(false);
                await store.remove(c.id);
              }}
            >
              Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
