"use client";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowLeftRight,
  BringToFront,
  Check,
  ChevronDown,
  CopyPlus,
  Ellipsis,
  ExternalLink,
  Group,
  ImagePlus,
  Link2,
  ListOrdered,
  Loader2,
  Search,
  SendToBack,
  Trash2,
  Ungroup,
  Upload,
  X,
} from "lucide-react";
import { EDGE_KINDS, NODE_STATUSES, type NodeData, type NodeKind, type OpenIn } from "@/domain/plan";
import { EDGE_APPEARANCE, fromFlow, type PlanFlowEdge, type PlanFlowNode } from "@/domain/canvas-adapter";
import { clearCustomOrder, presentationState, setIncluded, setOrder } from "./presentation-steps";
import { Switch } from "./switch";
import { NODE_PALETTE } from "@/lib/color";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, SectionLabel, Textarea, inputClass } from "@/components/ui/input";
import { Kbd, Segmented } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/popover";
import { useEditor, type InspectorTab } from "./editor-context";
import { KIND_LABEL, PARENT_KINDS, STATUS_META, statusMeta } from "./defaults";
import { nodeTone, toneVars } from "./colors";
import { GlyphSvg } from "./glyph";
import { ICON_NAMES, KIND_ICON, PLAN_ICONS, PlanIcon } from "./icons";
import { EdgeSample } from "./edges";
import { TagInput } from "./tag-input";
import { ResourceIcon, ResourceRow, useResourceSearch } from "./resource-picker";
import { parseUserUrl, fallbackResource } from "./resource-types";
import { BASE_LAYER_ID } from "@/domain/layers";
import { HIGHLIGHTER_COLOR, HIGHLIGHTER_SCALE, INK_COLORS, INK_SIZES, textBox } from "./ink-geometry";
import { styleOfSelection } from "./shape-style";
import { DEFAULT_STYLE, measureText } from "./shape-geometry";
import {
  AlignPicker,
  ArrowheadPicker,
  CornersPicker,
  FillColors,
  FillStylePicker,
  FontPicker,
  OpacitySlider,
  RoughnessPicker,
  RoutingPicker,
  SizePicker,
  StrokeColors,
  StrokeStylePicker,
  WidthPicker,
} from "./style-controls";

const VISIBILITY_LABEL: Record<string, string> = {
  private: "Privado",
  workspace: "Workspace",
  specific: "Pessoas específicas",
  link: "Qualquer pessoa com o link",
  public: "Público",
};

export function Inspector() {
  const ed = useEditor();
  const nodes = ed.selectedNodes;
  const edges = ed.selectedEdges;
  let body: React.ReactNode;
  if (nodes.length >= 1 && nodes.every((n) => n.type === "shape")) body = <DrawInspector key={nodes.map((n) => n.id).join()} />;
  else if (nodes.length === 1 && nodes[0].type === "ink") body = <InkInspector key={nodes[0].id} node={nodes[0]} />;
  else if (nodes.length === 1) body = <NodeInspector key={nodes[0].id} node={nodes[0]} />;
  else if (nodes.length > 1) body = <MultiInspector />;
  else if (edges.length === 1) body = <EdgeInspector key={edges[0].id} edge={edges[0]} />;
  else if (edges.length > 1) body = <MultiEdgeInspector />;
  else body = <PlanInspector key={`${ed.meta.title}|${ed.meta.description ?? ""}`} />;
  return (
    <aside aria-label="Propriedades" className="flex w-[300px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface">
      {body}
    </aside>
  );
}

// ------------------------------------------------------------------ shared bits

function Header({ icon, kicker, title, menu }: { icon: React.ReactNode; kicker: string; title: string; menu?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-caption text-muted">{kicker}</span>
        <span className="truncate text-lead font-semibold">{title}</span>
      </div>
      {menu}
    </div>
  );
}

function Scroll({ children }: { children: React.ReactNode }) {
  return <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[18px] py-4">{children}</div>;
}

function F({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-caption leading-4 text-muted">{hint}</p>}
    </div>
  );
}

const smallInput = "h-[34px] rounded-lg text-body";

/** Which layer the selection is on; changing it moves the selection (areas with their content). */
function LayerField() {
  const ed = useEditor();
  const L = ed.layers;
  if (L.list.length < 2) return null;
  const ids = new Set([...ed.selectedNodes.map((n) => n.data._layer ?? BASE_LAYER_ID), ...ed.selectedEdges.map((e) => e.data?.layer ?? BASE_LAYER_ID)]);
  const value = ids.size === 1 ? [...ids][0] : "";
  const current = L.list.find((l) => l.id === value);
  return (
    <F label="Camada" htmlFor="insp-layer">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full" style={{ background: current?.color ?? "var(--muted)" }} aria-hidden />
        <select id="insp-layer" className={cn(inputClass, "wp-select h-[34px] rounded-lg pl-7 pr-8 text-body")} value={value} onChange={(e) => e.target.value && L.assignSelection(e.target.value)}>
          {!value && <option value="">Várias camadas</option>}
          {[...L.list].reverse().map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.visible === false ? " (oculta)" : ""}
            </option>
          ))}
        </select>
      </div>
    </F>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="-ml-1">{children}</div>
    </div>
  );
}

/**
 * Drawn shapes (one or many, with any drawn connections also selected): stroke, background and
 * pattern, width, dash, clean or hand-drawn, corners, font, size, alignment, opacity.
 */
function DrawInspector() {
  const ed = useEditor();
  const nodes = ed.selectedNodes;
  const one = nodes.length === 1 ? nodes[0] : null;
  const s = styleOfSelection(ed.style, nodes.map((n) => n.data), ed.selectedEdges.map((e) => e.data?.style));
  const types = new Set(nodes.map((n) => n.data.shape?.type));
  const onlyText = types.size === 1 && types.has("text");
  const boxes = types.has("rect") || types.has("diamond");
  const set = ed.setStyle;
  const onlyIcons = types.size === 1 && types.has("icon");
  const glyph = one?.data.shape?.glyph;
  const label = one
    ? one.data.shape?.type === "icon"
      ? one.data.title || "Ícone"
      : one.data.shape?.type === "text"
        ? "Texto"
        : one.data.shape?.type === "ellipse"
          ? "Elipse"
          : one.data.shape?.type === "diamond"
            ? "Losango"
            : "Retângulo"
    : onlyIcons
      ? `${nodes.length} ícones`
      : `${nodes.length} formas`;
  const Icon = KIND_ICON.shape;
  const setText = (title: string) =>
    ed.mutate(
      (d) => ({
        ...d,
        nodes: d.nodes.map((n) => {
          if (n.id !== one!.id) return n;
          if (n.data.shape?.type !== "text") return { ...n, data: { ...n.data, title } };
          const box = measureText(title, n.data.shape.font ?? DEFAULT_STYLE.font, n.data.shape.fontSize ?? DEFAULT_STYLE.fontSize);
          return { ...n, width: box.width, height: box.height, data: { ...n.data, title } };
        }),
      }),
      { key: `shape-text:${one!.id}` },
    );
  return (
    <Scroll>
      <Header
        icon={
          <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-subtle" style={{ color: s.stroke ?? "var(--ink)" }}>
            {glyph ? <GlyphSvg glyph={glyph} size={16} color={s.stroke ?? "var(--ink)"} /> : <Icon className="size-4" strokeWidth={2} />}
          </span>
        }
        kicker={one ? (glyph ? "Ícone" : "Forma") : "Seleção"}
        title={label}
      />
      {one && (
        <F label={glyph ? "Rótulo" : "Texto"} htmlFor={`st-${one.id}`}>
          <Textarea id={`st-${one.id}`} rows={2} maxLength={300} className="min-h-[56px] rounded-lg text-body" value={one.data.title} onChange={(e) => setText(e.target.value)} />
        </F>
      )}
      <Row label={onlyIcons ? "Cor" : "Traço"}>
        <StrokeColors value={s.stroke} onChange={(stroke) => set({ stroke })} />
      </Row>
      {onlyIcons && (
        <>
          <Row label="Fundo">
            <FillColors value={s.fill} onChange={(fill) => set({ fill })} />
          </Row>
          {!glyph?.filled && (
            <Row label="Espessura">
              <WidthPicker value={s.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth })} />
            </Row>
          )}
        </>
      )}
      {!onlyText && !onlyIcons && (
        <>
          <Row label="Fundo">
            <FillColors value={s.fill} onChange={(fill) => set({ fill })} />
          </Row>
          {s.fill && (
            <Row label="Preenchimento">
              <FillStylePicker value={s.fillStyle} onChange={(fillStyle) => set({ fillStyle })} />
            </Row>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            <Row label="Espessura">
              <WidthPicker value={s.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth })} />
            </Row>
            <Row label="Estilo do traço">
              <StrokeStylePicker value={s.strokeStyle} onChange={(strokeStyle) => set({ strokeStyle })} />
            </Row>
            <Row label="Traçado">
              <RoughnessPicker value={s.roughness} onChange={(roughness) => set({ roughness })} />
            </Row>
            {boxes && (
              <Row label="Cantos">
                <CornersPicker value={s.round} onChange={(round) => set({ round })} />
              </Row>
            )}
          </div>
        </>
      )}
      {!onlyIcons && (
        <>
          <Row label="Fonte">
            <FontPicker value={s.font} onChange={(font) => set({ font })} />
          </Row>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            <Row label="Tamanho">
              <SizePicker value={s.fontSize} onChange={(fontSize) => set({ fontSize })} />
            </Row>
            <Row label="Alinhamento">
              <AlignPicker value={s.align} onChange={(align) => set({ align })} />
            </Row>
          </div>
        </>
      )}
      <Row label="Opacidade">
        <OpacitySlider value={s.opacity} onChange={(opacity) => set({ opacity })} />
      </Row>
      <LayerField />
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={ed.bringToFront}>
          <BringToFront /> Frente
        </Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={ed.sendToBack}>
          <SendToBack /> Trás
        </Button>
      </div>
      <Button size="sm" variant="danger" onClick={ed.remove}>
        <Trash2 /> Excluir
      </Button>
    </Scroll>
  );
}

/** How a connection is drawn: color, width, dash, clean or hand-drawn, heads and route. */
function EdgeDrawSection({ edgeId }: { edgeId: string }) {
  const ed = useEditor();
  const edge = ed.edges.find((e) => e.id === edgeId);
  const st = edge?.data?.style;
  const s = styleOfSelection(ed.style, [], [st ?? { routing: "elbow", end: "arrow" }]);
  const set = ed.setStyle;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line p-3">
      <span className="text-caption font-semibold uppercase tracking-[.06em] text-muted">Desenho</span>
      <Row label="Traço">
        <StrokeColors value={s.stroke} onChange={(stroke) => set({ stroke })} />
      </Row>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <Row label="Espessura">
          <WidthPicker value={s.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth })} />
        </Row>
        <Row label="Estilo do traço">
          <StrokeStylePicker value={s.strokeStyle} onChange={(strokeStyle) => set({ strokeStyle })} />
        </Row>
        <Row label="Traçado">
          <RoughnessPicker value={s.roughness} onChange={(roughness) => set({ roughness })} />
        </Row>
        <Row label="Trajeto">
          <RoutingPicker value={s.routing} onChange={(routing) => set({ routing })} />
        </Row>
      </div>
      {s.routing !== "elbow" && (
        <>
          <Row label="Ponta inicial">
            <ArrowheadPicker label="Ponta inicial" value={s.start} onChange={(start) => set({ start })} flip />
          </Row>
          <Row label="Ponta final">
            <ArrowheadPicker label="Ponta final" value={s.end} onChange={(end) => set({ end })} />
          </Row>
        </>
      )}
    </div>
  );
}

/** A freehand stroke, highlight or arrow: color, thickness, layer, stacking. */
function InkInspector({ node }: { node: PlanFlowNode }) {
  const ed = useEditor();
  const ink = node.data.ink!;
  const text = ink.shape === "text";
  const kind = text ? "Texto à mão" : ink.shape === "rect" ? "Retângulo" : ink.shape === "ellipse" ? "Elipse" : ink.arrow ? "Seta" : ink.highlighter ? "Destaque" : "Desenho";
  // Text annotations: the box follows the text and its size.
  const setText = (title: string, size = ink.size) =>
    ed.mutate(
      (d) => ({
        ...d,
        nodes: d.nodes.map((n) => {
          if (n.id !== node.id) return n;
          const box = textBox(title, size);
          return { ...n, width: box.width, height: box.height, data: { ...n.data, title, ink: { ...ink, size, w: box.width, h: box.height, points: [0, 0, box.width, box.height] } } };
        }),
      }),
      { key: `ink-text:${node.id}` },
    );
  const base = ink.highlighter ? ink.size / HIGHLIGHTER_SCALE : ink.size;
  const shown = node.data.color ?? (ink.highlighter ? HIGHLIGHTER_COLOR : undefined);
  const Icon = KIND_ICON.ink;
  return (
    <Scroll>
      <Header
        icon={
          <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-subtle" style={{ color: shown ?? "var(--ink)" }}>
            <Icon className="size-4" strokeWidth={2} />
          </span>
        }
        kicker="Desenho"
        title={kind}
      />
      <div className="flex flex-col gap-2">
        <Label>Cor</Label>
        <div className="flex flex-wrap gap-2 pl-0.5" role="radiogroup" aria-label="Cor">
          {INK_COLORS.map((c) => {
            const on = (c.value ?? null) === (shown ?? null);
            return (
              <Tooltip key={c.name} content={c.name}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={c.name}
                  onClick={() => ed.updateNodeData(node.id, { color: c.value })}
                  className="size-6 rounded-full border-2 border-surface"
                  style={{ background: c.value ?? "var(--ink)", boxShadow: on ? "0 0 0 2px var(--accent)" : "0 0 0 1px var(--line-2)" }}
                />
              </Tooltip>
            );
          })}
        </div>
      </div>
      {text && (
        <F label="Texto" htmlFor={`it-${node.id}`}>
          <Input id={`it-${node.id}`} className={smallInput} maxLength={300} value={node.data.title} onChange={(e) => setText(e.target.value)} />
        </F>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>{text ? "Tamanho" : "Espessura"}</Label>
        <Segmented
          label={text ? "Tamanho" : "Espessura"}
          className="self-start"
          value={String(INK_SIZES.reduce((a, b) => (Math.abs(b - base) < Math.abs(a - base) ? b : a)))}
          onChange={(v) => (text ? setText(node.data.title, Number(v)) : ed.updateNodeData(node.id, { ink: { ...ink, size: Number(v) * (ink.highlighter ? HIGHLIGHTER_SCALE : 1) } }))}
          options={INK_SIZES.map((n) => ({ value: String(n), label: text ? (n === INK_SIZES[0] ? "P" : n === INK_SIZES[1] ? "M" : "G") : n === INK_SIZES[0] ? "Fina" : n === INK_SIZES[1] ? "Média" : "Grossa" }))}
        />
      </div>
      <LayerField />
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={ed.bringToFront}>
          <BringToFront /> Frente
        </Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={ed.sendToBack}>
          <SendToBack /> Trás
        </Button>
      </div>
      <Button size="sm" variant="danger" onClick={ed.remove}>
        <Trash2 /> Apagar desenho
      </Button>
    </Scroll>
  );
}

// ------------------------------------------------------------------ node

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "content", label: "Conteúdo" },
  { id: "appearance", label: "Aparência" },
  { id: "action", label: "Ação" },
];

function NodeInspector({ node }: { node: PlanFlowNode }) {
  const ed = useEditor();
  const kind = node.type as NodeKind;
  const d = node.data;
  const tone = nodeTone(d.color);
  const KindIcon = KIND_ICON[kind];
  const tile =
    kind === "block" || kind === "container" ? (
      <span className={cn("inline-flex size-[30px] shrink-0 items-center justify-center rounded-lg", tone ? "wp-tile" : "bg-subtle text-ink-2")} style={toneVars(tone)}>
        <PlanIcon name={d.icon} fallback={kind === "container" ? "boxes" : "box"} size={16} />
      </span>
    ) : (
      <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-2">
        <KindIcon className="size-4" strokeWidth={1.75} />
      </span>
    );
  const tab = ed.inspectorTab;
  const set = (patch: Partial<NodeData>, key?: string) => ed.updateNodeData(node.id, patch, key);

  return (
    <>
      <div className="flex flex-col gap-3 px-[18px] pt-4">
        <Header
          icon={tile}
          kicker={KIND_LABEL[kind]}
          title={d.title || (kind === "link" ? (ed.resourceFor(node)?.title ?? "Link") : "Sem título")}
          menu={<NodeMenu node={node} />}
        />
        <div role="tablist" aria-label="Seções do painel" className="flex gap-[18px] border-b border-line text-body">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => ed.setInspectorTab(t.id)}
              className={cn("-mb-px border-b-2 pb-2.5 outline-none focus-visible:text-accent-ink", tab === t.id ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <Scroll>
        {tab === "content" && <ContentTab node={node} set={set} />}
        {tab === "appearance" && <AppearanceTab node={node} set={set} />}
        {tab === "action" && <ActionTab node={node} set={set} />}
      </Scroll>
    </>
  );
}

type SetFn = (patch: Partial<NodeData>, key?: string) => void;

function ContentTab({ node, set }: { node: PlanFlowNode; set: SetFn }) {
  const kind = node.type as NodeKind;
  const d = node.data;
  const id = node.id;
  return (
    <>
      {kind === "image" && <ImageField value={d.image} onChange={(image) => set({ image })} />}
      <F label={kind === "image" ? "Legenda" : kind === "text" ? "Texto" : "Título"} htmlFor={`t-${id}`}>
        <Input id={`t-${id}`} className={smallInput} value={d.title} maxLength={300} onChange={(e) => set({ title: e.target.value }, `title:${id}`)} placeholder={kind === "link" ? "Usa o título do recurso" : ""} />
      </F>
      <F label={kind === "note" ? "Texto da nota" : "Descrição"} htmlFor={`d-${id}`}>
        <Textarea
          id={`d-${id}`}
          rows={kind === "note" ? 5 : 3}
          maxLength={5000}
          className="min-h-[76px] rounded-lg text-body leading-[18px]"
          value={d.description ?? ""}
          onChange={(e) => set({ description: e.target.value }, `desc:${id}`)}
        />
      </F>
      {kind !== "text" && (
        <div className="grid grid-cols-2 gap-2.5">
          {(kind === "block" || kind === "container" || kind === "note" || kind === "section") && <IconField value={d.icon} onChange={(icon) => set({ icon })} allowNone={kind === "note" || kind === "section"} />}
          <StatusField value={d.status} onChange={(status) => set({ status })} />
        </div>
      )}
      <F label="Tags">
        <TagInput value={d.tags ?? []} onChange={(tags) => set({ tags })} />
      </F>
    </>
  );
}

function AppearanceTab({ node, set }: { node: PlanFlowNode; set: SetFn }) {
  const ed = useEditor();
  const kind = node.type as NodeKind;
  const d = node.data;
  return (
    <>
      <LayerField />
      {kind === "image" && <IconlessNote />}
      {kind !== "image" && kind !== "link" && (
        <div className="flex flex-col gap-2">
          <Label>Cor</Label>
          <ColorSwatches value={d.color} onChange={(color) => set({ color })} />
        </div>
      )}
      {kind === "block" && (
        <ImageField label="Capa" value={d.image} onChange={(image) => set({ image })} hint="Aparece no lugar do ícone ou como capa em blocos altos." />
      )}
      {PARENT_KINDS.has(kind) && (
        <label className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-body">
          <span className="flex flex-col">
            <span className="font-medium">Recolhido</span>
            <span className="text-caption text-muted">Esconde os elementos internos</span>
          </span>
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!!d.collapsed} onChange={() => ed.toggleCollapsed(node.id)} />
        </label>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>Tamanho</Label>
        <div className="grid grid-cols-2 gap-2.5">
          <NumberField label="L" value={node.width ?? 0} onChange={(width) => ed.updateNodeSize(node.id, { width })} />
          <NumberField label="A" value={d.collapsed ? (d._h ?? node.height ?? 0) : (node.height ?? 0)} onChange={(height) => ed.updateNodeSize(node.id, { height })} disabled={!!d.collapsed} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={ed.bringToFront}>
          <BringToFront /> Frente
        </Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={ed.sendToBack}>
          <SendToBack /> Trás
        </Button>
      </div>
      <PresentationField node={node} />
    </>
  );
}

function PresentationField({ node }: { node: PlanFlowNode }) {
  const ed = useEditor();
  const st = useMemo(() => presentationState(fromFlow(ed.nodes, [], { x: 0, y: 0, zoom: 1 }), node.id), [ed.nodes, node.id]);
  const order = node.data.presentation?.order;
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n >= 1 && n !== order) ed.mutate((d) => setOrder(d, node.id, n));
    setDraft(null);
  };
  const sw = `pres-${node.id}`;
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line px-3 py-2.5 text-body">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={sw} className="flex cursor-pointer flex-col">
          <span className="font-medium">Incluir na apresentação</span>
          <span className="text-caption text-muted">{st.included ? `Passo ${st.position} de ${st.total} (após a visão geral)` : "Fora da apresentação"}</span>
        </label>
        <Switch id={sw} checked={st.included} onChange={(v) => ed.mutate((d) => setIncluded(d, node.id, v))} />
      </div>
      {st.custom && st.included && (
        <label className={cn(inputClass, "flex h-[34px] items-center gap-2 rounded-lg px-2.5 text-body")}>
          <span className="text-caption text-muted">Ordem</span>
          <input
            type="number"
            min={1}
            max={9999}
            aria-label="Ordem na apresentação"
            value={draft ?? order ?? ""}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="w-full bg-transparent font-mono text-[12px] outline-none"
          />
        </label>
      )}
      <p className="text-caption leading-4 text-muted">
        {st.custom
          ? "Ordem personalizada: só os elementos numerados aparecem, do menor para o maior. "
          : "Ordem automática: seções e containers do nível principal, depois os demais elementos em ordem de leitura. "}
        {st.custom && (
          <button type="button" className="font-medium text-accent-ink hover:underline" onClick={() => ed.mutate((d) => clearCustomOrder(d))}>
            Voltar à ordem automática
          </button>
        )}
      </p>
    </div>
  );
}

function IconlessNote() {
  return <p className="text-xs text-muted">Imagens usam o próprio conteúdo como aparência. Ajuste o tamanho no canvas ou abaixo.</p>;
}

function NumberField({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n >= 20 && n <= 20000) onChange(n);
    setDraft(null);
  };
  return (
    <label className={cn(inputClass, "flex h-[34px] items-center gap-2 rounded-lg px-2.5 text-body", disabled && "opacity-60")}>
      <span className="font-mono text-caption text-muted">{label}</span>
      <input
        type="number"
        min={20}
        disabled={disabled}
        aria-label={label === "L" ? "Largura" : "Altura"}
        value={draft ?? Math.round(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="w-full bg-transparent font-mono text-[12px] outline-none"
      />
    </label>
  );
}

const OPEN_OPTIONS: { value: OpenIn; label: string }[] = [
  { value: "new-tab", label: "Nova aba" },
  { value: "modal", label: "Modal" },
  { value: "details", label: "Detalhes" },
];

function ActionTab({ node, set }: { node: PlanFlowNode; set: SetFn }) {
  const ed = useEditor();
  const d = node.data;
  const res = d.resource ? ed.resourceFor(node) : null;
  const openIn = d.openIn ?? "new-tab";
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <Label>Ao clicar</Label>
        {d.resource && res ? (
          <div className="flex items-center gap-2.5 rounded-control border border-line-2 p-2.5">
            <ResourceIcon resource={res} size={30} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body font-medium">{res.title}</span>
              <span className="truncate text-caption text-muted">Recurso · {res.subtitle}</span>
            </div>
            {res.href && (
              <Tooltip content="Abrir">
                <a href={res.href} target="_blank" rel="noopener noreferrer" aria-label="Abrir recurso" className="inline-flex size-[26px] items-center justify-center rounded-md text-ink-2 hover:bg-hover">
                  <ExternalLink className="size-3.5" />
                </a>
              </Tooltip>
            )}
            <Tooltip content="Remover recurso">
              <button type="button" aria-label="Remover recurso" onClick={() => set({ resource: null })} className="inline-flex size-[26px] items-center justify-center rounded-md text-ink-2 hover:bg-hover">
                <X className="size-3.5" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <ResourcePicker
            onPick={(ref, resource) => {
              ed.cacheResource(ref, resource);
              set({ resource: ref, openIn: d.openIn ?? "new-tab" });
            }}
          />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label>Abrir em</Label>
        <Segmented label="Abrir em" value={openIn} onChange={(v) => set({ openIn: v })} options={OPEN_OPTIONS} className="w-full [&>button]:flex-1 [&>button]:justify-center" />
        <p className="text-caption leading-4 text-muted">
          {openIn === "new-tab" && "No modo visualização, o clique abre o recurso em uma nova aba."}
          {openIn === "modal" && "Mostra uma prévia sobre o plan (quando o site permite incorporação)."}
          {openIn === "details" && "Abre um painel com título, descrição, status, tags e o link."}
        </p>
      </div>
    </>
  );
}

function ResourcePicker({ onPick }: { onPick: (ref: NonNullable<NodeData["resource"]>, resource: ReturnType<typeof fallbackResource>) => void }) {
  const ed = useEditor();
  const [mode, setMode] = useState<"library" | "url">("library");
  const [q, setQ] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { items, loading } = useResourceSearch(q.trim(), { limit: 5, exclude: ed.planId, enabled: mode === "library" });
  const submitUrl = () => {
    const u = parseUserUrl(url);
    if (!u) {
      setErr("Informe um endereço http(s) válido.");
      return;
    }
    const ref = { type: "url" as const, url: u };
    onPick(ref, fallbackResource(ref));
    setUrl("");
    setErr(null);
  };
  return (
    <div className="flex flex-col gap-2">
      <Segmented
        size="sm"
        label="Tipo de recurso"
        value={mode}
        onChange={setMode}
        options={[
          { value: "library", label: "Biblioteca" },
          { value: "url", label: "URL" },
        ]}
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
      />
      {mode === "url" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <Input
              className={smallInput}
              type="url"
              inputMode="url"
              placeholder="https://"
              aria-label="URL"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setErr(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && submitUrl()}
            />
            <Button size="sm" variant="secondary" className="h-[34px]" onClick={submitUrl}>
              Definir
            </Button>
          </div>
          {err && <p className="text-caption text-danger">{err}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label className={cn(inputClass, "flex h-[34px] items-center gap-2 rounded-lg px-2.5")}>
            <Search className="size-3.5 shrink-0 text-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Favoritos, coleções, plans…" aria-label="Buscar recurso" className="w-full bg-transparent text-body outline-none" />
            {loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" aria-hidden />}
          </label>
          <div className="-mx-2 flex flex-col">
            {items?.map((it) => (
              <ResourceRow key={`${it.ref.type}:${"id" in it.ref ? it.ref.id : ""}`} item={it} onPick={(i) => onPick(i.ref, i.resource)} />
            ))}
            {items && items.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">Nada encontrado.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function NodeMenu({ node }: { node: PlanFlowNode }) {
  const ed = useEditor();
  const kind = node.type as NodeKind;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Mais ações">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={ed.duplicate} shortcut="⌘D">
          <CopyPlus /> Duplicar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => ed.startConnectFrom(node.id)} shortcut="C">
          <Link2 /> Criar conexão
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={ed.bringToFront} shortcut="]">
          <BringToFront /> Trazer para frente
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={ed.sendToBack} shortcut="[">
          <SendToBack /> Enviar para trás
        </DropdownMenuItem>
        {PARENT_KINDS.has(kind) && (
          <DropdownMenuItem onSelect={ed.ungroup} shortcut="⇧⌘G">
            <Ungroup /> Desagrupar
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem danger onSelect={ed.remove} shortcut="⌫">
          <Trash2 /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ------------------------------------------------------------------ fields

function IconField({ value, onChange, allowNone }: { value?: string; onChange: (v: string | undefined) => void; allowNone?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const names = ICON_NAMES.filter((n) => !q || n.includes(q.toLowerCase()) || PLAN_ICONS[n].label.toLowerCase().includes(q.toLowerCase()));
  return (
    <F label="Ícone">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={cn(inputClass, "flex h-[34px] items-center gap-2 rounded-lg px-2.5 text-left text-body")}>
            {value ? <PlanIcon name={value} size={15} /> : <span className="size-[15px] rounded border border-dashed border-line-2" aria-hidden />}
            <span className="flex-1 truncate">{value ? (PLAN_ICONS[value]?.label ?? value) : "Nenhum"}</span>
            <ChevronDown className="size-3.5 text-muted" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[284px] p-3">
          <Input autoFocus className="mb-2 h-8 text-body" placeholder="Buscar ícone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ícone" />
          <div className="scrollbar-thin grid max-h-[220px] grid-cols-7 gap-1 overflow-y-auto">
            {allowNone && (
              <button type="button" aria-label="Sem ícone" onClick={() => (onChange(undefined), setOpen(false))} className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover">
                <X className="size-4" />
              </button>
            )}
            {names.map((n) => (
              <Tooltip key={n} content={PLAN_ICONS[n].label}>
                <button
                  type="button"
                  aria-label={PLAN_ICONS[n].label}
                  aria-pressed={value === n}
                  onClick={() => (onChange(n), setOpen(false))}
                  className={cn("inline-flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-hover", value === n && "bg-accent-soft text-accent-ink")}
                >
                  <PlanIcon name={n} size={16} />
                </button>
              </Tooltip>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </F>
  );
}

function StatusField({ value, onChange }: { value?: NodeData["status"]; onChange: (v: NodeData["status"]) => void }) {
  const m = statusMeta(value);
  return (
    <F label="Status">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(inputClass, "flex h-[34px] items-center gap-2 rounded-lg px-2.5 text-left text-body")}>
            <span className="size-2 shrink-0 rounded-full" style={{ background: m?.dot ?? "var(--line-2)" }} aria-hidden />
            <span className="flex-1 truncate">{m?.label ?? "Nenhum"}</span>
            <ChevronDown className="size-3.5 text-muted" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          {NODE_STATUSES.map((s) => {
            const sm = s === "none" ? null : STATUS_META[s];
            return (
              <DropdownMenuItem key={s} onSelect={() => onChange(s === "none" ? undefined : s)}>
                <span className="size-2 shrink-0 rounded-full" style={{ background: sm?.dot ?? "var(--line-2)" }} aria-hidden />
                {sm?.label ?? "Nenhum"}
                {(value ?? "none") === s && <Check className="ml-auto" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </F>
  );
}

function ColorSwatches({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const cur = value?.toUpperCase();
  return (
    <div className="flex flex-wrap gap-2 pl-0.5" role="radiogroup" aria-label="Cor">
      {NODE_PALETTE.map((c) => {
        const on = c.value === "#FFFFFF" ? !cur || cur === "#FFFFFF" : cur === c.value;
        return (
          <Tooltip key={c.value} content={c.value === "#FFFFFF" ? "Neutro (segue o tema)" : c.name}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.name}
              onClick={() => onChange(c.value === "#FFFFFF" ? undefined : c.value)}
              className="size-6 rounded-full border-2 border-surface"
              style={{ background: c.value, boxShadow: on ? `0 0 0 2px var(--accent)` : "0 0 0 1px var(--line-2)" }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}

function ImageField({ value, onChange, label = "Imagem", hint }: { value?: string; onChange: (v: string | undefined) => void; label?: string; hint?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Falha no envio.");
      onChange(body.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio da imagem.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {value ? (
        <div className="group relative overflow-hidden rounded-lg border border-line-2 bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" referrerPolicy="no-referrer" className="h-28 w-full object-cover" />
          <div className="absolute right-1.5 top-1.5 flex gap-1">
            <Button size="icon-sm" variant="secondary" aria-label="Trocar imagem" onClick={() => fileRef.current?.click()}>
              <Upload />
            </Button>
            <Button size="icon-sm" variant="secondary" aria-label="Remover imagem" onClick={() => onChange(undefined)}>
              <X />
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-2 px-3 py-4 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void upload(f);
          }}
        >
          <ImagePlus className="size-5 text-muted" strokeWidth={1.5} aria-hidden />
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Enviar imagem
          </Button>
          <span className="text-caption text-muted">PNG, JPG, GIF, WebP · até 5 MB</span>
        </div>
      )}
      <div className="flex gap-1.5">
        <Input
          className={smallInput}
          placeholder="ou cole a URL da imagem"
          aria-label="URL da imagem"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const u = parseUserUrl(url);
              if (u) {
                onChange(u);
                setUrl("");
              } else toast.error("URL de imagem inválida.");
            }
          }}
        />
      </div>
      {hint && <p className="text-caption leading-4 text-muted">{hint}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ edge

function EdgeInspector({ edge }: { edge: PlanFlowEdge }) {
  const ed = useEditor();
  const d = edge.data ?? { kind: "flow" as const };
  const src = ed.nodes.find((n) => n.id === edge.source);
  const tgt = ed.nodes.find((n) => n.id === edge.target);
  const name = (n?: PlanFlowNode) => n?.data.title || (n ? KIND_LABEL[n.type as NodeKind] : "?");
  return (
    <>
      <div className="flex flex-col gap-3 border-b border-line px-[18px] pb-3 pt-4">
        <Header
          icon={
            <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-subtle">
              <EdgeSample kind={d.kind} width={20} />
            </span>
          }
          kicker="Conexão"
          title={`${name(src)} → ${name(tgt)}`}
        />
      </div>
      <Scroll>
        <F label="Rótulo" htmlFor={`el-${edge.id}`}>
          <Input id={`el-${edge.id}`} className={smallInput} maxLength={200} value={d.label ?? ""} placeholder="ex.: REST, eventos · Kafka" onChange={(e) => ed.updateEdge(edge.id, { label: e.target.value }, `elabel:${edge.id}`)} />
        </F>
        <F label="Descrição" htmlFor={`ed-${edge.id}`}>
          <Textarea id={`ed-${edge.id}`} rows={3} maxLength={2000} className="min-h-[72px] rounded-lg text-body" value={d.description ?? ""} onChange={(e) => ed.updateEdge(edge.id, { description: e.target.value }, `edesc:${edge.id}`)} />
        </F>
        <LayerField />
        <EdgeDrawSection edgeId={edge.id} />
        <F label="Passo do fluxo" htmlFor={`es-${edge.id}`}>
          <div className="flex items-center gap-2">
            <Input
              id={`es-${edge.id}`}
              type="number"
              min={1}
              max={999}
              className={cn(smallInput, "w-20")}
              value={d.step ?? ""}
              placeholder="—"
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                ed.updateEdge(edge.id, { step: e.target.value && n >= 1 && n <= 999 ? n : undefined }, `estep:${edge.id}`);
              }}
            />
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => ed.numberSteps()}>
              <ListOrdered /> Numerar o fluxo
            </Button>
          </div>
          <span className="text-caption text-muted">Numera as conexões desta camada na ordem do fluxo.</span>
        </F>
        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Tipo de conexão">
            {EDGE_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={d.kind === k}
                onClick={() => ed.updateEdge(edge.id, { kind: k })}
                className={cn("flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-body", d.kind === k ? "border-accent bg-accent-soft/60 text-ink" : "border-line hover:bg-surface-2")}
              >
                <EdgeSample kind={k} />
                <span className="flex-1 font-medium">{EDGE_APPEARANCE[k].label}</span>
                {d.kind === k && <Check className="size-4 text-accent-ink" />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Direção</Label>
          <Button size="sm" variant="secondary" onClick={() => ed.swapEdge(edge.id)}>
            <ArrowLeftRight /> Inverter direção
          </Button>
        </div>
        <Button size="sm" variant="danger" onClick={ed.remove}>
          <Trash2 /> Excluir conexão
        </Button>
      </Scroll>
    </>
  );
}

function MultiEdgeInspector() {
  const ed = useEditor();
  return (
    <Scroll>
      <Header icon={<span className="inline-flex size-[30px] items-center justify-center rounded-lg bg-subtle text-ink-2"><Link2 className="size-4" /></span>} kicker="Seleção" title={`${ed.selectedEdges.length} conexões`} />
      <div className="flex flex-col gap-1.5">
        <Label>Tipo</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {EDGE_KINDS.map((k) => (
            <Button key={k} size="sm" variant="secondary" onClick={() => ed.selectedEdges.forEach((e) => ed.updateEdge(e.id, { kind: k }, "multi-kind"))}>
              <EdgeSample kind={k} width={24} /> {EDGE_APPEARANCE[k].label}
            </Button>
          ))}
        </div>
      </div>
      <Button size="sm" variant="danger" onClick={ed.remove}>
        <Trash2 /> Excluir conexões
      </Button>
    </Scroll>
  );
}

// ------------------------------------------------------------------ multi

export const ALIGN_ACTIONS = [
  { mode: "left", label: "Alinhar à esquerda", icon: AlignStartVertical },
  { mode: "center", label: "Centralizar horizontalmente", icon: AlignCenterVertical },
  { mode: "right", label: "Alinhar à direita", icon: AlignEndVertical },
  { mode: "top", label: "Alinhar ao topo", icon: AlignStartHorizontal },
  { mode: "middle", label: "Centralizar verticalmente", icon: AlignCenterHorizontal },
  { mode: "bottom", label: "Alinhar à base", icon: AlignEndHorizontal },
] as const;

export const DISTRIBUTE_ACTIONS = [
  { axis: "horizontal", label: "Distribuir horizontalmente", icon: AlignHorizontalDistributeCenter },
  { axis: "vertical", label: "Distribuir verticalmente", icon: AlignVerticalDistributeCenter },
] as const;

function MultiInspector() {
  const ed = useEditor();
  const n = ed.selectedNodes.length;
  return (
    <Scroll>
      <Header
        icon={<span className="inline-flex size-[30px] items-center justify-center rounded-lg bg-accent-soft text-body font-semibold text-accent-ink">{n}</span>}
        kicker="Seleção"
        title={`${n} elementos`}
      />
      <LayerField />
      <div className="flex flex-col gap-1.5">
        <Label>Alinhar</Label>
        <div className="grid grid-cols-6 gap-1">
          {ALIGN_ACTIONS.map((a) => (
            <Tooltip key={a.mode} content={a.label}>
              <Button size="icon" variant="secondary" aria-label={a.label} onClick={() => ed.align(a.mode)}>
                <a.icon />
              </Button>
            </Tooltip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Distribuir</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {DISTRIBUTE_ACTIONS.map((a) => (
            <Button key={a.axis} size="sm" variant="secondary" disabled={n < 3} onClick={() => ed.distribute(a.axis)} title={n < 3 ? "Selecione 3 ou mais elementos" : a.label}>
              <a.icon /> {a.axis === "horizontal" ? "Horizontal" : "Vertical"}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Cor</Label>
        <ColorSwatches value={undefined} onChange={(color) => ed.selectedNodes.forEach((nd) => ed.updateNodeData(nd.id, { color }, "multi-color"))} />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="secondary" onClick={ed.group}>
          <Group /> Agrupar
        </Button>
        <Button size="sm" variant="secondary" onClick={ed.duplicate}>
          <CopyPlus /> Duplicar
        </Button>
      </div>
      <Button size="sm" variant="danger" onClick={ed.remove}>
        <Trash2 /> Excluir {n} elementos
      </Button>
    </Scroll>
  );
}

// ------------------------------------------------------------------ plan

function PlanInspector() {
  const ed = useEditor();
  const m = ed.meta;
  const [title, setTitle] = useState(m.title);
  const [desc, setDesc] = useState(m.description ?? "");
  const nodeCount = ed.nodes.length;
  const edgeCount = ed.edges.length;
  return (
    <Scroll>
      <div className="flex flex-col gap-0.5">
        <SectionLabel>Plan</SectionLabel>
        <p className="text-xs text-muted">Nada selecionado — estas são as propriedades do plan.</p>
      </div>
      <F label="Título" htmlFor="plan-title">
        <Input id="plan-title" className={smallInput} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() !== m.title && ed.saveMeta({ title })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      </F>
      <F label="Descrição" htmlFor="plan-desc" hint="Aparece no modo visualização e no link compartilhado.">
        <Textarea id="plan-desc" rows={4} maxLength={5000} className="min-h-[92px] rounded-lg text-body leading-[18px]" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (m.description ?? "") && ed.saveMeta({ description: desc })} />
      </F>
      <F label="Tags">
        <TagInput value={m.tags} onChange={(tags) => ed.saveMeta({ tags })} />
      </F>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
        <span className="flex flex-col">
          <span className="text-caption text-muted">Visibilidade</span>
          <span className="text-body font-medium">{VISIBILITY_LABEL[m.visibility] ?? m.visibility}</span>
        </span>
        <Button size="sm" variant="secondary" onClick={() => ed.openShare("share")}>
          Alterar
        </Button>
      </div>
      <p className="text-xs text-muted">
        {nodeCount} {nodeCount === 1 ? "elemento" : "elementos"} · {edgeCount} {edgeCount === 1 ? "conexão" : "conexões"}
      </p>
      <div className="h-px bg-line" />
      <div className="flex flex-col gap-2">
        <SectionLabel>Atalhos</SectionLabel>
        <ul className="flex flex-col gap-1.5 text-xs text-ink-2">
          {[
            ["Selecionar / mover canvas / conectar", "V · H · C"],
            ["Retângulo / losango / elipse", "R · D · O"],
            ["Seta / linha / texto / quadro", "A · L · T · F"],
            ["Lápis / borracha", "P · E"],
            ["Duplicar", "⌘D"],
            ["Copiar / colar", "⌘C · ⌘V"],
            ["Agrupar / desagrupar", "⌘G · ⇧⌘G"],
            ["Organizar (vertical / horizontal)", "⇧L · ⌥⇧L"],
            ["Desfazer / refazer", "⌘Z · ⇧⌘Z"],
            ["Ajustar à tela / 100%", "1 · 0"],
            ["Editar título", "Enter · duplo clique"],
            ["Buscar no Waypoint", "⌘K"],
          ].map(([l, k]) => (
            <li key={l} className="flex items-center justify-between gap-2">
              <span>{l}</span>
              <Kbd>{k}</Kbd>
            </li>
          ))}
        </ul>
      </div>
    </Scroll>
  );
}
