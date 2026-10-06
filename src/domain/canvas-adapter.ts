/**
 * Domain ⇄ React Flow adapter.
 *
 * The persisted model is `PlanDocument` (src/domain/plan.ts). React Flow's
 * node/edge objects are a *view* of it and never leave the planner feature:
 * everything saved, published or exported goes through `fromFlow`.
 *
 * Only types are imported from @xyflow/react so this module stays pure and
 * testable without a DOM.
 */
import type { Edge, MarkerType, Node } from "@xyflow/react";
import {
  NODE_KINDS,
  EDGE_KINDS,
  PLAN_SCHEMA_VERSION,
  sortParentsFirst,
  type EdgeKind,
  type EdgeStyle,
  type NodeData,
  type NodeKind,
  type PlanDocument,
  type PlanEdge,
  type PlanNode,
  type Viewport,
} from "./plan";
import { hiddenByLayers, layerIdOf, layerIndex, layerOpacity, layersOf, layerVisibility, LAYER_Z } from "./layers";

// ------------------------------------------------------------------ types

/**
 * Node data as seen by React Flow. `_h` keeps the expanded height of a collapsed container;
 * `_layer` and `_z` carry the node's layer and own z (React Flow's zIndex adds the layer's offset).
 */
export type FlowNodeData = NodeData & { _h?: number; _layer?: string; _z?: number; _sketch?: boolean; _num?: number } & Record<string, unknown>;
export type PlanFlowNode = Node<FlowNodeData, NodeKind>;

export type FlowEdgeData = {
  kind: EdgeKind;
  label?: string;
  description?: string;
  layer?: string;
  step?: number;
  labelPos?: number;
  style?: EdgeStyle;
  _opacity?: number;
  _diff?: string;
  /** Drawn hand-drawn unless its style says otherwise (the layer's "à mão"). */
  _sketch?: boolean;
} & Record<string, unknown>;
export type PlanFlowEdge = Edge<FlowEdgeData, "plan">;

/** Height a collapsed container shrinks to (header only). */
export const COLLAPSED_HEIGHT = 44;

/** Neutral edge ink: readable on both the light and dark canvas. */
export const EDGE_COLOR = "#8B8C94";

export type EdgeAppearance = { strokeWidth: number; dash?: string; arrow: boolean; double: boolean; label: string };

/** Visual language of each connection kind (shared by the canvas edge and the legend). */
export const EDGE_APPEARANCE: Record<EdgeKind, EdgeAppearance> = {
  relation: { strokeWidth: 1.5, arrow: false, double: false, label: "Relação" },
  flow: { strokeWidth: 1.75, arrow: true, double: false, label: "Fluxo" },
  dependency: { strokeWidth: 1.75, dash: "6 5", arrow: true, double: false, label: "Dependência" },
  strong: { strokeWidth: 5, arrow: false, double: true, label: "Forte" },
};

export const HANDLE_IDS = ["t", "r", "b", "l"] as const;

// ------------------------------------------------------------------ helpers

const round = (v: number) => Math.round(v * 10) / 10;

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function isKind(v: unknown): v is NodeKind {
  return typeof v === "string" && (NODE_KINDS as readonly string[]).includes(v);
}

function isEdgeKind(v: unknown): v is EdgeKind {
  return typeof v === "string" && (EDGE_KINDS as readonly string[]).includes(v);
}

/** Strips flow-only keys (`_*`) and undefined values so documents compare/serialize stably. */
function cleanData(data: FlowNodeData): NodeData {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("_") || v === undefined) continue;
    out[k] = v;
  }
  if (typeof out.title !== "string") out.title = "";
  return out as NodeData;
}

/** Ids of every node living inside a collapsed container (any depth), or hidden on its own with what is inside it. */
export function hiddenByCollapse(doc: Pick<PlanDocument, "nodes">): Set<string> {
  return hiddenWhere(doc, (n) => !!n.data.collapsed && (n.kind === "container" || n.kind === "section"));
}

/** Ids of the nodes hidden on their own ("Ocultar") and everything inside them. */
export function hiddenElements(doc: Pick<PlanDocument, "nodes">): Set<string> {
  return hiddenWhere(doc, () => false);
}

function hiddenWhere(doc: Pick<PlanDocument, "nodes">, collapsed: (n: PlanNode) => boolean): Set<string> {
  const children = new Map<string, string[]>();
  for (const n of doc.nodes) {
    if (!n.parentId) continue;
    const list = children.get(n.parentId) ?? [];
    list.push(n.id);
    children.set(n.parentId, list);
  }
  const hidden = new Set<string>();
  const hide = (id: string) => {
    for (const c of children.get(id) ?? []) {
      if (hidden.has(c)) continue;
      hidden.add(c);
      hide(c);
    }
  };
  for (const n of doc.nodes) {
    if (n.data.hidden) {
      hidden.add(n.id);
      hide(n.id);
    } else if (collapsed(n)) hide(n.id);
  }
  return hidden;
}

export function edgeMarker(kind: EdgeKind): PlanFlowEdge["markerEnd"] {
  if (!EDGE_APPEARANCE[kind].arrow) return undefined;
  return { type: "arrowclosed" as MarkerType, width: 16, height: 16, color: EDGE_COLOR, strokeWidth: 1.5 };
}

// ------------------------------------------------------------------ domain → flow

export type ToFlowOptions = {
  /** Ids to mark as selected. */
  selected?: ReadonlySet<string>;
  /** Read-only rendering (view mode): nodes can't be dragged/selected/connected. */
  readOnly?: boolean;
  /** Per-viewer layer visibility on top of the document's (view mode toggles, saved views). */
  layerVisibility?: Readonly<Record<string, boolean>>;
  /** Editing one layer alone ("isolar"): the others fade and can't be selected. */
  isolate?: string | null;
};

/** What a node or edge needs to know about its layer when rendered. */
type LayerRender = { z: number; hidden: boolean; locked: boolean; opacity: number; animate: boolean; out: boolean; sketch: boolean };

function layerRender(doc: Pick<PlanDocument, "layers">, opts: ToFlowOptions): Map<string, LayerRender> {
  const vis = layerVisibility(doc, opts.layerVisibility);
  const idx = layerIndex(doc);
  return new Map(
    layersOf(doc).map((l) => [
      l.id,
      { z: (idx.get(l.id) ?? 0) * LAYER_Z, hidden: vis.get(l.id) === false, locked: !opts.readOnly && !!l.locked, opacity: layerOpacity(l), animate: !!l.animate, out: !!opts.isolate && opts.isolate !== l.id, sketch: !!l.sketch },
    ]),
  );
}

export function toFlowNode(n: PlanNode, opts: ToFlowOptions = {}, hidden?: ReadonlySet<string>, layer?: LayerRender): PlanFlowNode {
  const collapsed = !!n.data.collapsed && (n.kind === "container" || n.kind === "section");
  const data: FlowNodeData = { ...n.data, _layer: n.layer, _z: n.z };
  if (layer?.sketch) data._sketch = true;
  if (collapsed) data._h = n.height;
  const out: PlanFlowNode = {
    id: n.id,
    type: n.kind,
    position: { x: n.x, y: n.y },
    width: n.width,
    height: collapsed ? COLLAPSED_HEIGHT : n.height,
    data,
  };
  if (n.parentId) out.parentId = n.parentId;
  if (n.z !== undefined || layer?.z) out.zIndex = (layer?.z ?? 0) + (n.z ?? 0);
  // Pins and callouts float above their layer's drawing; highlighted areas sit under it.
  if (n.kind === "annotation") {
    const t = n.data.annotation?.type;
    out.zIndex = (layer?.z ?? 0) + (n.z ?? 0) + (t === "highlight" ? -1 : t === "bracket" ? 0 : 900);
  }
  if (hidden?.has(n.id)) out.hidden = true;
  if (opts.selected?.has(n.id)) out.selected = true;
  if (n.data.locked && !opts.readOnly) {
    // A locked element: stays put and out of the way of clicks; the layers panel still selects it.
    out.draggable = false;
    out.selectable = false;
    out.deletable = false;
    out.className = "wp-locked";
  }
  if (layer?.locked) {
    // Locked layer: stays put, can't be selected, but can still be the end of a new connection.
    out.draggable = false;
    out.selectable = false;
    out.deletable = false;
  }
  if (layer && layer.opacity < 1) out.style = { opacity: layer.opacity };
  if (layer?.out) {
    out.className = "wp-isolate-out";
    out.draggable = false;
    out.selectable = false;
    out.deletable = false;
    out.connectable = false;
  }
  if (opts.readOnly) {
    out.draggable = false;
    out.selectable = false;
    out.connectable = false;
    out.focusable = false;
  }
  return out;
}

export function toFlowNodes(doc: Pick<PlanDocument, "nodes"> & Partial<Pick<PlanDocument, "layers" | "edges">>, opts: ToFlowOptions = {}): PlanFlowNode[] {
  const hidden = hiddenByCollapse(doc);
  const layers = layerRender(doc, opts);
  for (const id of hiddenByLayers({ nodes: doc.nodes, edges: [] }, new Map([...layers].map(([k, v]) => [k, !v.hidden]))).nodes) hidden.add(id);
  // Pins carry their number (the legend uses the same order).
  const pins = new Map<string, number>();
  for (const n of doc.nodes) if (n.kind === "annotation" && n.data.annotation?.type === "pin") pins.set(n.id, pins.size + 1);
  // React Flow requires parents before children.
  return sortParentsFirst(doc.nodes).map((n) => {
    const out = toFlowNode(n, opts, hidden, layers.get(layerIdOf(n)));
    const num = pins.get(n.id);
    if (num) out.data._num = num;
    return out;
  });
}

export function toFlowEdge(e: PlanEdge, opts: ToFlowOptions = {}, layer?: LayerRender): PlanFlowEdge {
  const kind = isEdgeKind(e.kind) ? e.kind : "flow";
  const out: PlanFlowEdge = {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    type: "plan",
    data: { kind, label: e.label, description: e.description, layer: e.layer, step: e.step, labelPos: e.labelPos, style: e.style },
    markerEnd: edgeMarker(kind),
    // Above top-level containers so connectors crossing an area stay visible (and above
    // everything on lower layers).
    zIndex: (layer?.z ?? 0) + 1,
  };
  if (opts.selected?.has(e.id)) out.selected = true;
  if (layer?.hidden) out.hidden = true;
  if (layer?.animate) out.animated = true;
  // Read by the edge component (React Flow doesn't apply edge styles to the label).
  if (layer && layer.opacity < 1) out.data!._opacity = layer.opacity;
  if (layer?.sketch) out.data!._sketch = true;
  // Drawn with the arrow/line tools: the eraser can take it.
  if (e.style) out.className = out.className ? `${out.className} wp-drawn-edge` : "wp-drawn-edge";
  if (layer?.out) {
    out.className = out.className ? `${out.className} wp-isolate-out` : "wp-isolate-out";
    out.selectable = false;
    out.deletable = false;
    out.reconnectable = false;
    out.data!._dim = true;
  }
  if (layer?.locked) {
    out.selectable = false;
    out.deletable = false;
    out.reconnectable = false;
  }
  if (opts.readOnly) {
    out.selectable = false;
    out.focusable = false;
  }
  return out;
}

/**
 * Picks facing sides for edges stored without handles (imports, seeds) so
 * they don't all leave from the top handle.
 */
export function autoHandles(nodes: PlanNode[] | ReadonlyMap<string, PlanNode>, source: string, target: string): { sourceHandle: string; targetHandle: string } | null {
  const byId = nodes instanceof Map ? nodes : new Map((nodes as PlanNode[]).map((n) => [n.id, n]));
  const center = (id: string) => {
    const n = byId.get(id);
    if (!n) return null;
    let x = n.x + n.width / 2;
    let y = n.y + n.height / 2;
    let p = n.parentId ? byId.get(n.parentId) : undefined;
    const seen = new Set<string>();
    while (p && !seen.has(p.id)) {
      seen.add(p.id);
      x += p.x;
      y += p.y;
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return { x, y };
  };
  const a = center(source);
  const b = center(target);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? { sourceHandle: "r", targetHandle: "l" } : { sourceHandle: "l", targetHandle: "r" };
  return dy >= 0 ? { sourceHandle: "b", targetHandle: "t" } : { sourceHandle: "t", targetHandle: "b" };
}

export function toFlowEdges(doc: Pick<PlanDocument, "edges"> & Partial<Pick<PlanDocument, "nodes" | "layers">>, opts: ToFlowOptions = {}): PlanFlowEdge[] {
  const layers = layerRender(doc, opts);
  let byId: Map<string, PlanNode> | null = null;
  return doc.edges.map((e) => {
    const out = toFlowEdge(e, opts, layers.get(layerIdOf(e)));
    if ((!out.sourceHandle || !out.targetHandle) && doc.nodes) {
      byId ??= new Map(doc.nodes.map((n) => [n.id, n]));
      const h = autoHandles(byId, e.source, e.target);
      if (h) {
        out.sourceHandle = out.sourceHandle || h.sourceHandle;
        out.targetHandle = out.targetHandle || h.targetHandle;
      }
    }
    return out;
  });
}

// ------------------------------------------------------------------ flow → domain

type AnyFlowNode = Pick<Node, "id" | "position" | "width" | "height" | "measured" | "style" | "parentId" | "zIndex"> & {
  type?: string;
  data: Record<string, unknown>;
};
type AnyFlowEdge = Pick<Edge, "id" | "source" | "target" | "sourceHandle" | "targetHandle"> & { data?: Record<string, unknown> };

export const DEFAULT_SIZE = { width: 200, height: 72 };

export function fromFlowNode(n: AnyFlowNode): PlanNode {
  const data = n.data as FlowNodeData;
  const width = num(n.width) ?? num(n.measured?.width) ?? num(n.style?.width) ?? DEFAULT_SIZE.width;
  let height = num(n.height) ?? num(n.measured?.height) ?? num(n.style?.height) ?? DEFAULT_SIZE.height;
  if (data.collapsed && typeof data._h === "number") height = data._h;
  const out: PlanNode = {
    id: n.id,
    kind: isKind(n.type) ? n.type : "block",
    x: round(n.position.x),
    y: round(n.position.y),
    width: Math.max(1, round(width)),
    height: Math.max(1, round(height)),
    data: cleanData(data),
  };
  if (n.parentId) out.parentId = n.parentId;
  // Nodes from toFlowNode carry their own z (zIndex includes the layer offset).
  const z = "_z" in data ? data._z : n.zIndex;
  if (typeof z === "number" && Number.isInteger(z)) out.z = z;
  if (typeof data._layer === "string") out.layer = data._layer;
  return out;
}

export function fromFlowEdge(e: AnyFlowEdge): PlanEdge {
  const d = (e.data ?? {}) as Partial<FlowEdgeData>;
  const out: PlanEdge = {
    id: e.id,
    source: e.source,
    target: e.target,
    kind: isEdgeKind(d.kind) ? d.kind : "flow",
  };
  if (e.sourceHandle) out.sourceHandle = e.sourceHandle;
  if (e.targetHandle) out.targetHandle = e.targetHandle;
  if (d.label) out.label = d.label;
  if (d.description) out.description = d.description;
  if (typeof d.layer === "string") out.layer = d.layer;
  if (typeof d.step === "number" && Number.isInteger(d.step) && d.step >= 1) out.step = d.step;
  if (typeof d.labelPos === "number" && d.labelPos >= 0 && d.labelPos <= 1) out.labelPos = d.labelPos;
  if (d.style && typeof d.style === "object") {
    const style = Object.fromEntries(Object.entries(d.style).filter(([, v]) => v !== undefined)) as EdgeStyle;
    if (Object.keys(style).length) out.style = style;
  }
  return out;
}

export function fromFlow(nodes: AnyFlowNode[], edges: AnyFlowEdge[], viewport: Viewport): PlanDocument {
  const planNodes = sortParentsFirst(nodes.map(fromFlowNode));
  const ids = new Set(planNodes.map((n) => n.id));
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    nodes: planNodes,
    edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map(fromFlowEdge),
    viewport: { x: round(viewport.x), y: round(viewport.y), zoom: Math.round(viewport.zoom * 1000) / 1000 || 1 },
  };
}

/**
 * Cheap identity of everything `fromFlow` reads (selection and other UI-only flags
 * excluded). When two fingerprints match, the content signature can't have changed —
 * lets the editor skip serializing the whole document on selection/hover updates.
 */
export function flowFingerprint(nodes: AnyFlowNode[], edges: AnyFlowEdge[]): unknown[] {
  const out: unknown[] = [];
  for (const n of nodes) {
    out.push(n.id, n.type, n.position.x, n.position.y, n.width, n.height, n.measured?.width, n.measured?.height, n.style?.width, n.style?.height, n.parentId, n.zIndex, n.data);
  }
  out.push("|");
  for (const e of edges) out.push(e.id, e.source, e.target, e.sourceHandle, e.targetHandle, e.data);
  return out;
}

export function sameFingerprint(a: readonly unknown[] | null, b: readonly unknown[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/** Stable string of the document *content* (viewport excluded) — used to detect real changes. */
export function contentSignature(doc: Pick<PlanDocument, "nodes" | "edges"> & Partial<Pick<PlanDocument, "layers" | "views" | "palette">>): string {
  return stableStringify([doc.nodes, doc.edges, doc.layers ?? null, doc.views ?? null, ...(doc.palette?.length ? [doc.palette] : [])]);
}

/** JSON with sorted object keys and undefined values dropped (key order independent). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = v[k];
      return out;
    }
    return v;
  });
}
