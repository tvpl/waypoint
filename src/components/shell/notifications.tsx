"use client";
import * as React from "react";
import Link from "next/link";
import { AtSign, BellOff, BellRing, CalendarCheck, CalendarClock, CheckCheck, Loader2, MessageSquare, Unlink, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn, timeAgo } from "@/lib/utils";
import { localDate } from "@/domain/tasks";
import type { NotificationsResponse } from "@/app/api/notifications/route";
import type { NotificationItem, NotificationKind } from "@/server/services/notifications";

// ------------------------------------------------------------------ shared store

/**
 * One store for the whole page (rail and phone tab bar share it): fetched when someone subscribes,
 * then every 60 s while the page is visible, and again when the tab comes back into view.
 */
type State = { data: NotificationsResponse | null; loading: boolean };
const POLL_MS = 60_000;
let state: State = { data: null, loading: false };
let lastAt = 0;
let inflight: Promise<void> | null = null;
let pollers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
const SERVER_STATE: State = { data: null, loading: false };

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function refreshNotifications(): Promise<void> {
  if (inflight) return inflight;
  set({ loading: true });
  inflight = fetch(`/api/notifications?today=${localDate()}`, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<NotificationsResponse>) : null))
    .then((data) => {
      lastAt = Date.now();
      if (data) set({ data });
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
      set({ loading: false });
    });
  return inflight;
}

const visible = () => document.visibilityState === "visible";
const onVisibility = () => {
  if (visible() && Date.now() - lastAt > POLL_MS / 2) void refreshNotifications();
};

function startPolling() {
  if (pollers++ > 0) return;
  if (visible()) void refreshNotifications();
  timer = setInterval(() => visible() && void refreshNotifications(), POLL_MS);
  document.addEventListener("visibilitychange", onVisibility);
}

function stopPolling() {
  if (--pollers > 0) return;
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener("visibilitychange", onVisibility);
}

async function markAllSeen() {
  const prev = state.data;
  if (prev) set({ data: { ...prev, unread: 0, items: prev.items.map((i) => ({ ...i, unread: false })) } });
  try {
    const res = await fetch("/api/notifications", { method: "POST" });
    if (!res.ok) throw new Error();
  } catch {
    if (prev) set({ data: prev });
    toast.error("Não foi possível marcar as notificações como vistas.");
  }
}

/** Notifications of the current person and workspace; `scope` (the workspace id) refetches on switch. */
export function useNotifications(scope: string) {
  const snap = React.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => state,
    () => SERVER_STATE,
  );
  React.useEffect(() => {
    startPolling();
    return stopPolling;
  }, []);
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) return void (first.current = false);
    void refreshNotifications();
  }, [scope]);
  return { data: snap.data, loading: snap.loading, unread: snap.data?.unread ?? 0, refresh: refreshNotifications, markAllSeen };
}

// ------------------------------------------------------------------ pieces

/** Small count bubble over an icon ("9+" past nine). */
export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none tabular-nums text-white ring-2 ring-surface",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export const unreadLabel = (count: number) => (count === 0 ? "Notificações" : count === 1 ? "Notificações (1 nova)" : `Notificações (${count} novas)`);

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  reminder: BellRing,
  overdue: CalendarClock,
  followup: CalendarCheck,
  mention: AtSign,
  comment: MessageSquare,
  broken: Unlink,
};

function Row({ item, onNavigate }: { item: NotificationItem; onNavigate?: () => void }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <Link href={item.href} onClick={onNavigate} className="group flex items-start gap-3 rounded-lg px-2 py-2 outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/40">
      <span
        className={cn(
          "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
          item.kind === "broken" ? "bg-danger-soft text-danger" : item.kind === "overdue" ? "bg-amber-bg text-amber-ink" : "bg-accent-soft text-accent-ink",
        )}
      >
        <Icon strokeWidth={1.9} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("line-clamp-2 text-body leading-5", item.unread ? "font-medium text-ink" : "text-ink-2")}>{item.title}</span>
        {item.detail && <span className="truncate text-caption text-muted">{item.detail}</span>}
        <span className="text-caption text-muted">{timeAgo(item.at)}</span>
      </span>
      {item.unread && (
        <>
          <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-hidden />
          <span className="sr-only">(nova)</span>
        </>
      )}
    </Link>
  );
}

/** "Notificações": header with "Marcar tudo como visto", then the list (or a calm empty state). */
export function NotificationsPanel({ scope, onNavigate, hideTitle, className }: { scope: string; onNavigate?: () => void; hideTitle?: boolean; className?: string }) {
  const { data, loading, unread, refresh, markAllSeen: seen } = useNotifications(scope);
  // Opening the panel always shows fresh items.
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        {hideTitle ? <span className="flex-1" /> : <h2 className="flex-1 text-lead font-semibold">Notificações</h2>}
        {loading && <Loader2 className="size-4 animate-spin text-muted" aria-label="Atualizando" />}
        <button
          type="button"
          disabled={!unread}
          onClick={() => void seen()}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-caption font-medium text-accent-ink hover:bg-accent-soft disabled:pointer-events-none disabled:text-muted"
        >
          <CheckCheck className="size-3.5" /> Marcar tudo como visto
        </button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
        {!data ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted" aria-label="Carregando" />
          </div>
        ) : data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <BellOff className="size-6 text-muted" strokeWidth={1.6} />
            <p className="text-body font-medium">Tudo em dia</p>
            <p className="text-caption text-muted">Lembretes, tarefas atrasadas, menções e links quebrados aparecem aqui.</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {data.items.map((item) => (
              <li key={item.id}>
                <Row item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2/60 px-4 py-2.5">
        <Link href="/tasks?reminders=1" onClick={onNavigate} className="text-caption font-medium text-accent-ink hover:underline">
          Central de lembretes
        </Link>
        <Link href="/tasks?scope=today" onClick={onNavigate} className="text-caption font-medium text-accent-ink hover:underline">
          Meu dia
        </Link>
      </div>
    </div>
  );
}
