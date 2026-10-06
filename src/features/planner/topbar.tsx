"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ClipboardCopy, CloudOff, Presentation, Download, Eye, FileJson, FileUp, History, ImageDown, Layers, Loader2, MoreHorizontal, Pencil, PenLine, Printer, Redo2, Share2, TriangleAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { cn, timeAgo } from "@/lib/utils";
import type { SaveStatus } from "./autosave";

export type ExportKind = "json" | "png" | "svg" | "pdf" | "frames-pdf" | "excalidraw" | "excalidraw-png" | "excalidraw-svg" | "excalidraw-copy";

export function SaveIndicator({ status, error, savedAt }: { status: SaveStatus; error?: string | null; savedAt?: number | null }) {
  // Re-render now and then so "há 2 min" stays true.
  const [, tick] = useState(0);
  useEffect(() => {
    if (status !== "saved" || !savedAt) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [status, savedAt]);
  const ago = savedAt ? timeAgo(savedAt) : null;
  const map: Record<SaveStatus, { icon: React.ReactNode; text: string; cls: string }> = {
    saved: { icon: <Check className="size-3.5 text-success-ink" />, text: ago && ago !== "agora" ? `Salvo ${ago}` : "Salvo", cls: "text-muted" },
    // While edits are queued (debounce) just a quiet dot; the spinner is for the request itself.
    dirty: { icon: <span className="size-1.5 rounded-full bg-amber-ink/70" aria-hidden />, text: "Editando…", cls: "text-muted" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Salvando…", cls: "text-muted" },
    offline: { icon: <CloudOff className="size-3.5" />, text: "Alterações offline — tentando novamente", cls: "text-amber-ink" },
    conflict: { icon: <TriangleAlert className="size-3.5" />, text: "Conflito", cls: "text-danger" },
    error: { icon: <TriangleAlert className="size-3.5" />, text: error ?? "Erro ao salvar", cls: "text-danger" },
  };
  const m = map[status];
  return (
    <span role="status" aria-live="polite" className={cn("ml-1 inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-xs", m.cls)}>
      {m.icon}
      <span className="truncate max-sm:sr-only">{m.text}</span>
    </span>
  );
}

export function PublishBadge({ published, unpublished }: { published: number | null; unpublished: boolean }) {
  if (published == null) return <Badge tone="amber">Rascunho</Badge>;
  if (unpublished)
    return (
      <Badge tone="amber" className="whitespace-nowrap">
        Alterações não publicadas
      </Badge>
    );
  return <Badge tone="success">Publicado v{published}</Badge>;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase() || "?";
}

const AVATAR_TINTS = [
  ["#DCE2FB", "#2440B8"],
  ["#DDF4EE", "#0F6E5C"],
  ["#FFEADB", "#A84A0F"],
  ["#EFE9FF", "#5B3FC4"],
];

export function Avatars({ people }: { people: { name: string; email: string }[] }) {
  const shown = people.slice(0, 3);
  return (
    <div className="mr-1.5 flex" aria-label={`Pessoas com acesso: ${people.map((p) => p.name).join(", ")}`}>
      {shown.map((p, i) => (
        <Tooltip key={p.email} content={`${p.name} · ${p.email}`}>
          <span
            className={cn("inline-flex size-7 items-center justify-center rounded-full border-2 border-surface text-caption font-semibold", i > 0 && "-ml-2")}
            style={{ background: AVATAR_TINTS[i % 4][0], color: AVATAR_TINTS[i % 4][1] }}
          >
            {initials(p.name)}
          </span>
        </Tooltip>
      ))}
      {people.length > 3 && <span className="-ml-2 inline-flex size-7 items-center justify-center rounded-full border-2 border-surface bg-subtle text-caption font-medium text-ink-2">+{people.length - 3}</span>}
    </div>
  );
}

/** One submenu per saved view: the image or PDF of just that combination of layers. */
export function ViewExportItems({ views, onExport }: { views: { id: string; name: string }[]; onExport: (k: ExportKind, viewId: string) => void }) {
  if (!views.length) return null;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Exportar visão</DropdownMenuLabel>
      {views.map((v) => (
        <DropdownMenuSub key={v.id}>
          <DropdownMenuSubTrigger>
            <Layers /> <span className="max-w-[180px] truncate">{v.name}</span>
            <ChevronRight className="ml-auto text-muted" />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[170px]">
            <DropdownMenuItem onSelect={() => onExport("png", v.id)}>
              <ImageDown /> Imagem PNG
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport("svg", v.id)}>
              <Download /> Vetor SVG
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport("pdf", v.id)}>
              <Printer /> PDF (imprimir)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport("excalidraw", v.id)}>
              <PenLine /> Excalidraw
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ))}
    </>
  );
}

/** Excalidraw: the file, images that open as editable drawings, the clipboard, and importing. */
export function ExcalidrawItems({ onExport, onImport }: { onExport: (k: ExportKind) => void; onImport?: () => void }) {
  return (
    <>
      <DropdownMenuLabel>Excalidraw</DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => onExport("excalidraw")}>
        <PenLine /> Arquivo .excalidraw
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onExport("excalidraw-png")}>
        <ImageDown /> PNG editável no Excalidraw
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onExport("excalidraw-svg")}>
        <Download /> SVG editável no Excalidraw
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onExport("excalidraw-copy")}>
        <ClipboardCopy /> Copiar para colar no Excalidraw
      </DropdownMenuItem>
      {onImport && (
        <DropdownMenuItem onSelect={onImport}>
          <FileUp /> Importar do Excalidraw…
        </DropdownMenuItem>
      )}
    </>
  );
}

export function ExportMenu({
  onExport,
  onImport,
  trigger,
  views = [],
  frames = 0,
}: {
  onExport: (k: ExportKind, viewId?: string) => void;
  /** "Importar do Excalidraw…" (editor only). */
  onImport?: () => void;
  trigger?: React.ReactNode;
  views?: { id: string; name: string }[];
  /** The plan has frames: offers one PDF page per frame. */
  frames?: number;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" aria-label="Mais opções">
            <MoreHorizontal />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Exportar</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onExport("png")}>
          <ImageDown /> Imagem PNG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport("svg")}>
          <Download /> Vetor SVG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport("pdf")}>
          <Printer /> PDF (imprimir)
        </DropdownMenuItem>
        {frames > 0 && (
          <DropdownMenuItem onSelect={() => onExport("frames-pdf")}>
            <Printer /> Quadros como páginas (PDF · {frames})
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onExport("json")}>
          <FileJson /> JSON
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ExcalidrawItems onExport={onExport} onImport={onImport} />
        <ViewExportItems views={views} onExport={onExport} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EditorTopbar(props: {
  planId: string;
  workspaceName: string;
  title: string;
  onRename: (t: string) => void;
  published: number | null;
  unpublished: boolean;
  status: SaveStatus;
  saveError?: string | null;
  mode: "edit" | "preview";
  onMode: (m: "edit" | "preview") => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onHistory: () => void;
  onPresent: () => void;
  savedAt: number | null;
  onShare: () => void;
  onPublish: () => void;
  publishing: boolean;
  people: { name: string; email: string }[];
  onExport: (k: ExportKind, viewId?: string) => void;
  onImport?: () => void;
  /** Frames in the plan (export menu: one PDF page per frame). */
  frames?: number;
  /** Saved views (export menu). */
  views?: { id: string; name: string }[];
  /** Comments panel toggle. */
  comments?: React.ReactNode;
}) {
  const [title, setTitle] = useState(props.title);
  useEffect(() => setTitle(props.title), [props.title]);
  const commit = () => {
    const t = title.trim();
    if (!t) setTitle(props.title);
    else if (t !== props.title) props.onRename(t);
  };
  const seg = (m: "edit" | "preview", label: string, Icon: typeof Pencil) => (
    <button
      type="button"
      role="radio"
      aria-checked={props.mode === m}
      onClick={() => props.onMode(m)}
      className={cn(
        "inline-flex h-[30px] items-center gap-1.5 rounded-chip px-3 text-body font-medium transition-colors",
        props.mode === m ? "bg-surface text-ink shadow-thumb" : "text-muted hover:text-ink",
      )}
    >
      <Icon className="size-3.5" />
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );
  return (
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line bg-surface pl-1 pr-2 sm:gap-3 sm:pl-2 sm:pr-3">
      <Tooltip content="Voltar para Plans">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar para Plans">
          <Link href="/plans">
            <ChevronLeft className="!size-[18px]" />
          </Link>
        </Button>
      </Tooltip>
      <div className="flex min-w-0 flex-1 basis-0 items-center gap-2 text-sm">
        <span className="hidden shrink-0 text-muted md:inline">{props.workspaceName}</span>
        <span className="hidden text-line-2 md:inline" aria-hidden>
          /
        </span>
        <input
          aria-label="Título do plan"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setTitle(props.title);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="min-w-[80px] max-w-[320px] truncate rounded-md bg-transparent px-1 py-0.5 font-semibold outline-none hover:bg-hover focus:bg-surface focus:ring-2 focus:ring-accent/30"
          style={{ width: `${Math.max(8, title.length + 2)}ch` }}
        />
        <span className="hidden sm:contents">
          <PublishBadge published={props.published} unpublished={props.unpublished} />
        </span>
        <SaveIndicator status={props.status} error={props.saveError} savedAt={props.savedAt} />
      </div>
      <div role="radiogroup" aria-label="Modo" className="flex shrink-0 gap-0.5 rounded-control bg-subtle p-[3px] max-sm:hidden">
        {seg("edit", "Editar", Pencil)}
        {seg("preview", "Visualizar", Eye)}
      </div>
      <div className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-1">
        <Tooltip content="Desfazer (⌘Z)">
          <Button variant="ghost" size="icon" aria-label="Desfazer" disabled={!props.canUndo} onClick={props.onUndo}>
            <Undo2 />
          </Button>
        </Tooltip>
        <Tooltip content="Refazer (⌘⇧Z)">
          <Button variant="ghost" size="icon" aria-label="Refazer" disabled={!props.canRedo} onClick={props.onRedo}>
            <Redo2 />
          </Button>
        </Tooltip>
        <span className="hidden md:contents">
          <Tooltip content="Apresentar (tela cheia, passo a passo)">
            <Button variant="ghost" size="icon" aria-label="Apresentar" onClick={props.onPresent}>
              <Presentation />
            </Button>
          </Tooltip>
          <Tooltip content="Histórico de versões">
            <Button variant="ghost" size="icon" aria-label="Histórico de versões" onClick={props.onHistory}>
              <History />
            </Button>
          </Tooltip>
        </span>
        {props.comments}
        <span className="hidden md:contents">
          <ExportMenu onExport={props.onExport} onImport={props.onImport} views={props.views} frames={props.frames} />
          <span className="mx-1.5 h-5 w-px bg-line" aria-hidden />
          <span className="hidden lg:contents">
            <Avatars people={props.people} />
          </span>
          <Button variant="secondary" size="sm" className="h-[34px]" onClick={props.onShare}>
            <Share2 /> Compartilhar
          </Button>
        </span>
        <Button variant="primary" size="sm" className="h-[34px]" onClick={props.onPublish} disabled={props.publishing}>
          {props.publishing && <Loader2 className="animate-spin" />}
          Publicar
        </Button>
      </div>
    </header>
  );
}
