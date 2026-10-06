"use client";
import * as React from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import { CopyPlus, Group, Layers, LayoutGrid, MessageSquare, SlidersHorizontal, Trash2, Type } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/popover";
import { NODE_PALETTE } from "@/lib/color";
import { cn } from "@/lib/utils";
import { BASE_LAYER_ID } from "@/domain/layers";
import { useEditor } from "./editor-context";
import { ALIGN_ACTIONS, DISTRIBUTE_ACTIONS } from "./inspector";
import { styleOfSelection } from "./shape-style";
import { CATEGORY_META } from "./annotations";
import { CategoryPicker } from "./annotations-panel";
import {
  AlignPicker,
  CornersPicker,
  FillColors,
  FillStylePicker,
  FontPicker,
  PlanColors,
  RoughnessPicker,
  SizePicker,
  StrokeColors,
  StrokeStylePicker,
  WidthPicker,
} from "./style-controls";

const btn =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-1.5 text-body text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink data-[state=open]:bg-surface-2 data-[state=open]:text-ink [&_svg]:size-4";
const Sep = () => <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />;

/** A round sample of a color (crossed out when there is none). */
function Swatch({ color, ring }: { color?: string; ring?: boolean }) {
  return (
    <span
      className={cn("relative inline-block size-[18px] rounded-full border border-black/10", ring && "ring-2 ring-surface")}
      style={{ background: color ?? "transparent" }}
      aria-hidden
    >
      {!color && <span className="absolute inset-0 m-auto h-px w-[22px] -rotate-45 bg-muted" />}
    </span>
  );
}

function Pop({ label, trigger, children, width = 232 }: { label: string; trigger: React.ReactNode; children: React.ReactNode; width?: number }) {
  return (
    <Popover>
      <Tooltip content={label} side="top">
        <PopoverTrigger asChild>
          <button type="button" aria-label={label} className={btn}>
            {trigger}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" sideOffset={10} className="flex flex-col gap-3 p-3" style={{ width }}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}

const WAYPOINT = new Set(["block", "container", "note", "link", "section", "text", "image"]);

/**
 * The quick bar above the selection: what you change most (colors, stroke, text, layer, align),
 * plus duplicate, delete and the full properties. Everything else lives in the properties panel.
 */
export function SelectionToolbar() {
  const ed = useEditor();
  const nodes = ed.selectedNodes;
  if (ed.tool !== "select" || !nodes.length || nodes.some((n) => n.dragging)) return null;
  const ids = nodes.map((n) => n.id);
  const shapes = nodes.every((n) => n.type === "shape");
  const icons = shapes && nodes.every((n) => n.data.shape?.type === "icon");
  const texts = shapes && nodes.every((n) => n.data.shape?.type === "text");
  const inks = nodes.every((n) => n.type === "ink");
  const plain = nodes.every((n) => WAYPOINT.has(n.type ?? ""));
  const s = styleOfSelection(ed.style, nodes.map((n) => n.data), []);
  const set = ed.setStyle;
  const L = ed.layers;
  const layerIds = new Set(nodes.map((n) => n.data._layer ?? BASE_LAYER_ID));
  const layer = layerIds.size === 1 ? L.list.find((l) => l.id === [...layerIds][0]) : undefined;
  const p = ed.panels;
  // The color they share (none shown when they differ).
  const colors = new Set(nodes.map((n) => (n.data.color as string | undefined)?.toUpperCase()));
  const nodeColor = colors.size === 1 ? [...colors][0] : undefined;

  return (
    <NodeToolbar nodeId={ids} isVisible position={Position.Top} offset={30} className="wp-no-print wp-no-export">
      <div role="toolbar" aria-label="Seleção" className="wp-quickbar flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-float">
        {(shapes || inks) && (
          <Pop label={icons ? "Cor" : "Traço"} trigger={<Swatch color={s.stroke ?? "var(--ink)"} />}>
            <Field label={icons ? "Cor do ícone" : inks ? "Cor do traço" : "Traço e texto"}>
              <StrokeColors value={s.stroke} onChange={(stroke) => set({ stroke })} />
            </Field>
          </Pop>
        )}
        {shapes && !texts && (
          <Pop label="Fundo" trigger={<Swatch color={s.fill} />}>
            <Field label="Fundo">
              <FillColors value={s.fill} onChange={(fill) => set({ fill })} />
            </Field>
            {s.fill && !icons && (
              <Field label="Preenchimento">
                <FillStylePicker value={s.fillStyle} onChange={(fillStyle) => set({ fillStyle })} />
              </Field>
            )}
          </Pop>
        )}
        {shapes && !texts && !icons && (
          <Pop label="Traço: espessura, estilo e cantos" trigger={<SlidersStroke />} width={260}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Espessura">
                <WidthPicker value={s.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth })} />
              </Field>
              <Field label="Estilo">
                <StrokeStylePicker value={s.strokeStyle} onChange={(strokeStyle) => set({ strokeStyle })} />
              </Field>
              <Field label="Traçado">
                <RoughnessPicker value={s.roughness} onChange={(roughness) => set({ roughness })} />
              </Field>
              <Field label="Cantos">
                <CornersPicker value={s.round} onChange={(round) => set({ round })} />
              </Field>
            </div>
          </Pop>
        )}
        {shapes && !icons && (
          <Pop label="Texto" trigger={<Type />} width={260}>
            <Field label="Fonte">
              <FontPicker value={s.font} onChange={(font) => set({ font })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tamanho">
                <SizePicker value={s.fontSize} onChange={(fontSize) => set({ fontSize })} />
              </Field>
              <Field label="Alinhamento">
                <AlignPicker value={s.align} onChange={(align) => set({ align })} />
              </Field>
            </div>
          </Pop>
        )}
        {nodes.every((n) => n.type === "annotation") && (
          <Pop label="Tipo da anotação" trigger={<Swatch color={CATEGORY_META[nodes[0].data.annotation?.category ?? "note"].color} />} width={300}>
            <Field label="Tipo">
              <CategoryPicker value={nodes[0].data.annotation?.category ?? "note"} onChange={(category) => ed.setAnnotStyle({ category })} />
            </Field>
          </Pop>
        )}
        {plain && (
          <Pop label="Cor" trigger={<Swatch color={nodeColor} />} width={212}>
            <Field label="Cor">
              <div className="relative flex flex-wrap items-center gap-1.5">
                {NODE_PALETTE.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-label={c.name}
                    title={c.name}
                    onClick={() => nodes.forEach((n) => ed.updateNodeData(n.id, { color: c.value }, "quick-color"))}
                    className={cn("size-6 rounded-full border border-black/10 transition-transform hover:scale-110", nodeColor?.toUpperCase() === c.value && "ring-2 ring-accent ring-offset-2 ring-offset-surface")}
                    style={{ background: c.value }}
                  />
                ))}
                <PlanColors value={nodeColor} onChange={(color) => nodes.forEach((n) => ed.updateNodeData(n.id, { color }, "quick-color"))} size={24} />
              </div>
            </Field>
          </Pop>
        )}
        {nodes.length >= 2 && (
          <>
            <Sep />
            <Pop label="Alinhar e distribuir" trigger={<LayoutGrid />} width={236}>
              <Field label="Alinhar">
                <div className="grid grid-cols-6 gap-1">
                  {ALIGN_ACTIONS.map((a) => (
                    <Tooltip key={a.mode} content={a.label}>
                      <button type="button" aria-label={a.label} className={btn} onClick={() => ed.align(a.mode)}>
                        <a.icon />
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </Field>
              <Field label="Distribuir">
                <div className="flex gap-1">
                  {DISTRIBUTE_ACTIONS.map((a) => (
                    <button key={a.axis} type="button" disabled={nodes.length < 3} className={cn(btn, "flex-1 justify-start px-2 disabled:opacity-40")} onClick={() => ed.distribute(a.axis)} title={nodes.length < 3 ? "Selecione 3 ou mais" : a.label}>
                      <a.icon /> <span className="truncate text-caption">{a.label.replace(/^Distribuir /, "")}</span>
                    </button>
                  ))}
                </div>
              </Field>
            </Pop>
            <Tooltip content="Agrupar (⌘G)" side="top">
              <button type="button" aria-label="Agrupar" className={btn} onClick={ed.group}>
                <Group />
              </button>
            </Tooltip>
          </>
        )}
        {L.list.length > 1 && (
          <Pop label="Camada" trigger={<><span className="size-2.5 rounded-full" style={{ background: layer?.color ?? "var(--muted)" }} aria-hidden /><Layers /></>} width={220}>
            <Field label="Mover para a camada">
              <div className="-mx-1 flex flex-col">
                {[...L.list].reverse().map((l) => (
                  <button key={l.id} type="button" onClick={() => L.assignSelection(l.id)} className={cn("flex h-8 items-center gap-2 rounded-md px-2 text-left text-body hover:bg-surface-2", layer?.id === l.id && "font-semibold text-accent-ink")}>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.color ?? "var(--muted)" }} aria-hidden />
                    <span className="truncate">{l.name}</span>
                  </button>
                ))}
              </div>
            </Field>
          </Pop>
        )}
        <Sep />
        <Tooltip content="Duplicar (⌘D)" side="top">
          <button type="button" aria-label="Duplicar" className={btn} onClick={ed.duplicate}>
            <CopyPlus />
          </button>
        </Tooltip>
        {nodes.length === 1 && (
          <Tooltip content="Comentar" side="top">
            <button type="button" aria-label="Comentar" className={btn} onClick={() => ed.openComments(nodes[0].id)}>
              <MessageSquare />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Excluir (⌫)" side="top">
          <button type="button" aria-label="Excluir" className={cn(btn, "hover:text-danger")} onClick={ed.remove}>
            <Trash2 />
          </button>
        </Tooltip>
        <Sep />
        <Tooltip content={p.inspectorOpen && !p.focus ? "Esconder propriedades (I)" : "Todas as propriedades (I)"} side="top">
          <button type="button" aria-label="Propriedades" aria-pressed={p.inspectorOpen && !p.focus} className={cn(btn, p.inspectorOpen && !p.focus && "text-accent-ink")} onClick={() => p.setInspectorOpen(!p.inspectorOpen || p.focus)}>
            <SlidersHorizontal />
          </button>
        </Tooltip>
      </div>
    </NodeToolbar>
  );
}

/** Three lines of growing width: "stroke options". */
function SlidersStroke() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden>
      <path d="M2.5 4h11" strokeWidth={1} />
      <path d="M2.5 8h11" strokeWidth={2} />
      <path d="M2.5 12.5h11" strokeWidth={3} />
    </svg>
  );
}
