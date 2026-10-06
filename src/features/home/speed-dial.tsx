"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, PanelRight, Pin, PinOff, Sparkles, Zap } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/menu";
import { Kbd } from "@/components/ui/misc";
import { reorderPinnedLinksAction, togglePinLinkAction } from "@/app/(app)/links/actions";
import { monogramColors } from "@/lib/color";
import { cn } from "@/lib/utils";
import { recordOpen } from "@/features/links/link-opener";
import { alwaysNewTab } from "@/features/links/prefs";
import { overlayOpen } from "@/lib/dom";

export type DialLink = {
  id: string;
  title: string;
  url: string;
  domain: string;
  favicon: string | null;
  icon: string | null;
  openBehavior: string;
  pinned: boolean;
};

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};

/** Short name for a tile: the title up to a separator ("React Flow — Docs" → "React Flow"). */
const shortName = (t: string) => t.split(/\s[|–—·:-]\s/)[0].trim() || t;

/**
 * Quick access: pinned links (manual order) and the most "frecent" ones. Keys 1–9 open
 * the first nine; pinned tiles can be dragged to reorder.
 */
export function SpeedDial({ links }: { links: DialLink[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(links);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const refs = React.useRef<(HTMLAnchorElement | null)[]>([]);
  React.useEffect(() => setItems(links), [links]);

  const open = React.useCallback(
    (l: DialLink, newTab = false) => {
      recordOpen(l.id);
      if (newTab || l.openBehavior === "new_tab" || alwaysNewTab(l.domain)) window.open(l.url, "_blank", "noopener,noreferrer");
      else router.push(`/links?open=${l.id}`);
    },
    [router],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || overlayOpen()) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9 || !items[n - 1]) return;
      e.preventDefault();
      refs.current[n - 1]?.focus();
      open(items[n - 1], e.shiftKey);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, open]);

  const togglePin = async (l: DialLink) => {
    setItems((list) => list.map((x) => (x.id === l.id ? { ...x, pinned: !x.pinned } : x)));
    const r = await togglePinLinkAction(l.id);
    if (!r.ok) toast.error(r.error);
    router.refresh();
  };

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const pinned = items.filter((i) => i.pinned);
    const from = pinned.findIndex((i) => i.id === dragId);
    const to = pinned.findIndex((i) => i.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...pinned];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setItems([...next, ...items.filter((i) => !i.pinned)]);
    reorderPinnedLinksAction(next.map((i) => i.id)).then((r) => !r.ok && toast.error(r.error));
  };

  if (!items.length) {
    return (
      <div className="flex items-center gap-4 rounded-card border border-dashed border-line-2 px-5 py-4">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-ink">
          <Zap className="size-[18px]" aria-hidden />
        </span>
        <p className="text-body leading-5 text-muted">
          Seu acesso rápido aparece aqui: os links que você mais abre entram sozinhos, e você pode fixar outros pelo menu <span className="font-medium text-ink-2">⋯ → Fixar no acesso rápido</span> na biblioteca.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-6" aria-label="Acesso rápido">
      {items.map((l, i) => {
        const { bg, fg } = monogramColors(l.domain || l.title);
        const icon = l.icon || l.favicon;
        const newTab = l.openBehavior === "new_tab";
        const tile = (
          <a
            ref={(el) => {
              refs.current[i] = el;
            }}
            href={newTab ? l.url : `/links?open=${l.id}`}
            target={newTab ? "_blank" : undefined}
            rel={newTab ? "noopener noreferrer" : undefined}
            draggable={l.pinned}
            onDragStart={(e) => {
              setDragId(l.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => {
              if (dragId && l.pinned) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(l.id);
            }}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return void recordOpen(l.id);
              e.preventDefault();
              open(l);
            }}
            onAuxClick={(e) => e.button === 1 && recordOpen(l.id)}
            title={`${l.title}\n${l.domain}`}
            className={cn(
              "group/dial relative flex flex-col items-center gap-2 rounded-card px-1 py-2 text-center outline-none transition-transform focus-visible:ring-2 focus-visible:ring-accent",
              dragId === l.id && "opacity-40",
            )}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <span
              className="wp-cover relative flex size-[60px] items-center justify-center rounded-[18px] shadow-rest transition-[transform,box-shadow] duration-300 ease-[var(--ease-spring)] group-hover/dial:-translate-y-1 group-hover/dial:shadow-raise group-active/dial:scale-95"
              style={{ "--tint": bg, "--tint-ink": fg } as React.CSSProperties}
            >
              <DialIcon src={icon} letter={(l.title.trim()[0] ?? "?").toUpperCase()} />
              {l.pinned && (
                <span className="absolute -right-1 -top-1 inline-flex size-[18px] items-center justify-center rounded-full border-2 border-bg bg-accent text-white" aria-label="Fixado">
                  <Pin className="size-2.5" aria-hidden />
                </span>
              )}
              {i < 9 && (
                <Kbd className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1 py-0 text-micro opacity-0 transition-opacity group-hover/dial:opacity-100 group-focus-visible/dial:opacity-100 pointer-coarse:hidden">
                  {i + 1}
                </Kbd>
              )}
            </span>
            <span className="w-full truncate text-caption font-medium text-ink-2 group-hover/dial:text-ink">{shortName(l.title)}</span>
          </a>
        );
        return (
          <li key={l.id} className="animate-stagger" style={{ animationDelay: `${i * 30}ms` }}>
            <ContextMenu>
              <ContextMenuTrigger asChild>{tile}</ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => open(l, true)}>
                  <ExternalLink /> Abrir em nova aba
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => (recordOpen(l.id), router.push(`/links?open=${l.id}`))}>
                  <PanelRight /> Abrir no app
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => togglePin(l)}>
                  {l.pinned ? <PinOff /> : <Pin />}
                  {l.pinned ? "Tirar do acesso rápido" : "Fixar no acesso rápido"}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </li>
        );
      })}
      {items.length < 6 && (
        <li className="flex flex-col items-center gap-2 px-1 py-2">
          <Link
            href="/links?sort=foryou"
            className="flex size-[60px] items-center justify-center rounded-[18px] border border-dashed border-line-2 text-muted transition-colors hover:border-ink-2 hover:text-ink"
            aria-label="Escolher links para o acesso rápido"
          >
            <Sparkles className="size-5" aria-hidden />
          </Link>
          <span className="text-caption text-muted">Escolher</span>
        </li>
      )}
    </ul>
  );
}

function DialIcon({ src, letter }: { src: string | null; letter: string }) {
  const [failed, setFailed] = React.useState(false);
  if (src && !failed) {
    return (
      <span className="wp-cover-tile flex size-9 items-center justify-center rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={22}
          height={22}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          ref={(el) => {
            if (el?.complete && el.naturalWidth === 0) setFailed(true);
          }}
          className="size-[22px] object-contain"
        />
      </span>
    );
  }
  return <span className="font-display font-semibold text-[30px] leading-none">{letter}</span>;
}
