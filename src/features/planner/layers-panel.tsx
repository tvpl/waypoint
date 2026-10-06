"use client";
import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  ExternalLink,
  Focus,
  Folder,
  FolderInput,
  FolderMinus,
  FolderOpen,
  GripVertical,
  LayoutTemplate,
  Lock,
  LockOpen,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Presentation,
  RefreshCw,
  Save,
  ScanEye,
  SquareMousePointer,
  SunDim,
  Trash2,
  Waves,
  X,
} from "lucide-react";
import { BASE_LAYER_ID, LAYER_COLORS, LAYER_TEMPLATES, layerOpacity } from "@/domain/layers";
import type { NodeKind, PlanLayer, PlanView } from "@/domain/plan";
import type { PlanFlowEdge, PlanFlowNode } from "@/domain/canvas-adapter";
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
import { ask } from "@/components/ui/ask";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { OnionSection, OverlayPlanButton } from "./overlay-panel";
import { KIND_LABEL } from "./defaults";
import { ConnectorIcon, KIND_ICON } from "./icons";
import { pairsOf } from "./ink-geometry";

const LAYER_MIME = "application/x-wp-layer";
const ELEMENT_MIME = "application/x-wp-element";
const VIEW_MIME = "application/x-wp-view";

const iconBtn =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 [&_svg]:size-3.5";

const layerOf = (n: { data: { _layer?: string } }) => n.data._layer ?? BASE_LAYER_ID;
const edgeLayerOf = (e: PlanFlowEdge) => e.data?.layer ?? BASE_LAYER_ID;

// ------------------------------------------------------------------ thumbnails

type Frame = { x: number; y: number; w: number; h: number };
type Box = { id: string; x: number; y: number; w: number; h: number; node: PlanFlowNode };

/** Absolute boxes of every node (children are stored relative to their parent) and the plan's frame. */
function useBoxes(nodes: PlanFlowNode[]): { boxes: Map<string, Box>; frame: Frame } {
  return React.useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const boxes = new Map<string, Box>();
    const abs = (n: PlanFlowNode, seen = new Set<string>()): { x: number; y: number } => {
      const p = n.parentId ? byId.get(n.parentId) : undefined;
      if (!p || seen.has(p.id)) return { x: n.position.x, y: n.position.y };
      seen.add(p.id);
      const pp = abs(p, seen);
      return { x: pp.x + n.position.x, y: pp.y + n.position.y };
    };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      const { x, y } = abs(n);
      const w = n.width ?? n.measured?.width ?? 0;
      const h = n.height ?? n.measured?.height ?? 0;
      boxes.set(n.id, { id: n.id, x, y, w, h, node: n });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    if (!Number.isFinite(minX)) return { boxes, frame: { x: 0, y: 0, w: 1, h: 1 } };
    const pad = Math.max(maxX - minX, maxY - minY) * 0.06 + 10;
    return { boxes, frame: { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 } };
  }, [nodes]);
}

/**
 * What is on some layers, drawn in the frame of the whole plan (so the thumbnail also shows where
 * the content sits): areas and blocks as boxes, connections as lines, drawings as their strokes.
 */
function Thumb({ layers, color, boxes, frame, edges }: { layers: ReadonlySet<string>; color?: string; boxes: Map<string, Box>; frame: Frame; edges: PlanFlowEdge[] }) {
  const tint = color ?? "var(--muted)";
  const items = [...boxes.values()].filter((b) => layers.has(layerOf(b.node)));
  const sw = Math.max(frame.w, frame.h) / 110;
  return (
    <svg viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full" aria-hidden>
      {edges
        .filter((e) => layers.has(edgeLayerOf(e)))
        .map((e) => {
          const a = boxes.get(e.source);
          const b = boxes.get(e.target);
          if (!a || !b) return null;
          return <line key={e.id} x1={a.x + a.w / 2} y1={a.y + a.h / 2} x2={b.x + b.w / 2} y2={b.y + b.h / 2} stroke={tint} strokeWidth={sw} strokeOpacity={0.55} />;
        })}
      {items.map((b) => {
        const ink = b.node.data.ink;
        if (ink && !ink.shape) {
          const pts = pairsOf(ink.points);
          const sx = b.w / ink.w;
          const sy = b.h / ink.h;
          const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${(b.x + px * sx).toFixed(1)} ${(b.y + py * sy).toFixed(1)}`).join(" ");
          return <path key={b.id} d={d} fill="none" stroke={b.node.data.color ?? tint} strokeWidth={sw * 1.4} strokeLinecap="round" strokeLinejoin="round" />;
        }
        if (ink?.shape === "text") return <rect key={b.id} x={b.x} y={b.y + b.h * 0.35} width={b.w} height={b.h * 0.3} rx={sw} fill={b.node.data.color ?? tint} fillOpacity={0.6} />;
        const area = b.node.type === "container" || b.node.type === "section";
        return (
          <rect
            key={b.id}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={ink?.shape === "ellipse" ? Math.min(b.w, b.h) / 2 : sw * 3}
            fill={ink ? "none" : tint}
            fillOpacity={area ? 0.08 : 0.3}
            stroke={ink && b.node.data.color ? b.node.data.color : tint}
            strokeOpacity={area ? 0.45 : 0.75}
            strokeWidth={sw}
            strokeDasharray={area ? `${sw * 3} ${sw * 2}` : undefined}
          />
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ drag and drop

type Drop = { id: string; where: "above" | "below" | "into" } | null;

function readJson<T>(e: React.DragEvent, mime: string): T | null {
  try {
    const raw = e.dataTransfer.getData(mime);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ layer row

function LayerRow({
  layer,
  index,
  total,
  thumb,
  drop,
  setDrop,
  onDropLayer,
  groups,
  nested,
}: {
  layer: PlanLayer;
  index: number;
  total: number;
  thumb: React.ReactNode;
  drop: Drop;
  setDrop: (d: Drop) => void;
  onDropLayer: (dragged: string, target: PlanLayer, where: "above" | "below") => void;
  groups: string[];
  nested: boolean;
}) {
  const ed = useEditor();
  const L = ed.layers;
  const active = L.active === layer.id;
  const visible = layer.visible !== false;
  const count = L.counts.get(layer.id) ?? 0;
  const [renaming, setRenaming] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const base = layer.id === BASE_LAYER_ID;
  const hasSelection = ed.selectedNodes.length > 0 || ed.selectedEdges.length > 0;
  const opacity = layerOpacity(layer);
  const isolated = L.isolated === layer.id;
  const dimmedByIsolation = !!L.isolated && !isolated;
  const marker = drop?.id === layer.id ? drop.where : null;
  const overlay = layer.source ? L.overlays.get(layer.source.planId) : undefined;
  const sub = layer.source
    ? [
        overlay?.status === "error" ? overlay.error : overlay?.status === "ok" ? `Sobreposição · ${overlay.count} ${overlay.count === 1 ? "elemento" : "elementos"}` : "Sobreposição · carregando…",
        count ? `+${count}` : null,
        opacity < 1 ? `${Math.round(opacity * 100)}%` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : [count ? `${count} ${count === 1 ? "elemento" : "elementos"}` : "vazia", opacity < 1 ? `${Math.round(opacity * 100)}%` : null].filter(Boolean).join(" · ");

  return (
    <li className={cn("relative", dimmedByIsolation && "opacity-50")}>
      {marker === "above" && <span className="pointer-events-none absolute inset-x-1 -top-px z-10 h-0.5 rounded-full bg-accent" aria-hidden />}
      {marker === "below" && <span className="pointer-events-none absolute inset-x-1 -bottom-px z-10 h-0.5 rounded-full bg-accent" aria-hidden />}
      <div
        draggable={!renaming}
        onDragStart={(e) => {
          e.dataTransfer.setData(LAYER_MIME, JSON.stringify(layer.id));
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          const isLayer = e.dataTransfer.types.includes(LAYER_MIME);
          const isElement = e.dataTransfer.types.includes(ELEMENT_MIME);
          if (!isLayer && !isElement) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          setDrop({ id: layer.id, where: isElement ? "into" : e.clientY < r.top + r.height / 2 ? "above" : "below" });
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null) && drop?.id === layer.id) setDrop(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDrop(null);
          const el = readJson<{ nodes?: string[]; edges?: string[] }>(e, ELEMENT_MIME);
          if (el) return L.assignTo(layer.id, el);
          const dragged = readJson<string>(e, LAYER_MIME);
          if (dragged && dragged !== layer.id) {
            const r = e.currentTarget.getBoundingClientRect();
            onDropLayer(dragged, layer, e.clientY < r.top + r.height / 2 ? "above" : "below");
          }
        }}
        className={cn(
          "group flex h-[46px] items-center gap-1.5 rounded-lg pl-0.5 pr-1 transition-colors",
          active ? "bg-accent-soft" : "hover:bg-surface-2",
          marker === "into" && "ring-2 ring-accent/50",
          nested && "ml-3",
        )}
      >
        <span className="flex w-3 shrink-0 cursor-grab justify-center text-muted opacity-0 group-hover:opacity-60" aria-hidden>
          <GripVertical className="size-3" />
        </span>
        <button
          type="button"
          aria-label={open ? `Recolher elementos de ${layer.name}` : `Mostrar elementos de ${layer.name}`}
          aria-expanded={open}
          className={cn(iconBtn, "-ml-1 size-5")}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
        </button>

        <DropdownMenu>
          <Tooltip content="Cor da camada" side="right">
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Cor de ${layer.name}`}
                className={cn("relative h-[32px] w-[46px] shrink-0 overflow-hidden rounded-md border bg-surface", active ? "border-accent-line" : "border-line", !visible && "opacity-45")}
              >
                <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: layer.color ?? "var(--muted)" }} aria-hidden />
                <span className="absolute inset-[3px] left-[6px]">{thumb}</span>
              </button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="start" className="min-w-0 p-2">
            <div className="grid grid-cols-4 gap-1.5">
              {LAYER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => L.update(layer.id, { color: c })}
                  className="size-6 rounded-full border-2 border-surface"
                  style={{ background: c, boxShadow: layer.color === c ? "0 0 0 2px var(--accent)" : "0 0 0 1px var(--line-2)" }}
                />
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {renaming ? (
          <input
            autoFocus
            defaultValue={layer.name}
            maxLength={80}
            aria-label="Nome da camada"
            className="h-7 min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 text-body text-ink outline-none"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== layer.name) L.update(layer.id, { name: v });
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left outline-none"
            onClick={() => L.setActive(layer.id)}
            onDoubleClick={() => setRenaming(true)}
            title={active ? "Camada ativa: novos elementos, conexões e desenhos entram aqui. Duplo clique para renomear." : "Clique para tornar ativa; duplo clique para renomear."}
            aria-pressed={active}
          >
            <span className={cn("w-full truncate text-body font-medium leading-none", active ? "text-accent-ink" : "text-ink", !visible && "text-muted line-through decoration-muted/60")}>{layer.name}</span>
            <span className="flex w-full min-w-0 items-center gap-1 text-caption leading-none text-muted">
              <span className="truncate">{sub}</span>
              {isolated && <ScanEye className="size-3 shrink-0 text-accent-ink" aria-label="Isolada" />}
              {layer.animate && <Waves className="size-3 shrink-0" aria-label="Conexões animadas" />}
              {layer.reveal && <Presentation className="size-3 shrink-0" aria-label="Revelada na apresentação" />}
            </span>
          </button>
        )}

        <Tooltip content={visible ? "Ocultar (⌥ clique: mostrar só esta)" : "Mostrar"} side="right">
          <button
            type="button"
            aria-label={visible ? `Ocultar ${layer.name}` : `Mostrar ${layer.name}`}
            aria-pressed={visible}
            className={cn(iconBtn, !visible && "text-ink-2")}
            onClick={(e) => (e.altKey ? L.solo(layer.id) : L.update(layer.id, { visible: !visible }))}
          >
            {visible ? <Eye /> : <EyeOff />}
          </button>
        </Tooltip>
        <Tooltip content={layer.locked ? "Destravar" : "Travar (não seleciona nem move)"} side="right">
          <button
            type="button"
            aria-label={layer.locked ? `Destravar ${layer.name}` : `Travar ${layer.name}`}
            aria-pressed={!!layer.locked}
            className={cn(iconBtn, layer.locked ? "text-ink-2" : "hidden group-focus-within:inline-flex group-hover:inline-flex")}
            onClick={() => L.update(layer.id, { locked: !layer.locked })}
          >
            {layer.locked ? <Lock /> : <LockOpen />}
          </button>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Mais opções de ${layer.name}`} className={cn(iconBtn, "hidden group-focus-within:inline-flex group-hover:inline-flex data-[state=open]:inline-flex")}>
              <MoreHorizontal />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[240px]">
            <DropdownMenuItem onSelect={() => setTimeout(() => setRenaming(true), 50)}>
              <Pencil /> Renomear
            </DropdownMenuItem>
            {hasSelection && (
              <DropdownMenuItem onSelect={() => L.assignSelection(layer.id)}>
                <ArrowDown className="-rotate-90" /> Mover seleção para cá
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => L.selectLayer(layer.id)} disabled={!count || !visible || !!layer.locked}>
              <SquareMousePointer /> Selecionar elementos
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => L.setIsolated(isolated ? null : layer.id)}>
              <ScanEye /> {isolated ? "Sair do isolamento" : "Isolar (editar só esta)"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => L.solo(layer.id)}>
              <Focus /> Mostrar só esta {base ? "" : "(e a base)"}
            </DropdownMenuItem>
            <OpacityField layer={layer} />
            <DropdownMenuItem onSelect={() => L.update(layer.id, { animate: !layer.animate })}>
              <Waves /> Animar conexões (mostrar fluxo)
              {layer.animate && <Check className="ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => L.update(layer.id, { reveal: !layer.reveal })}>
              <Presentation /> Revelar na apresentação
              {layer.reveal && <Check className="ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => L.comment(layer.id)}>
              <MessageSquare /> Comentar nesta camada
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput /> Mover para pasta
                <ChevronRight className="ml-auto text-muted" />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[200px]">
                {groups.map((g) => (
                  <DropdownMenuItem key={g} onSelect={() => L.setGroup([layer.id], g)} disabled={layer.group === g}>
                    <Folder /> <span className="truncate">{g}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onSelect={async () => {
                    const name = await ask.prompt({ title: "Nova pasta", description: "Agrupa camadas (ex.: “Versões”, “Alternativas”).", label: "Nome", placeholder: "Ex.: Versões", confirmLabel: "Criar" });
                    if (name?.trim()) L.setGroup([layer.id], name.trim());
                  }}
                >
                  <Plus /> Nova pasta…
                </DropdownMenuItem>
                {layer.group && (
                  <DropdownMenuItem onSelect={() => L.setGroup([layer.id], undefined)}>
                    <FolderMinus /> Tirar da pasta
                  </DropdownMenuItem>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {layer.source && (
              <DropdownMenuItem onSelect={() => window.open(`/plans/${encodeURIComponent(layer.source!.planId)}`, "_blank", "noopener")}>
                <ExternalLink /> Abrir o plan sobreposto
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => L.move(layer.id, "up")} disabled={index === total - 1}>
              <ArrowUp /> Subir
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => L.move(layer.id, "down")} disabled={index === 0}>
              <ArrowDown /> Descer
            </DropdownMenuItem>
            {!base && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="text-danger">
                    <Trash2 /> Excluir camada
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[250px]">
                    <DropdownMenuItem onSelect={() => L.remove(layer.id, "merge")}>Manter os elementos na camada de baixo</DropdownMenuItem>
                    <DropdownMenuItem
                      danger
                      onSelect={async () => {
                        const ok = await ask.confirm({
                          title: `Excluir “${layer.name}” e o que há nela?`,
                          description: `${count} ${count === 1 ? "elemento ou conexão" : "elementos e conexões"} serão removidos. Dá para desfazer (⌘Z).`,
                          confirmLabel: "Excluir",
                          danger: true,
                        });
                        if (ok) L.remove(layer.id, "delete");
                      }}
                    >
                      Excluir junto com os elementos
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && <LayerElements layer={layer} nested={nested} />}
    </li>
  );
}

/** The layer's top-level elements and connections: hover outlines, click selects, drag moves to another layer. */
function LayerElements({ layer, nested }: { layer: PlanLayer; nested: boolean }) {
  const ed = useEditor();
  const L = ed.layers;
  const byId = React.useMemo(() => new Map(ed.nodes.map((n) => [n.id, n])), [ed.nodes]);
  const nodes = ed.nodes.filter((n) => !n.parentId && layerOf(n) === layer.id);
  const edges = ed.edges.filter((e) => edgeLayerOf(e) === layer.id);
  const name = (n?: PlanFlowNode) => (n ? n.data.title || KIND_LABEL[n.type as NodeKind] || "Elemento" : "?");
  const selected = new Set([...ed.selectedNodes.map((n) => n.id), ...ed.selectedEdges.map((e) => e.id)]);
  if (!nodes.length && !edges.length) return <p className={cn("py-1.5 pl-9 text-caption text-muted", nested && "ml-3")}>Nada nesta camada ainda.</p>;
  const row = (key: string, icon: React.ReactNode, label: string, payload: { nodes?: string[]; edges?: string[] }, select: () => void, hidden?: boolean) => (
    <li key={key}>
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(ELEMENT_MIME, JSON.stringify(payload));
          e.dataTransfer.effectAllowed = "move";
        }}
        onMouseEnter={() => payload.nodes && L.hover(payload.nodes[0])}
        onMouseLeave={() => L.hover(null)}
        onClick={select}
        onDoubleClick={() => payload.nodes && ed.focusNode(payload.nodes[0])}
        className={cn(
          "flex h-7 w-full items-center gap-2 rounded-md pl-9 pr-2 text-left text-body outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          selected.has(key) ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2",
          hidden && "opacity-55",
          nested && "ml-3",
        )}
        title={`${label} — arraste para outra camada`}
      >
        {icon}
        <span className="truncate">{label}</span>
      </button>
    </li>
  );
  return (
    <ul className="flex flex-col pb-1" aria-label={`Elementos de ${layer.name}`}>
      {nodes.map((n) => {
        const Icon = KIND_ICON[n.type as NodeKind] ?? KIND_ICON.block;
        const ink = n.data.ink;
        const label = n.type === "ink" ? (ink?.shape === "text" ? n.data.title || "Texto" : ink?.shape === "rect" ? "Retângulo" : ink?.shape === "ellipse" ? "Elipse" : ink?.arrow ? "Seta" : "Desenho") : name(n);
        return row(n.id, <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />, label, { nodes: [n.id] }, () => ed.select([n.id]), n.hidden);
      })}
      {edges.map((e) =>
        row(
          e.id,
          <ConnectorIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />,
          e.data?.label || `${name(byId.get(e.source))} → ${name(byId.get(e.target))}`,
          { edges: [e.id] },
          () => ed.select([], [e.id]),
          e.hidden,
        ),
      )}
    </ul>
  );
}

/** Layer opacity, inside the layer menu (the arrow keys adjust it in steps). */
function OpacityField({ layer }: { layer: PlanLayer }) {
  const L = useEditor().layers;
  const value = Math.round(layerOpacity(layer) * 100);
  const id = React.useId();
  return (
    <div className="flex h-9 items-center gap-2.5 px-2.5 text-body" onKeyDown={(e) => e.stopPropagation()}>
      <SunDim className="size-[15px] shrink-0 text-ink-2" aria-hidden />
      <label htmlFor={id} className="shrink-0">
        Opacidade
      </label>
      <input
        id={id}
        type="range"
        min={10}
        max={100}
        step={5}
        value={value}
        onChange={(e) => L.update(layer.id, { opacity: Number(e.target.value) / 100 })}
        className="h-1 min-w-0 flex-1 accent-[var(--accent)]"
      />
      <span className="w-9 shrink-0 text-right text-caption tabular-nums text-muted">{value}%</span>
    </div>
  );
}

// ------------------------------------------------------------------ folders

function FolderRow({ name, layers, collapsed, onToggle, drop, setDrop }: { name: string; layers: PlanLayer[]; collapsed: boolean; onToggle: () => void; drop: Drop; setDrop: (d: Drop) => void }) {
  const L = useEditor().layers;
  const [renaming, setRenaming] = React.useState(false);
  const allVisible = layers.every((l) => l.visible !== false);
  const allLocked = layers.every((l) => l.locked);
  const key = `folder:${name}`;
  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(LAYER_MIME)) return;
        e.preventDefault();
        setDrop({ id: key, where: "into" });
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && drop?.id === key && setDrop(null)}
      onDrop={(e) => {
        e.preventDefault();
        setDrop(null);
        const dragged = readJson<string>(e, LAYER_MIME);
        if (dragged) L.setGroup([dragged], name);
      }}
      className={cn("group flex h-9 items-center gap-1.5 rounded-lg pl-1 pr-1 hover:bg-surface-2", drop?.id === key && "ring-2 ring-accent/50")}
    >
      <button type="button" aria-expanded={!collapsed} aria-label={collapsed ? `Abrir pasta ${name}` : `Fechar pasta ${name}`} className={cn(iconBtn, "size-5")} onClick={onToggle}>
        <ChevronRight className={cn("transition-transform", !collapsed && "rotate-90")} />
      </button>
      {collapsed ? <Folder className="size-4 shrink-0 text-muted" aria-hidden /> : <FolderOpen className="size-4 shrink-0 text-muted" aria-hidden />}
      {renaming ? (
        <input
          autoFocus
          defaultValue={name}
          maxLength={80}
          aria-label="Nome da pasta"
          className="h-7 min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 text-body text-ink outline-none"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== name) L.renameGroup(name, v);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setRenaming(false);
          }}
        />
      ) : (
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={onToggle} onDoubleClick={() => setRenaming(true)}>
          <span className="truncate text-body font-semibold text-ink-2">{name}</span>
          <span className="text-caption tabular-nums text-muted">{layers.length}</span>
        </button>
      )}
      <Tooltip content={allVisible ? "Ocultar a pasta" : "Mostrar a pasta"} side="right">
        <button type="button" aria-label={allVisible ? `Ocultar pasta ${name}` : `Mostrar pasta ${name}`} className={iconBtn} onClick={() => layers.forEach((l) => L.update(l.id, { visible: !allVisible }))}>
          {allVisible ? <Eye /> : <EyeOff />}
        </button>
      </Tooltip>
      <Tooltip content={allLocked ? "Destravar a pasta" : "Travar a pasta"} side="right">
        <button
          type="button"
          aria-label={allLocked ? `Destravar pasta ${name}` : `Travar pasta ${name}`}
          className={cn(iconBtn, !allLocked && "opacity-0 group-hover:opacity-100")}
          onClick={() => layers.forEach((l) => L.update(l.id, { locked: !allLocked }))}
        >
          {allLocked ? <Lock /> : <LockOpen />}
        </button>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Mais opções da pasta ${name}`} className={cn(iconBtn, "opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100")}>
            <MoreHorizontal />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px]">
          <DropdownMenuItem onSelect={() => setTimeout(() => setRenaming(true), 50)}>
            <Pencil /> Renomear pasta
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => L.renameGroup(name, "")}>
            <FolderMinus /> Desfazer pasta (manter camadas)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ------------------------------------------------------------------ views

function ViewsSection({ boxes, frame }: { boxes: Map<string, Box>; frame: Frame }) {
  const ed = useEditor();
  const L = ed.layers;
  const [drop, setDrop] = React.useState<Drop>(null);
  const current = L.views.find((v) => {
    const on = new Set(v.layers);
    return L.list.every((l) => (l.visible !== false) === on.has(l.id));
  });
  return (
    <section className="flex flex-col gap-1.5" aria-label="Visões">
      <div className="flex items-center justify-between">
        <span className="text-caption font-semibold uppercase tracking-[.06em] text-muted">
          Visões {L.views.length > 0 && <span className="font-normal normal-case tracking-normal">· {L.views.length}</span>}
        </span>
        <Tooltip content="Salvar as camadas visíveis agora como uma visão" side="right">
          <button
            type="button"
            aria-label="Salvar visão atual"
            className={iconBtn}
            onClick={async () => {
              const name = await ask.prompt({ title: "Salvar visão", description: "Guarda quais camadas estão visíveis agora.", label: "Nome", placeholder: "Ex.: Fluxo atual", confirmLabel: "Salvar" });
              if (name?.trim()) L.saveView(name.trim());
            }}
          >
            <Save />
          </button>
        </Tooltip>
      </div>
      {L.views.length === 0 ? (
        <p className="text-caption leading-4 text-muted">Salve combinações de camadas visíveis (ex.: “Hoje”, “Com a proposta”) para alternar com um clique — também na leitura e na apresentação.</p>
      ) : (
        <ul className="-mx-1 flex flex-col gap-1" onDragEnd={() => setDrop(null)}>
          {L.views.map((v, i) => (
            <ViewRow key={v.id} view={v} index={i} active={current?.id === v.id} thumb={<Thumb layers={new Set(v.layers)} boxes={boxes} frame={frame} edges={ed.edges} />} drop={drop} setDrop={setDrop} />
          ))}
        </ul>
      )}
      {L.list.some((l) => l.visible === false) && (
        <button type="button" onClick={L.showAll} className="inline-flex h-7 items-center gap-1.5 self-start rounded-md px-1.5 text-caption font-medium text-accent-ink hover:bg-accent-soft">
          <Eye className="size-3.5" /> Mostrar todas as camadas
        </button>
      )}
    </section>
  );
}

function ViewRow({ view, index, active, thumb, drop, setDrop }: { view: PlanView; index: number; active: boolean; thumb: React.ReactNode; drop: Drop; setDrop: (d: Drop) => void }) {
  const L = useEditor().layers;
  const [renaming, setRenaming] = React.useState(false);
  const marker = drop?.id === view.id ? drop.where : null;
  return (
    <li className="relative">
      {marker === "above" && <span className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded-full bg-accent" aria-hidden />}
      {marker === "below" && <span className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent" aria-hidden />}
      <div
        draggable={!renaming}
        onDragStart={(e) => e.dataTransfer.setData(VIEW_MIME, view.id)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(VIEW_MIME)) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          setDrop({ id: view.id, where: e.clientY < r.top + r.height / 2 ? "above" : "below" });
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && drop?.id === view.id && setDrop(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDrop(null);
          const id = e.dataTransfer.getData(VIEW_MIME);
          if (!id || id === view.id) return;
          const from = L.views.findIndex((x) => x.id === id);
          const r = e.currentTarget.getBoundingClientRect();
          let to = e.clientY < r.top + r.height / 2 ? index : index + 1;
          if (from < to) to -= 1;
          L.reorderView(id, to);
        }}
        className={cn("group flex items-center gap-2 rounded-lg border p-1 pr-1.5 transition-colors", active ? "border-accent-line bg-accent-soft/60" : "border-transparent hover:bg-surface-2")}
      >
        <button type="button" className="h-[34px] w-[52px] shrink-0 overflow-hidden rounded-md border border-line bg-surface p-[3px]" onClick={() => L.applyView(view.id)} aria-label={`Aplicar visão ${view.name}`}>
          {thumb}
        </button>
        {renaming ? (
          <input
            autoFocus
            defaultValue={view.name}
            maxLength={80}
            aria-label="Nome da visão"
            className="h-7 min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 text-body text-ink outline-none"
            onBlur={(e) => {
              L.renameView(view.id, e.target.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <button type="button" className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" onClick={() => L.applyView(view.id)} onDoubleClick={() => setRenaming(true)}>
            <span className={cn("flex w-full items-center gap-1 text-body font-medium leading-none", active && "text-accent-ink")}>
              <span className="truncate">{view.name}</span>
              {active && <Check className="size-3.5 shrink-0" aria-label="Aplicada" />}
            </span>
            <span className="truncate text-caption leading-none text-muted">
              {view.layers.length} {view.layers.length === 1 ? "camada" : "camadas"}
            </span>
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Mais opções da visão ${view.name}`} className={cn(iconBtn, "opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100")}>
              <MoreHorizontal />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[230px]">
            <DropdownMenuItem onSelect={() => L.applyView(view.id)}>
              <Eye /> Aplicar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => L.updateView(view.id)}>
              <RefreshCw /> Atualizar com as camadas visíveis
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTimeout(() => setRenaming(true), 50)}>
              <Pencil /> Renomear
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={() => L.removeView(view.id)}>
              <Trash2 /> Excluir visão
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ templates

/** Ready-made sets of layers and views. */
function TemplatesMenu({ trigger }: { trigger?: React.ReactNode }) {
  const L = useEditor().layers;
  return (
    <DropdownMenu>
      <Tooltip content="Modelos de camadas" side="right">
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <button type="button" aria-label="Modelos de camadas" className={iconBtn}>
              <LayoutTemplate />
            </button>
          )}
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-[290px]">
        <DropdownMenuLabel>Modelos de camadas</DropdownMenuLabel>
        {LAYER_TEMPLATES.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => L.applyTemplate(t.id)} className="h-auto items-start py-2">
            <span className="mt-0.5 flex shrink-0 -space-x-1" aria-hidden>
              {t.layers.map((l) => (
                <span key={l.name} className="size-2.5 rounded-full ring-2 ring-surface" style={{ background: l.color }} />
              ))}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{t.name}</span>
              <span className="text-caption leading-4 text-muted">
                {[t.base, ...t.layers.map((l) => l.name)].join(" · ")} — {t.description}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ------------------------------------------------------------------ panel

type Item = { kind: "layer"; layer: PlanLayer; index: number; nested: boolean } | { kind: "folder"; name: string; layers: PlanLayer[] };

/**
 * Layers of the plan, top layer first, with a thumbnail of what each holds. Drag to reorder or into
 * folders, open a layer to see (and drag) its elements, isolate one to edit it alone, and keep
 * saved views below.
 */
export function LayersPanel() {
  const ed = useEditor();
  const L = ed.layers;
  const { boxes, frame } = useBoxes(ed.nodes);
  const [drop, setDrop] = React.useState<Drop>(null);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const groups = [...new Set(L.list.map((l) => l.group).filter((g): g is string => !!g))];

  // Top to bottom, folders around runs of their layers.
  const items: Item[] = [];
  const top = [...L.list].map((l, i) => ({ l, i })).reverse();
  for (let k = 0; k < top.length; k++) {
    const { l, i } = top[k];
    if (!l.group) {
      items.push({ kind: "layer", layer: l, index: i, nested: false });
      continue;
    }
    const run: typeof top = [];
    while (k < top.length && top[k].l.group === l.group) run.push(top[k++]);
    k--;
    items.push({ kind: "folder", name: l.group, layers: run.map((r) => r.l) });
    if (!collapsed.has(l.group)) for (const r of run) items.push({ kind: "layer", layer: r.l, index: r.i, nested: true });
  }

  const onDropLayer = (dragged: string, target: PlanLayer, where: "above" | "below") => {
    const rest = L.list.filter((l) => l.id !== dragged);
    const t = rest.findIndex((l) => l.id === target.id);
    L.place(dragged, where === "above" ? t + 1 : t, target.group);
  };

  return (
    <section className="flex flex-col gap-5" aria-label="Camadas">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption font-semibold uppercase tracking-[.06em] text-muted">
            Camadas <span className="font-normal normal-case tracking-normal">· {L.list.length}</span>
          </span>
          <div className="flex items-center gap-0.5">
            <TemplatesMenu />
            <OverlayPlanButton />
            <Tooltip content="Nova camada" side="right">
              <button type="button" aria-label="Nova camada" className={iconBtn} onClick={L.add}>
                <Plus />
              </button>
            </Tooltip>
          </div>
        </div>
        {L.isolated && (
          <div className="flex items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-2.5 py-1.5 text-caption text-accent-ink">
            <ScanEye className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">Isolando “{L.list.find((l) => l.id === L.isolated)?.name}”</span>
            <button type="button" className="font-semibold hover:underline" onClick={() => L.setIsolated(null)}>
              Sair
            </button>
          </div>
        )}
        <ul className="-mx-2 flex flex-col gap-0.5" onDragEnd={() => setDrop(null)}>
          {items.map((it) =>
            it.kind === "folder" ? (
              <li key={`folder:${it.name}`}>
                <FolderRow
                  name={it.name}
                  layers={it.layers}
                  collapsed={collapsed.has(it.name)}
                  onToggle={() =>
                    setCollapsed((c) => {
                      const n = new Set(c);
                      if (n.has(it.name)) n.delete(it.name);
                      else n.add(it.name);
                      return n;
                    })
                  }
                  drop={drop}
                  setDrop={setDrop}
                />
              </li>
            ) : (
              <LayerRow
                key={it.layer.id}
                layer={it.layer}
                index={it.index}
                total={L.list.length}
                nested={it.nested}
                groups={groups}
                drop={drop}
                setDrop={setDrop}
                onDropLayer={onDropLayer}
                thumb={<Thumb layers={new Set([it.layer.id])} color={it.layer.color} boxes={boxes} frame={frame} edges={ed.edges} />}
              />
            ),
          )}
        </ul>
        {L.list.length === 1 && (
          <p className="text-caption leading-4 text-muted">
            Crie camadas para desenhar fluxos alternativos, versões ou anotações por cima do plan, e mostre ou oculte cada uma. Ou comece por um{" "}
            <TemplatesMenu
              trigger={
                <button type="button" className="font-medium text-accent-ink hover:underline">
                  modelo
                </button>
              }
            />
            .
          </p>
        )}
      </div>
      <ViewsSection boxes={boxes} frame={frame} />
      <OnionSection />
    </section>
  );
}

/** On the canvas while a layer is isolated. */
export function IsolateBanner() {
  const L = useEditor().layers;
  const layer = L.isolated ? L.list.find((l) => l.id === L.isolated) : null;
  const setIsolated = L.setIsolated;
  React.useEffect(() => {
    if (!layer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [role=dialog], [role=menu]")) return;
      setIsolated(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layer, setIsolated]);
  if (!layer) return null;
  return (
    <div className="wp-no-print wp-no-export pointer-events-auto absolute left-3 top-3 z-10 flex items-center gap-2.5 rounded-full border border-accent-line bg-surface py-1 pl-3 pr-1 text-body shadow-float">
      <span className="size-2.5 rounded-full" style={{ background: layer.color ?? "var(--muted)" }} aria-hidden />
      <span>
        Editando só <b className="font-semibold">{layer.name}</b>
      </span>
      <button type="button" onClick={() => setIsolated(null)} className="inline-flex h-7 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-caption font-semibold text-accent-ink hover:bg-accent hover:text-white">
        <X className="size-3" /> Sair (Esc)
      </button>
    </div>
  );
}
