"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  ArrowDownUp,
  Copy,
  ExternalLink,
  FolderInput,
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { SiteIcon } from "@/components/ui/misc";
import { cn, timeAgo } from "@/lib/utils";
import { recordOpen, useLinkOpener } from "./link-opener";
import { useLibrary, useSelected, useSelectionMode } from "./library-context";
import { Cover } from "./cover";
import { dropPosition, endDrag, getDrag, startDrag } from "./dnd";
import { HealthDot, shortUrl } from "./health";
import type { LinkItem, SortMode, ViewMode } from "./types";
import { normalizeText } from "@/domain/link-query";

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
    if (lib.canEdit && (lib.selection.get().size > 0 || e.shiftKey)) {
      e.preventDefault();
      lib.toggleSelect(link.id, { range: e.shiftKey });
      return;
    }
    opener.onLinkClick(e, link);
  };
  const onAuxClick = (e: React.MouseEvent) => opener.onLinkAuxClick(e, link);
  return { onClick, onAuxClick, opener, lib };
}

/** Drag source + reorder drop target for a link element. */
function useLinkDnd(link: LinkItem, axis: "x" | "y") {
  const lib = useLibrary();
  const [pos, setPos] = React.useState<"before" | "after" | null>(null);
  const [dragging, setDragging] = React.useState(false);
  if (!lib.canEdit) return { props: {}, pos: null, dragging: false };
  const props = {
    draggable: true,
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
      if (!lib.reorderable || d?.kind !== "links" || d.ids.length !== 1 || d.ids[0] === link.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setPos(dropPosition(e, axis, false) as "before" | "after");
    },
    onDragLeave: () => setPos(null),
    onDrop: (e: React.DragEvent) => {
      const d = getDrag();
      setPos(null);
      if (!lib.reorderable || d?.kind !== "links" || d.ids.length !== 1) return;
      e.preventDefault();
      lib.dropOnLink(d.ids, link.id, dropPosition(e, axis, false) as "before" | "after");
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

export function LinkMenu({ link, trigger, align = "end" }: { link: LinkItem; trigger: React.ReactNode; align?: "start" | "end" }) {
  const lib = useLibrary();
  const opener = useLinkOpener();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuItem onSelect={() => opener.openInApp(link)}>
          <PanelRight />
          Abrir no app
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => opener.openNewTab(link)}>
          <ExternalLink />
          Abrir em nova aba
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={async () => {
            try {
              await navigator.clipboard.writeText(link.url);
              toast.success("URL copiada");
            } catch {
              toast.error("Não foi possível copiar.");
            }
          }}
        >
          <Copy />
          Copiar URL
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => lib.star(link)}>
          <Star />
          {link.starred ? "Remover estrela" : "Marcar com estrela"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => lib.pin(link)}>
          {link.pinned ? <PinOff /> : <Pin />}
          {link.pinned ? "Tirar do acesso rápido" : "Fixar no acesso rápido"}
        </DropdownMenuItem>
        {lib.canEdit && (
          <>
            <DropdownMenuSeparator />
            {link.healthStatus === "redirect" && link.healthFinalUrl && (
              <DropdownMenuItem onSelect={() => lib.applyRedirect(link)} title={link.healthFinalUrl}>
                <Waypoints />
                <span className="flex min-w-0 flex-col">
                  <span>Atualizar para a nova URL</span>
                  <span className="max-w-[220px] truncate font-mono text-caption text-muted">{shortUrl(link.healthFinalUrl, 40)}</span>
                </span>
              </DropdownMenuItem>
            )}
            {!link.archived && (
              <DropdownMenuItem onSelect={() => lib.checkLinks([link.id])}>
                <ShieldCheck />
                Verificar link
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => lib.edit(link)}>
              <Pencil />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => lib.move([link.id])}>
              <FolderInput />
              Mover para…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => lib.archive([link.id], !link.archived)}>
              {link.archived ? <ArchiveRestore /> : <Archive />}
              {link.archived ? "Restaurar" : "Arquivar"}
            </DropdownMenuItem>
            <DropdownMenuItem danger onSelect={() => lib.remove([link.id])}>
              <Trash2 />
              Excluir
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
          className="relative z-10 shrink-0 rounded-full bg-subtle px-2 py-0.5 text-xs text-ink-2 hover:bg-hover hover:text-ink"
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
  const selected = useSelected(link.id);
  const selectionMode = useSelectionMode();
  return (
    <article
      {...dnd.props}
      className={cn(
        "group relative flex flex-col overflow-visible rounded-card border bg-surface transition-[box-shadow,transform,opacity] hover:-translate-y-px hover:shadow-raise dark:hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,.7)]",
        selected ? "border-accent ring-2 ring-accent/25" : "border-line",
        dnd.dragging && "opacity-50",
      )}
    >
      {dnd.pos && <span aria-hidden className={cn("absolute bottom-2 top-2 z-20 w-[3px] rounded-full bg-accent", dnd.pos === "before" ? "-left-[10px]" : "-right-[10px]")} />}
      <div className="relative h-[112px] overflow-hidden rounded-t-[13px]">
        <Cover link={link} />
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4 pt-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <SiteIcon src={link.icon || link.favicon} label={link.domain || link.title} size={18} />
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onClick={onClick}
            onAuxClick={onAuxClick}
            className="min-w-0 truncate text-lead font-semibold text-ink outline-none after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent"
          >
            <Highlight text={link.title} terms={lib.highlight} />
          </a>
        </div>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-mono text-xs text-muted">{link.domain}</span>
          <HealthDot link={link} />
        </span>
        <Summary link={link} className="line-clamp-2 text-body leading-[19px] text-ink-2" />
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
          <Star className="size-[15px] fill-amber-ink text-amber-ink" aria-label="Favorito" />
        </span>
      )}
      <div className="absolute right-2.5 top-2.5 z-10 flex gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
        <button type="button" aria-label="Abrir no app" title="Abrir no app" className={cn(floatBtn, "pointer-coarse:hidden")} onClick={() => opener.openInApp(link)}>
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
  const selected = useSelected(link.id);
  const selectionMode = useSelectionMode();
  return (
    <div
      {...dnd.props}
      className={cn(
        "group relative flex items-center gap-3 rounded-control border bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2",
        selected ? "border-accent ring-2 ring-accent/25" : "border-line",
        dnd.dragging && "opacity-50",
      )}
    >
      {dnd.pos && <span aria-hidden className={cn("absolute left-2 right-2 z-20 h-[3px] rounded-full bg-accent", dnd.pos === "before" ? "-top-[6px]" : "-bottom-[6px]")} />}
      <span className="relative inline-flex">
        <SiteIcon src={link.icon || link.favicon} label={link.domain || link.title} size={32} className={cn("transition-opacity", (selected || selectionMode) && "opacity-0", lib.canEdit && "group-hover:opacity-30")} />
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
            className="truncate text-sm font-medium text-ink outline-none after:absolute after:inset-0 after:rounded-control after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent"
          >
            <Highlight text={link.title} terms={lib.highlight} />
          </a>
          <HealthDot link={link} />
        </span>
        <Summary link={link} className="truncate text-xs text-muted" />
        {lib.summaryFor(link) === "hidden" || !link.description ? <span className="truncate font-mono text-caption text-muted">{link.domain}</span> : null}
      </div>
      <div className="hidden shrink-0 gap-1.5 xl:flex">
        <Tags link={link} max={2} />
      </div>
      <div className="relative z-10 flex shrink-0 items-center">
        <StarButton
          link={link}
          className={cn(rowIconBtn, !link.starred && "opacity-0 focus-visible:opacity-100 group-hover:opacity-100")}
        />
        <LinkMenu
          link={link}
          trigger={
            <button type="button" aria-label="Mais ações" className={cn(rowIconBtn, "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100")}>
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

/** Sorts based on this user's opens show "last opened" in the date column instead of "added". */
const byOpen = (s: SortMode) => s === "visited" || s === "opened" || s === "foryou";

const listCols = "grid grid-cols-[minmax(0,1fr)_108px] gap-3 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_130px] md:gap-4";

function ListRow({ link }: { link: LinkItem }) {
  const { onClick, onAuxClick, lib } = useLinkHandlers(link);
  const dnd = useLinkDnd(link, "y");
  const selected = useSelected(link.id);
  const selectionMode = useSelectionMode();
  return (
    <div
      role="row"
      {...dnd.props}
      className={cn(
        listCols,
        "group relative min-h-[52px] items-center border-b border-line px-3 py-1.5 text-body last:border-b-0 hover:bg-surface-2 md:px-4",
        selected && "bg-accent-soft/60 hover:bg-accent-soft/80",
        dnd.dragging && "opacity-50",
      )}
    >
      {dnd.pos && <span aria-hidden className={cn("absolute left-2 right-2 z-20 h-[3px] rounded-full bg-accent", dnd.pos === "before" ? "-top-[2px]" : "-bottom-[2px]")} />}
      <span role="cell" className="flex min-w-0 items-center gap-3">
        <span className="relative inline-flex">
          <SiteIcon src={link.icon || link.favicon} label={link.domain || link.title} size={26} className={cn("transition-opacity", (selected || selectionMode) && "opacity-0", lib.canEdit && "group-hover:opacity-30")} />
          <span className="absolute inset-0 flex items-center justify-center">
            <Checkbox link={link} />
          </span>
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-baseline gap-2">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              draggable={false}
              onClick={onClick}
              onAuxClick={onAuxClick}
              className="truncate font-medium text-ink outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent"
            >
              <Highlight text={link.title} terms={lib.highlight} />
            </a>
            <span className="hidden shrink truncate font-mono text-xs text-muted lg:inline">{link.domain}</span>
            <HealthDot link={link} className="self-center" />
            {link.starred && <Star className="size-3 shrink-0 fill-amber-ink text-amber-ink" aria-label="Favorito" />}
          </span>
          <Summary link={link} className="truncate text-xs text-muted" />
        </span>
      </span>
      <span role="cell" className="min-w-0 truncate text-ink-2 max-md:hidden">
        {link.collectionId ? (
          <Link href={`/links?c=${link.collectionId}`} className="relative z-10 hover:text-accent-ink hover:underline">
            {link.collectionName}
          </Link>
        ) : (
          <span className="text-muted">—</span>
        )}
      </span>
      <span role="cell" className="flex min-w-0 gap-1.5 overflow-hidden max-md:hidden">
        <Tags link={link} max={3} />
      </span>
      <span role="cell" className="flex items-center justify-between gap-2 text-muted">
        <span suppressHydrationWarning className="whitespace-nowrap">
          {byOpen(lib.sort) ? (link.myLastOpenedAt ? timeAgo(link.myLastOpenedAt) : "nunca") : timeAgo(link.createdAt)}
        </span>
        <span className="relative z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100 pointer-coarse:opacity-100">
          <LinkMenu
            link={link}
            trigger={
              <button type="button" aria-label="Mais ações" className={rowIconBtn}>
                <MoreHorizontal />
              </button>
            }
          />
        </span>
      </span>
    </div>
  );
}

function ListView({ links }: { links: LinkItem[] }) {
  const lib = useLibrary();
  const head = (label: string, sort?: "title" | "recent" | "visited") =>
    sort ? (
      <button
        type="button"
        onClick={() => lib.sortBy(sort)}
        className={cn("inline-flex items-center gap-1 text-left hover:text-ink", lib.sort === sort && "text-ink")}
        aria-label={`Ordenar por ${label}`}
      >
        {label}
        <ArrowDownUp className={cn("size-3", lib.sort === sort ? "opacity-100" : "opacity-40")} aria-hidden />
      </button>
    ) : (
      label
    );
  return (
    <div role="table" aria-label="Links" className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div role="row" className={cn(listCols, "h-[38px] items-center border-b border-line bg-surface-2 px-3 text-xs font-medium text-muted md:px-4")}>
        <span role="columnheader">{head("Nome", "title")}</span>
        <span role="columnheader" className="max-md:hidden">Coleção</span>
        <span role="columnheader" className="max-md:hidden">Tags</span>
        <span role="columnheader">{byOpen(lib.sort) ? head("Aberto", "visited") : head("Adicionado", "recent")}</span>
      </div>
      {links.map((l) => (
        <ListRow key={l.id} link={l} />
      ))}
    </div>
  );
}

export function LinkViews({ links, view }: { links: LinkItem[]; view: ViewMode }) {
  if (view === "list") return <ListView links={links} />;
  if (view === "compact") {
    return (
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 lg:grid-cols-2">
        {links.map((l) => (
          <CompactRow key={l.id} link={l} />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(232px,1fr))]">
      {links.map((l) => (
        <LinkCard key={l.id} link={l} />
      ))}
    </div>
  );
}
