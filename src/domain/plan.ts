/**
 * Planner domain model.
 *
 * This is the product's own representation of a plan document. It is
 * deliberately independent from React Flow: the canvas adapter
 * (src/domain/canvas-adapter.ts) converts between the two, so the persisted
 * format never leaks library internals and can be migrated via schemaVersion.
 */
import { z } from "zod";
import { syncNodeLayers } from "./layers";

export const PLAN_SCHEMA_VERSION = 1;

// ------------------------------------------------------------------ resources

export const resourceRefSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url"), url: z.string().url().max(2048) }),
  z.object({ type: z.literal("plan"), id: z.string().min(1).max(64) }),
  z.object({ type: z.literal("favorite"), id: z.string().min(1).max(64) }),
  z.object({ type: z.literal("collection"), id: z.string().min(1).max(64) }),
  z.object({ type: z.literal("file"), id: z.string().min(1).max(64) }),
  z.object({ type: z.literal("page"), path: z.string().startsWith("/").max(512) }),
]);
export type ResourceRef = z.infer<typeof resourceRefSchema>;

/** How a node's resource opens when clicked in View Mode. */
export const OPEN_IN = ["new-tab", "modal", "details"] as const;
export type OpenIn = (typeof OPEN_IN)[number];

// ------------------------------------------------------------------ nodes

export const NODE_KINDS = ["block", "container", "note", "link", "section", "image", "text", "ink"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const NODE_STATUSES = ["none", "idea", "planned", "in-progress", "production", "deprecated"] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * A freehand stroke ("ink" node). Points are x,y pairs relative to the node, in the box it was
 * drawn in (`w` × `h`); the canvas scales them when the node is resized.
 */
export const inkSchema = z.object({
  points: z.array(z.number().finite()).min(2).max(4000),
  w: z.number().finite().positive().max(20000),
  h: z.number().finite().positive().max(20000),
  size: z.number().finite().min(0.5).max(80),
  /** Wide translucent marker. */
  highlighter: z.boolean().optional(),
  /** Straight line with an arrowhead at the end. */
  arrow: z.boolean().optional(),
});
export type Ink = z.infer<typeof inkSchema>;

export const nodeDataSchema = z.object({
  title: z.string().max(300).default(""),
  description: z.string().max(5000).optional(),
  icon: z.string().max(64).optional(),
  color: hexColor.optional(),
  image: z.string().max(2048).optional(),
  tags: z.array(z.string().max(64)).max(50).optional(),
  status: z.enum(NODE_STATUSES).optional(),
  resource: resourceRefSchema.nullable().optional(),
  openIn: z.enum(OPEN_IN).optional(),
  collapsed: z.boolean().optional(),
  ink: inkSchema.optional(),
  /**
   * Presentation mode. Without any `order` in the plan, steps are the
   * top-level areas then the other top-level nodes (reading order) minus
   * `hidden` ones; once any node has an `order`, only ordered nodes are shown.
   */
  presentation: z
    .object({
      order: z.number().int().min(1).max(9999).optional(),
      hidden: z.boolean().optional(),
    })
    .optional(),
});
export type NodeData = z.infer<typeof nodeDataSchema>;

export const planNodeSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(NODE_KINDS),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive().max(20000),
  height: z.number().finite().positive().max(20000),
  /** Parent container/section. Child x/y are relative to the parent. */
  parentId: z.string().max(64).optional(),
  z: z.number().int().optional(),
  /** Layer (see src/domain/layers.ts); missing = the base layer. Children follow their top-level ancestor. */
  layer: z.string().max(64).optional(),
  data: nodeDataSchema,
});
export type PlanNode = z.infer<typeof planNodeSchema>;

// ------------------------------------------------------------------ edges

export const EDGE_KINDS = ["relation", "flow", "dependency", "strong"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const planEdgeSchema = z.object({
  id: z.string().min(1).max(64),
  source: z.string().min(1).max(64),
  target: z.string().min(1).max(64),
  sourceHandle: z.string().max(32).nullable().optional(),
  targetHandle: z.string().max(32).nullable().optional(),
  kind: z.enum(EDGE_KINDS).default("flow"),
  label: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  layer: z.string().max(64).optional(),
});
export type PlanEdge = z.infer<typeof planEdgeSchema>;

// ------------------------------------------------------------------ document

export const viewportSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite().positive().max(10),
});
export type Viewport = z.infer<typeof viewportSchema>;

// ------------------------------------------------------------------ layers & views

/**
 * Layers stack the drawing: later layers render above earlier ones. Each can be hidden, locked
 * or have its connections animated, so one plan can carry alternative flows, versions or
 * annotations over the same base. The base layer is implicit until edited (src/domain/layers.ts).
 */
export const planLayerSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(80),
  color: hexColor.optional(),
  visible: z.boolean().default(true),
  locked: z.boolean().optional(),
  /** Moving dashes on this layer's connections, to show a flow. */
  animate: z.boolean().optional(),
  /** Shown faded (context for the other layers). */
  dimmed: z.boolean().optional(),
  description: z.string().max(500).optional(),
});
export type PlanLayer = z.infer<typeof planLayerSchema>;

/** A saved combination of visible layers ("Fluxo atual", "Proposta v2"…). */
export const planViewSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(80),
  layers: z.array(z.string().max(64)).max(50),
});
export type PlanView = z.infer<typeof planViewSchema>;

export const planDocumentSchema = z.object({
  schemaVersion: z.literal(PLAN_SCHEMA_VERSION).default(PLAN_SCHEMA_VERSION),
  nodes: z.array(planNodeSchema).max(5000),
  edges: z.array(planEdgeSchema).max(10000),
  viewport: viewportSchema,
  layers: z.array(planLayerSchema).max(50).optional(),
  views: z.array(planViewSchema).max(30).optional(),
});
export type PlanDocument = z.infer<typeof planDocumentSchema>;

export const EMPTY_DOCUMENT: PlanDocument = {
  schemaVersion: PLAN_SCHEMA_VERSION,
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

/**
 * Validates a document and removes dangling references (edges to missing
 * nodes, parents that no longer exist) so a bad client can't persist a
 * document the canvas cannot render.
 */
export function normalizeDocument(input: unknown): PlanDocument {
  const doc = planDocumentSchema.parse(input);
  const ids = new Set(doc.nodes.map((n) => n.id));
  // Layers: unique ids; nodes, edges and views only point at layers that exist.
  const seenLayers = new Set<string>();
  const layers = doc.layers?.filter((l) => !seenLayers.has(l.id) && seenLayers.add(l.id));
  const layerIds = new Set(layers?.map((l) => l.id));
  const knownLayer = <T extends { layer?: string }>(x: T): T => {
    if (x.layer === undefined || layerIds.has(x.layer)) return x;
    const { layer: _l, ...rest } = x;
    return rest as T;
  };
  const nodes = doc.nodes.map((n) => knownLayer(n.parentId && !ids.has(n.parentId) ? { ...n, parentId: undefined } : n));
  const edges = doc.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target).map(knownLayer);
  const views = doc.views?.map((v) => ({ ...v, layers: v.layers.filter((id) => layerIds.has(id) || id === "base") }));
  const out: PlanDocument = { ...doc, nodes: syncNodeLayers(sortParentsFirst(nodes), layerIds), edges };
  if (layers?.length) out.layers = layers;
  else delete out.layers;
  if (views?.length) out.views = views;
  else delete out.views;
  return out;
}

/** React Flow requires parents to appear before their children. */
export function sortParentsFirst(nodes: PlanNode[]): PlanNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: PlanNode[] = [];
  const seen = new Set<string>();
  const visit = (n: PlanNode, stack: Set<string>) => {
    if (seen.has(n.id)) return;
    if (stack.has(n.id)) {
      // cycle: detach
      n = { ...n, parentId: undefined };
    } else if (n.parentId) {
      const p = byId.get(n.parentId);
      if (p) visit(p, new Set([...stack, n.id]));
      if (seen.has(n.id)) return; // placed while resolving a cycle
    }
    seen.add(n.id);
    out.push(n);
  };
  for (const n of nodes) visit(n, new Set());
  return out;
}

/** Text worth indexing for search: titles, descriptions and tags of nodes. */
export function documentSearchEntries(doc: PlanDocument) {
  return doc.nodes
    .filter((n) => n.data.title || n.data.description)
    .map((n) => ({
      nodeId: n.id,
      title: n.data.title,
      body: n.data.description ?? "",
      tags: (n.data.tags ?? []).join(" "),
    }));
}

/** Resource references held by nodes (for the backlinks index). */
export function documentResourceRefs(doc: PlanDocument) {
  const out: { nodeId: string; nodeTitle: string; type: ResourceRef["type"]; targetId: string }[] = [];
  for (const n of doc.nodes) {
    const r = n.data.resource;
    if (!r) continue;
    const targetId = r.type === "url" ? r.url : r.type === "page" ? r.path : r.id;
    out.push({ nodeId: n.id, nodeTitle: n.data.title, type: r.type, targetId });
  }
  return out;
}
