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
  type NodeData,
  type NodeKind,
  type PlanDocument,
  type PlanEdge,
  type PlanNode,
  type Viewport,
} from "./plan";

// ------------------------------------------------------------------ types

/** Node data as seen by React Flow. `_h` keeps the expanded height of a collapsed container. */
export type FlowNodeData = NodeData & { _h?: number } & Record<string, unknown>;
export type PlanFlowNode = Node<FlowNodeData, NodeKind>;

export type FlowEdgeData = { kind: EdgeKind; label?: string; description?: string } & Record<string, unknown>;
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

/** Ids of every node living inside a collapsed container (any depth). */
export function hiddenByCollapse(doc: Pick<PlanDocument, "nodes">): Set<string> {
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
  for (const n of doc.nodes) if (n.data.collapsed && (n.kind === "container" || n.kind === "section")) hide(n.id);
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
};

export function toFlowNode(n: PlanNode, opts: ToFlowOptions = {}, hidden?: ReadonlySet<string>): PlanFlowNode {
  const collapsed = !!n.data.collapsed && (n.kind === "container" || n.kind === "section");
  const data: FlowNodeData = { ...n.data };
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
  if (n.z !== undefined) out.zIndex = n.z;
  if (hidden?.has(n.id)) out.hidden = true;
  if (opts.selected?.has(n.id)) out.selected = true;
  if (opts.readOnly) {
    out.draggable = false;
    out.selectable = false;
    out.connectable = false;
    out.focusable = false;
  }
  return out;
}

export function toFlowNodes(doc: Pick<PlanDocument, "nodes">, opts: ToFlowOptions = {}): PlanFlowNode[] {
  const hidden = hiddenByCollapse(doc);
  // React Flow requires parents before children.
  return sortParentsFirst(doc.nodes).map((n) => toFlowNode(n, opts, hidden));
}

export function toFlowEdge(e: PlanEdge, opts: ToFlowOptions = {}): PlanFlowEdge {
  const kind = isEdgeKind(e.kind) ? e.kind : "flow";
  const out: PlanFlowEdge = {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    type: "plan",
    data: { kind, label: e.label, description: e.description },
    markerEnd: edgeMarker(kind),
    // Above top-level containers so connectors crossing an area stay visible.
    zIndex: 1,
  };
  if (opts.selected?.has(e.id)) out.selected = true;
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
export function autoHandles(nodes: PlanNode[], source: string, target: string): { sourceHandle: string; targetHandle: string } | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
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

export function toFlowEdges(doc: Pick<PlanDocument, "edges"> & Partial<Pick<PlanDocument, "nodes">>, opts: ToFlowOptions = {}): PlanFlowEdge[] {
  return doc.edges.map((e) => {
    const out = toFlowEdge(e, opts);
    if ((!out.sourceHandle || !out.targetHandle) && doc.nodes) {
      const h = autoHandles(doc.nodes, e.source, e.target);
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
  if (typeof n.zIndex === "number" && Number.isInteger(n.zIndex)) out.z = n.zIndex;
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

/** Stable string of the document *content* (viewport excluded) — used to detect real changes. */
export function contentSignature(doc: Pick<PlanDocument, "nodes" | "edges">): string {
  return stableStringify([doc.nodes, doc.edges]);
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
