"use client";
import * as React from "react";
import Link from "next/link";
import { COLUMN_LABEL, groupLinks, type LinkColumn } from "./display";
import {
  Archive,
  ArchiveRestore,
  ArrowDownUp,
  Copy,
  ExternalLink,
  FolderInput,
  Hash,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Pin,
  PinOff,
  ShieldCheck,
  Star,
  Trash2,
  Waypoints,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { SiteIcon } from "@/components/ui/misc";
import { cn, timeAgo } from "@/lib/utils";
import { recordOpen, useLinkOpener } from "./link-opener";
import { useLibrary, useSelected, useSelectionMode } from "./library-context";
import { Cover } from "./cover";
import { dropPosition, endDrag, getDrag, startDrag } from "./dnd";
import { HealthDot, shortUrl } from "./health";
import type { LinkItem, ViewMode } from "./types";
import { normalizeText } from "@/domain/link-query";
import { useFlip } from "@/lib/use-flip";
import { tagTint } from "./collection-style";

// ------------------------------------------------------------------ shared bits

/** Marks search terms inside `text`, ignoring case and accents. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const parts = React.useMemo(() => {
    if (!terms.length || !text) return null;
    // Normalized copy plus, for each normalized char, the index of its source char.
    let norm = "";
    const src: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const n = normalizeText(text[i]);
      for (const ch of n) {
        norm += ch;
        src.push(i);
      }
    }
    const ranges: [number, number][] = [];
    for (const t of terms) {
      let from = 0;
      let at: number;
      while (t && (at = norm.indexOf(t, from)) >= 0) {
        ranges.push([src[at], src[at + t.length - 1] + 1]);
        from = at + t.length;
      }
    }
    if (!ranges.length) return null;
    ranges.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const r of ranges) {
      const last = merged.at(-1);
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
    }
    const out: React.ReactNode[] = [];
    let pos = 0;
    merged.forEach(([a, b], i) => {
      if (a > pos) out.push(text.slice(pos, a));
      out.push(
        <mark key={i} className="rounded-[3px] bg-amber-bg px-px text-inherit">
          {text.slice(a, b)}
        </mark>,
      );
      pos = b;
    });
    if (pos < text.length) out.push(text.slice(pos));
    return out;
  }, [text, terms]);
  return <>{parts ?? text}</>;
}

function useLinkHandlers(link: LinkItem) {
  const lib = useLibrary();
  const opener = useLinkOpener();
  const onClick = (e: React.MouseEvent) => {
    if (lib.canEdit && e.shiftKey) {
      e.preventDefault();
      lib.toggleSelect(link.id, { range: e.shiftKey });
      return;
    }
    opener.onLinkClick(e, link);
  };
  const onAuxClick = (e: React.MouseEvent) => opener.onLinkAuxClick(e, link);
  return { onClick, onAuxClick, opener, lib };
}

const SWIPE_TRIGGER = 76;

/**
 * Touch gestures: long-press selects (editors), and on rows a horizontal swipe stars
 * (→) or archives (←). Mouse and pen input are left alone.
 */
function useTouchGestures(link: LinkItem, { swipe = false }: { swipe?: boolean } = {}) {
  const lib = useLibrary();
  const [dx, setDx] = React.useState(0);
  const st = React.useRef<{ x: number; y: number; mode: "idle" | "swipe" | "scroll"; fired: boolean; timer: number | null } | null>(null);
  const clear = () => {
    if (st.current?.timer) window.clearTimeout(st.current.timer);
    if (st.current) st.current.timer = null;
  };
  const props = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      st.current = { x: e.clientX, y: e.clientY, mode: "idle", fired: false, timer: null };
      if (lib.canEdit) {
        st.current.timer = window.setTimeout(() => {
          if (!st.current || st.current.mode !== "idle") return;
          st.current.fired = true;
          lib.toggleSelect(link.id);
          navigator.vibrate?.(12);
        }, 450);
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = st.current;
      if (!s || e.pointerType !== "touch") return;
      const mx = e.clientX - s.x;
      const my = e.clientY - s.y;
      if (Math.hypot(mx, my) > 8) clear();
      if (s.mode === "idle" && Math.abs(my) > 10) s.mode = "scroll";
      if (swipe && s.mode === "idle" && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) {
        s.mode = "swipe";
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      if (s.mode === "swipe") setDx(Math.max(-120, Math.min(120, mx)));
    },
    onPointerUp: () => {
      clear();
      const s = st.current;
      if (s?.mode === "swipe") {
        if (dx >= SWIPE_TRIGGER) void lib.star(link);
        else if (dx <= -SWIPE_TRIGGER && lib.canEdit) lib.archive([link.id], !link.archived);
        s.fired = true; // swallow the click that follows
      }
      setDx(0);
    },
    onPointerCancel: () => {
      clear();
      st.current = null;
      setDx(0);
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (st.current?.fired) {
        e.preventDefault();
        e.stopPropagation();
      }
      st.current = null;
    },
    onContextMenu: (e: React.MouseEvent) => {
      // the long-press already selected: no native link menu on top
      if (st.current?.fired) e.preventDefault();
    },
    style: (swipe ? { touchAction: "pan-y", "--swipe": `${dx}px` } : {}) as React.CSSProperties,
  };
  return { props, dx };
}

/** What a swipe will do, shown behind a row while it's dragged sideways. */
function SwipeUnderlay({ dx, link, canArchive }: { dx: number; link: LinkItem; canArchive: boolean }) {
  if (!dx) return null;
  const right = dx > 0;
  const armed = Math.abs(dx) >= SWIPE_TRIGGER;
  if (!right && !canArchive) return null;
  return (
    <span
      aria-hidden
      data-underlay
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center rounded-[inherit] px-5 transition-colors [&_svg]:size-5",
        right ? "justify-start" : "justify-end",
        right ? (armed ? "bg-amber-bg text-amber-ink" : "bg-subtle text-muted") : armed ? "bg-danger-soft text-danger" : "bg-subtle text-muted",
      )}
    >
      {right ? <Star className={cn(armed && "fill-current")} /> : link.archived ? <ArchiveRestore /> : <Archive />}
    </span>
  );
}

const coarsePointer = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** Drag source + reorder drop target for a link element. */
function useLinkDnd(link: LinkItem, axis: "x" | "y") {
  const lib = useLibrary();
  const [pos, setPos] = React.useState<"before" | "after" | null>(null);
  const [dragging, setDragging] = React.useState(false);
  if (!lib.canEdit) return { props: {}, pos: null, dragging: false };
  const props = {
    // HTML5 drag fights long-press on touch screens; there, Move… does the job.
    draggable: !coarsePointer(),
    onDragStart: (e: React.DragEvent) => {
      const sel = lib.selection.get();
      const ids = sel.has(link.id) ? [...sel] : [link.id];
      startDrag(e, { kind: "links", ids }, { url: link.url });
      setDragging(true);
    },
    onDragEnd: () => {
      endDrag();
      setDragging(false);
    },
    onDragOver: (e: React.DragEvent) => {
      const d = getDrag();
      if (!lib.reorderable || d?.kind !== "links" || d.ids.includes(link.id))
        return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setPos(dropPosition(e, axis, false) as "before" | "after");
    },
    onDragLeave: () => setPos(null),
    onDrop: (e: React.DragEvent) => {
      const d = getDrag();
      setPos(null);
      if (!lib.reorderable || d?.kind !== "links" || d.ids.includes(link.id))
        return;
      e.preventDefault();
      lib.dropOnLink(
        d.ids,
        link.id,
        dropPosition(e, axis, false) as "before" | "after",
      );
    },
  };
  return { props, pos, dragging };
}

function Checkbox({ link, className }: { link: LinkItem; className?: string }) {
  const lib = useLibrary();
  const on = useSelected(link.id);
  const selectionMode = useSelectionMode();
  // Selection only exists to run bulk edits, which viewers can't do.
  if (!lib.canEdit) return null;
  return (
    <input
      type="checkbox"
      aria-label={`Selecionar ${link.title}`}
      checked={on}
      onChange={() => {}}
      onClick={(e) => {
        e.stopPropagation();
        lib.toggleSelect(link.id, { range: e.shiftKey });
      }}
      className={cn(
        "relative z-10 m-0 h-4 w-4 cursor-pointer accent-[var(--accent)] transition-opacity",
        on || selectionMode ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
        className,
      )}
    />
  );
}

function LinkActions({
  link,
  Item,
  Separator,
}: {
  link: LinkItem;
  Item: typeof DropdownMenuItem | typeof ContextMenuItem;
  Separator: typeof DropdownMenuSeparator | typeof ContextMenuSeparator;
}) {
  const lib = useLibrary();
  const opener = useLinkOpener();
  const selection = React.useSyncExternalStore(
    lib.selection.subscribe,
    lib.selection.get,
    lib.selection.get,
  );
  const ids = selection.has(link.id) ? [...selection] : [link.id];
  const multiple = ids.length > 1;
  const label = (single: string, plural: string) =>
    multiple ? `${plural} ${ids.length} links` : single;
  return (
    <>
      {multiple && (
        <div className="px-2.5 py-1.5 text-caption font-semibold text-muted">
          {ids.length} links selecionados
        </div>
      )}
      {!multiple && (
        <>
          <Item shortcut="O" onSelect={() => opener.openNewTab(link)}>
            <ExternalLink />
            Abrir no navegador
          </Item>
          <Item onSelect={() => lib.inspect(link)}>
            <PanelRight />
            Detalhes e prévia
          </Item>
        </>
      )}
      <Item onSelect={() => lib.copyUrls(ids)}>
        <Copy />
        {label("Copiar URL", "Copiar URLs de")}
      </Item>
      <Separator />
      <Item
        shortcut="S"
        onSelect={() => (multiple ? lib.bulkStar(ids, true) : lib.star(link))}
      >
        <Star />
        {multiple
          ? "Marcar selecionados com estrela"
          : link.starred
            ? "Remover estrela"
            : "Marcar com estrela"}
      </Item>
      {!multiple && (
        <Item shortcut="P" onSelect={() => lib.pin(link)}>
          {link.pinned ? <PinOff /> : <Pin />}
          {link.pinned ? "Tirar do acesso rápido" : "Fixar no acesso rápido"}
        </Item>
      )}
      {lib.canEdit && (
        <>
          <Separator />
          {!multiple && (
            <Item shortcut="E" onSelect={() => lib.edit(link)}>
              <Pencil />
              Editar detalhes
            </Item>
          )}
          <Item shortcut="M" onSelect={() => lib.move(ids)}>
            <FolderInput />
            {label("Mover para…", "Mover")}
          </Item>
          <Item onSelect={() => lib.addTags(ids)}>
            <Hash />
            {label("Organizar tags…", "Organizar tags de")}
          </Item>
          {!multiple &&
            link.healthStatus === "redirect" &&
            link.healthFinalUrl && (
              <Item onSelect={() => lib.applyRedirect(link)}>
                <Waypoints />
                Atualizar para a nova URL
              </Item>
            )}
          {!link.archived && (
            <Item onSelect={() => lib.checkLinks(ids)}>
              <ShieldCheck />
              {label("Verificar link", "Verificar")}
            </Item>
          )}
          <Separator />
          <Item
            shortcut="Delete"
            onSelect={() => lib.archive(ids, !lib.archivedScope)}
          >
            {lib.archivedScope ? <ArchiveRestore /> : <Archive />}
            {label(
              lib.archivedScope ? "Restaurar" : "Arquivar",
              lib.archivedScope ? "Restaurar" : "Arquivar",
            )}
          </Item>
          <Item danger onSelect={() => lib.remove(ids)}>
            <Trash2 />
            {label("Excluir", "Excluir")}
          </Item>
        </>
      )}
    </>
  );
}
function selectMenuTarget(lib: ReturnType<typeof useLibrary>, link: LinkItem) {
  if (lib.canEdit && !lib.selection.get().has(link.id))
    lib.selection.set(new Set([link.id]));
}
export function LinkMenu({
  link,
  trigger,
  align = "end",
}: {
  link: LinkItem;
  trigger: React.ReactNode;
  align?: "start" | "end";
}) {
  const lib = useLibrary();
  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => open && selectMenuTarget(lib, link)}
    >
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <LinkActions
          link={link}
          Item={DropdownMenuItem}
          Separator={DropdownMenuSeparator}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function LinkContext({
  link,
  children,
}: {
  link: LinkItem;
  children: React.ReactNode;
}) {
  const lib = useLibrary();
  return (
    <ContextMenu onOpenChange={(open) => open && selectMenuTarget(lib, link)}>
      <ContextMenuTrigger asChild>
        <div className="contents" onContextMenu={(e) => e.stopPropagation()}>
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <LinkActions
          link={link}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

const floatBtn =
  "inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-surface/95 text-ink shadow-thumb backdrop-blur hover:bg-surface [&_svg]:size-[15px]";

function Summary({ link, className }: { link: LinkItem; className?: string }) {
  const lib = useLibrary();
  const mode = lib.summaryFor(link);
  if (mode === "hidden" || !link.description) return null;
  return (
    <p className={cn(className, mode === "hover" && "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100")}>
      <Highlight text={link.description} terms={lib.highlight} />
    </p>
  );
}

function Tags({ link, max }: { link: LinkItem; max: number }) {
  const lib = useLibrary();
  if (!link.tags.length) return null;
  const extra = link.tags.length - max;
  return (
    <>
      {link.tags.slice(0, max).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => lib.filterTag(t)}
          title={`Filtrar por #${t}`}
          style={tagTint(lib.tagColor(t))}
          className={cn(
            "relative z-10 shrink-0 rounded-full px-2 py-0.5 text-xs",
            lib.tagColor(t) ? "wp-tint font-medium hover:brightness-95" : "bg-subtle text-ink-2 hover:bg-hover hover:text-ink",
          )}
        >
          #{t}
        </button>
      ))}
      {extra > 0 && <span className="shrink-0 text-xs text-muted">+{extra}</span>}
    </>
  );
}

function StarButton({ link, className }: { link: LinkItem; className?: string }) {
  const lib = useLibrary();
  return (
    <button
      type="button"
      aria-label={link.starred ? "Remover dos favoritos" : "Favoritar"}
      aria-pressed={link.starred}
      onClick={() => lib.star(link)}
      className={className}
    >
      <Star className={cn(link.starred && "fill-amber-ink text-amber-ink")} />
    </button>
  );
}

// ------------------------------------------------------------------ cards

function LinkCard({ link }: { link: LinkItem }) {
  const { onClick, onAuxClick, opener, lib } = useLinkHandlers(link);
  const dnd = useLinkDnd(link, "x");
  const touch = useTouchGestures(link);
  const selected = useSelected(link.id);
  const selectionMode = useSelectionMode();
  return (
    <article
      data-flip={link.id}
      {...dnd.props}
      {...touch.props}
      className={cn(
        "group relative flex flex-col overflow-visible rounded-card border bg-surface transition-[box-shadow,transform,opacity] [-webkit-touch-callout:none] hover:-translate-y-px hover:shadow-raise",
        selected ? "border-accent ring-2 ring-accent/25" : "border-line",
        dnd.dragging && "opacity-50",
      )}
    >
      {dnd.pos && (
        <span
          aria-hidden
          className={cn(
            "absolute bottom-2 top-2 z-20 w-[3px] rounded-full bg-accent",
            dnd.pos === "before" ? "-left-[10px]" : "-right-[10px]",
          )}
        />
      )}
      {lib.display.covers && link.coverImage && (
        <div
          className={cn(
            "relative overflow-hidden rounded-t-[13px]",
            lib.display.density === "dense" ? "h-20" : "h-[112px]",
          )}
        >
          <Cover link={link} />
        </div>
      )}
      <div
        className={cn(
          "flex flex-col gap-2",
          lib.display.density === "dense" ? "p-3" : "p-4",
          (!lib.display.covers || !link.coverImage) && "pt-12",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <SiteIcon
            src={link.icon || link.favicon}
            label={link.domain || link.title}
            size={18}
          />
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onClick={onClick}
            onAuxClick={onAuxClick}
            data-link-primary={link.id}
            className="min-w-0 line-clamp-2 text-lead font-semibold text-ink outline-none after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent"
          >
            <Highlight text={link.title} terms={lib.highlight} />
          </a>
        </div>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-mono text-xs text-muted">
            {link.domain}
          </span>
          <HealthDot link={link} />
        </span>
        <Summary
          link={link}
          className="line-clamp-2 text-body leading-[19px] text-ink-2"
        />
        {link.tags.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            <Tags link={link} max={4} />
          </div>
        )}
      </div>
      <div className="absolute left-2.5 top-2.5 z-10 flex">
        <Checkbox link={link} className="h-[18px] w-[18px]" />
      </div>
      {link.starred && (
        <span className="pointer-events-none absolute right-2.5 top-2.5 inline-flex pointer-coarse:hidden h-[30px] w-[30px] items-center justify-center rounded-lg bg-surface/95 shadow-thumb transition-opacity group-focus-within:opacity-0 group-hover:opacity-0">
          <Star
            className="size-[15px] fill-amber-ink text-amber-ink"
            aria-label="Favorito"
          />
        </span>
      )}
      <div className="absolute right-2.5 top-2.5 z-10 flex gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
        <button
          type="button"
          aria-label="Abrir no app"
          title="Abrir no app"
          className={cn(floatBtn, "pointer-coarse:hidden")}
          onClick={() => opener.openInApp(link)}
        >
          <PanelRight />
        </button>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir em nova aba"
          title="Abrir em nova aba"
          draggable={false}
          className={cn(floatBtn, "pointer-coarse:hidden")}
          onClick={() => recordOpen(link.id)}
        >
          <ExternalLink />
        </a>
        <StarButton link={link} className={floatBtn} />
        <LinkMenu
          link={link}
          trigger={
            <button type="button" aria-label="Mais ações" className={floatBtn}>
              <MoreHorizontal />
            </button>
          }
        />
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ compact

const rowIconBtn = "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink [&_svg]:size-[15px]";

function CompactRow({ link }: { link: LinkItem }) {
  const { onClick, onAuxClick, opener, lib } = useLinkHandlers(link);
  const dnd = useLinkDnd(link, "y");
  const touch = useTouchGestures(link, { swipe: true });
  const selected = useSelected(link.id);
  const selectionMode = useSelectionMode();
  return (
    <div
      data-flip={link.id}
      {...dnd.props}
      {...touch.props}
      className={cn(
        "group relative flex items-center gap-3 rounded-control border bg-surface px-3 transition-colors hover:bg-surface-2",
        lib.display.density === "dense" ? "py-1.5" : "py-3",
        "[&>*:not([data-underlay])]:[translate:var(--swipe,0px)_0] [-webkit-touch-callout:none]",
        touch.dx === 0 && "[&>*]:transition-[translate] [&>*]:duration-200",
        selected ? "border-accent ring-2 ring-accent/25" : "border-line",
        dnd.dragging && "opacity-50",
      )}
    >
      <SwipeUnderlay dx={touch.dx} link={link} canArchive={lib.canEdit} />
      {dnd.pos && (
        <span
          aria-hidden
          className={cn(
            "absolute left-2 right-2 z-20 h-[3px] rounded-full bg-accent",
            dnd.pos === "before" ? "-top-[6px]" : "-bottom-[6px]",
          )}
        />
      )}
      <span className="relative inline-flex">
        <SiteIcon
          src={link.icon || link.favicon}
          label={link.domain || link.title}
          size={32}
          className={cn(
            "transition-opacity",
            (selected || selectionMode) && "opacity-0",
            lib.canEdit && "group-hover:opacity-30",
          )}
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <Checkbox link={link} />
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onClick={onClick}
            onAuxClick={onAuxClick}
            data-link-primary={link.id}
            className="truncate text-sm font-medium text-ink outline-none after:absolute after:inset-0 after:rounded-control after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent"
          >
            <Highlight text={link.title} terms={lib.highlight} />
          </a>
          <HealthDot link={link} />
        </span>
        <Summary link={link} className="truncate text-xs text-muted" />
        <span className="truncate font-mono text-caption text-muted">
          {link.domain}
        </span>
      </div>
      <div className="hidden shrink-0 gap-1.5 xl:flex">
        <Tags link={link} max={2} />
      </div>
      <div className="relative z-10 flex shrink-0 items-center">
        <StarButton
          link={link}
          className={cn(
            rowIconBtn,
            !link.starred &&
              "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
          )}
        />
        <LinkMenu
          link={link}
          trigger={
            <button
              type="button"
              aria-label="Mais ações"
              className={cn(
                rowIconBtn,
                "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100",
              )}
            >
              <MoreHorizontal />
            </button>
          }
        />
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir em nova aba"
          draggable={false}
          className={rowIconBtn}
          onClick={() => recordOpen(link.id)}
        >
          <ExternalLink />
        </a>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ list

function ListRow({ link }: { link: LinkItem }) {
  const { onClick, onAuxClick, lib } = useLinkHandlers(link);
  const dnd = useLinkDnd(link, "y");
  const touch = useTouchGestures(link, { swipe: true });
  const selected = useSelected(link.id);
  return (
    <div
      role="row"
      data-flip={link.id}
      {...dnd.props}
      {...touch.props}
      className={cn(
        "group relative grid grid-cols-subgrid items-center gap-3 border-b border-line px-3 text-body last:border-0 hover:bg-surface-2",
        lib.display.density === "dense" ? "min-h-10 py-1" : "min-h-14 py-2",
        selected && "bg-accent-soft",
        dnd.dragging && "opacity-50",
      )}
      style={{ gridColumn: "1 / -1" }}
    >
      {dnd.pos && (
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-2 h-[3px] bg-accent",
            dnd.pos === "before" ? "top-0" : "bottom-0",
          )}
        />
      )}
      <span role="cell" className="flex min-w-0 items-center gap-2">
        <Checkbox link={link} />
        <SiteIcon
          src={link.icon || link.favicon}
          label={link.domain || link.title}
          size={24}
        />
        <span className="min-w-0 flex-1">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onClick={onClick}
            onAuxClick={onAuxClick}
            data-link-primary={link.id}
            className="block truncate font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Highlight text={link.title} terms={lib.highlight} />
          </a>
          {lib.display.density !== "dense" && (
            <Summary link={link} className="truncate text-caption text-muted" />
          )}
        </span>
        <HealthDot link={link} />
        {link.starred && (
          <Star
            className="size-3 shrink-0 fill-amber-ink text-amber-ink"
            aria-label="Favorito"
          />
        )}
      </span>
      {lib.display.columns.map((column) => (
        <span
          key={column}
          role="cell"
          className="min-w-0 truncate text-body text-muted"
        >
          {column === "domain" ? (
            link.domain
          ) : column === "collection" ? (
            link.collectionId ? (
              <Link
                href={`/links?c=${link.collectionId}`}
                className="hover:text-accent-ink"
              >
                {link.collectionName}
              </Link>
            ) : (
              "Sem coleção"
            )
          ) : column === "tags" ? (
            <span className="flex gap-1 overflow-hidden">
              <Tags link={link} max={3} />
            </span>
          ) : (
            <span suppressHydrationWarning>
              {column === "visited"
                ? link.myLastOpenedAt
                  ? timeAgo(link.myLastOpenedAt)
                  : "Nunca"
                : timeAgo(link.createdAt)}
            </span>
          )}
        </span>
      ))}
      <span role="cell">
        <LinkMenu
          link={link}
          trigger={
            <button
              type="button"
              aria-label="Mais ações"
              className={rowIconBtn}
            >
              <MoreHorizontal />
            </button>
          }
        />
      </span>
    </div>
  );
}
function ListView({ links }: { links: LinkItem[] }) {
  const lib = useLibrary();
  const columns = ["title", ...lib.display.columns] as const;
  const resize = (
    event: React.PointerEvent<HTMLButtonElement>,
    column: (typeof columns)[number],
  ) => {
    const el = event.currentTarget;
    const start = event.clientX;
    const width = el.parentElement?.getBoundingClientRect().width ?? 180;
    el.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) =>
      lib.updateDisplay({
        widths: {
          ...lib.display.widths,
          [column]: Math.max(90, Math.min(600, width + e.clientX - start)),
        },
      });
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  };
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line bg-surface">
      <div
        role="table"
        aria-label="Links"
        className="grid gap-x-3"
        style={{
          gridTemplateColumns:
            columns
              .map((c) =>
                lib.display.widths[c]
                  ? `${lib.display.widths[c]}px`
                  : c === "title"
                    ? "minmax(260px, 2fr)"
                    : "minmax(120px, 1fr)",
              )
              .join(" ") + " 36px",
          minWidth: 300 + lib.display.columns.length * 132,
        }}
      >
        <div
          role="row"
          className="sticky top-0 z-10 grid grid-cols-subgrid items-center border-b border-line bg-surface-2 px-3 text-caption font-medium text-muted"
          style={{ gridColumn: "1 / -1" }}
        >
          {columns.map((column) => (
            <span
              key={column}
              role="columnheader"
              className="relative flex h-10 min-w-0 items-center pr-3"
            >
              <button
                type="button"
                className="truncate text-left hover:text-ink"
                disabled={
                  column !== "title" &&
                  column !== "created" &&
                  column !== "visited"
                }
                onClick={() =>
                  lib.sortBy(
                    column === "title"
                      ? "title"
                      : column === "visited"
                        ? "visited"
                        : "recent",
                  )
                }
              >
                {column === "title" ? "Título" : COLUMN_LABEL[column]}
              </button>
              <button
                type="button"
                aria-label={`Ajustar largura de ${column === "title" ? "Título" : COLUMN_LABEL[column]}`}
                className="absolute -right-1 inset-y-2 w-2 cursor-col-resize touch-none border-r border-line-2 hover:border-accent"
                onPointerDown={(e) => resize(e, column)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    lib.updateDisplay({
                      widths: {
                        ...lib.display.widths,
                        [column]: Math.max(
                          90,
                          Math.min(
                            600,
                            (lib.display.widths[column] ?? e.currentTarget.parentElement?.getBoundingClientRect().width ?? 180) +
                              (e.key === "ArrowRight" ? 20 : -20),
                          ),
                        ),
                      },
                    });
                  }
                }}
              />
            </span>
          ))}
          <span role="columnheader" className="sr-only">
            Ações
          </span>
        </div>
        {links.map((link) => (
          <LinkContext key={link.id} link={link}>
            <ListRow link={link} />
          </LinkContext>
        ))}
      </div>
    </div>
  );
}

export function LinkViews({
  links,
  view,
}: {
  links: LinkItem[];
  view: ViewMode;
}) {
  const lib = useLibrary();
  const ref = React.useRef<HTMLDivElement>(null);
  useFlip(ref, links, view);
  const groups = React.useMemo(
    () => groupLinks(links, lib.display.group),
    [links, lib.display.group],
  );
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-5",
        lib.display.density === "dense" && "wp-links-dense",
      )}
    >
      {groups.map((group) => (
        <section
          key={group.key}
          className="flex flex-col gap-3"
          aria-label={group.label || undefined}
        >
          {group.label && (
            <h2 className="flex items-center gap-2 text-body font-semibold">
              {group.label}
              <span className="rounded-full bg-subtle px-2 py-0.5 text-caption text-muted">
                {group.links.length}
              </span>
            </h2>
          )}
          {view === "list" ? (
            <ListView links={group.links} />
          ) : (
            <div
              className={cn(
                "grid",
                view === "compact"
                  ? "grid-cols-1 gap-x-6 gap-y-2 lg:grid-cols-2"
                  : lib.display.density === "dense"
                    ? "grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
                    : "grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]",
              )}
            >
              {group.links.map((link) => (
                <LinkContext key={link.id} link={link}>
                  {view === "compact" ? (
                    <CompactRow link={link} />
                  ) : (
                    <LinkCard link={link} />
                  )}
                </LinkContext>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
