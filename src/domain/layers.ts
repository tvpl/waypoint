/**
 * Layers: pure operations over a plan document (no React, no React Flow).
 *
 * Every node and edge lives on one layer (`layer` id; missing = the base layer). A node inside
 * a container/section always shares the layer of its top-level ancestor, so moving an area to
 * another layer moves everything in it. Layers stack in array order: later ones render above.
 * The base layer exists implicitly; it is written to `doc.layers` only once edited (renamed,
 * hidden, reordered…).
 */
import type { PlanDocument, PlanEdge, PlanLayer, PlanNode, PlanView } from "./plan";

export const BASE_LAYER_ID = "base";
export const BASE_LAYER: PlanLayer = { id: BASE_LAYER_ID, name: "Base", visible: true };

/** Stacking distance between layers (node `z` values stay well inside it). */
export const LAYER_Z = 1000;

/** Default colors for new layers (badge and selection tint). */
export const LAYER_COLORS = ["#2F4FD8", "#E5484D", "#12A594", "#F76B15", "#8E4EC6", "#D6409F", "#0090FF", "#46A758"] as const;

type Doc = Pick<PlanDocument, "nodes" | "edges"> & Partial<Pick<PlanDocument, "layers" | "views" | "viewport" | "schemaVersion">>;

const newLayerId = () => `l${Math.random().toString(36).slice(2, 10)}`;

/** All layers, bottom to top, with the base layer included. */
export function layersOf(doc: Pick<Doc, "layers">): PlanLayer[] {
  const list = doc.layers ?? [];
  return list.some((l) => l.id === BASE_LAYER_ID) ? list : [BASE_LAYER, ...list];
}

export const layerIdOf = (x: { layer?: string }) => x.layer ?? BASE_LAYER_ID;

/** Effective visibility per layer: the document's, with optional per-viewer overrides. */
export function layerVisibility(doc: Pick<Doc, "layers">, overrides?: Readonly<Record<string, boolean>>): Map<string, boolean> {
  return new Map(layersOf(doc).map((l) => [l.id, overrides && l.id in overrides ? overrides[l.id] : l.visible !== false]));
}

/** Copies each top-level node's layer onto its descendants (and clears unknown layers). */
export function syncNodeLayers(nodes: PlanNode[], layerIds?: ReadonlySet<string>): PlanNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rootOf = (n: PlanNode) => {
    let cur = n;
    const seen = new Set<string>();
    while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId)!;
    }
    return cur;
  };
  let changed = false;
  const out = nodes.map((n) => {
    let layer = rootOf(n).layer;
    if (layer === BASE_LAYER_ID || (layer && layerIds && !layerIds.has(layer))) layer = undefined;
    if (layer === n.layer) return n;
    changed = true;
    if (layer === undefined) {
      const { layer: _l, ...rest } = n;
      return rest;
    }
    return { ...n, layer };
  });
  return changed ? out : nodes;
}

function withLayers<T extends Doc>(doc: T, layers: PlanLayer[]): T {
  // Only the implicit base left, unchanged: no need to store anything.
  const onlyDefaultBase = layers.length === 1 && layers[0].id === BASE_LAYER_ID && layers[0].name === BASE_LAYER.name && layers[0].visible !== false && !layers[0].locked && !layers[0].animate && !layers[0].dimmed && !layers[0].color;
  const next = { ...doc, layers: onlyDefaultBase ? undefined : layers };
  if (!next.layers) delete next.layers;
  return next;
}

export function addLayer<T extends Doc>(doc: T, name?: string): { doc: T; id: string } {
  const layers = layersOf(doc);
  const id = newLayerId();
  const used = new Set(layers.map((l) => l.color));
  const color = LAYER_COLORS.find((c) => !used.has(c)) ?? LAYER_COLORS[layers.length % LAYER_COLORS.length];
  const layer: PlanLayer = { id, name: name?.trim() || `Camada ${layers.length + 1}`, visible: true, color };
  return { doc: withLayers(doc, [...layers, layer]), id };
}

export function updateLayer<T extends Doc>(doc: T, id: string, patch: Partial<Omit<PlanLayer, "id">>): T {
  const layers = layersOf(doc);
  if (!layers.some((l) => l.id === id)) return doc;
  return withLayers(
    doc,
    layers.map((l) => (l.id === id ? { ...l, ...patch, name: (patch.name ?? l.name).slice(0, 80) } : l)),
  );
}

/** Moves a layer one step up (towards the top) or down. */
export function moveLayer<T extends Doc>(doc: T, id: string, dir: "up" | "down"): T {
  const layers = [...layersOf(doc)];
  const i = layers.findIndex((l) => l.id === id);
  const j = dir === "up" ? i + 1 : i - 1;
  if (i < 0 || j < 0 || j >= layers.length) return doc;
  [layers[i], layers[j]] = [layers[j], layers[i]];
  return withLayers(doc, layers);
}

/**
 * Removes a layer. "merge" moves its content to the layer below it (or the base); "delete"
 * removes the content too. The base layer can't be removed.
 */
export function removeLayer<T extends Doc>(doc: T, id: string, mode: "merge" | "delete"): T {
  if (id === BASE_LAYER_ID) return doc;
  const layers = layersOf(doc);
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return doc;
  const below = layers[i - 1]?.id ?? BASE_LAYER_ID;
  const target = below === BASE_LAYER_ID ? undefined : below;
  const rest = layers.filter((l) => l.id !== id);
  const views = doc.views?.map((v) => ({ ...v, layers: v.layers.filter((l) => l !== id) }));
  let nodes: PlanNode[];
  let edges: PlanEdge[];
  if (mode === "delete") {
    nodes = doc.nodes.filter((n) => layerIdOf(n) !== id);
    const ids = new Set(nodes.map((n) => n.id));
    edges = doc.edges.filter((e) => layerIdOf(e) !== id && ids.has(e.source) && ids.has(e.target));
  } else {
    const move = <X extends { layer?: string }>(x: X): X => {
      if (layerIdOf(x) !== id) return x;
      const { layer: _l, ...r } = x;
      return (target ? { ...r, layer: target } : r) as X;
    };
    nodes = doc.nodes.map(move);
    edges = doc.edges.map(move);
  }
  return withLayers({ ...doc, nodes, edges, ...(views ? { views } : {}) }, rest);
}

/** Puts nodes (with everything inside them) and edges on a layer. */
export function assignLayer<T extends Doc>(doc: T, layerId: string, ids: { nodes?: Iterable<string>; edges?: Iterable<string> }): T {
  const known = new Set(layersOf(doc).map((l) => l.id));
  if (!known.has(layerId)) return doc;
  const value = layerId === BASE_LAYER_ID ? undefined : layerId;
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const roots = new Set<string>();
  for (const id of ids.nodes ?? []) {
    let cur = byId.get(id);
    const seen = new Set<string>();
    while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
    }
    if (cur) roots.add(cur.id);
  }
  const set = <X extends { layer?: string }>(x: X): X => {
    const { layer: _l, ...r } = x;
    return (value ? { ...r, layer: value } : r) as X;
  };
  const edgeIds = new Set(ids.edges ?? []);
  const nodes = syncNodeLayers(
    doc.nodes.map((n) => (roots.has(n.id) ? set(n) : n)),
    known,
  );
  const edges = doc.edges.map((e) => (edgeIds.has(e.id) ? set(e) : e));
  return { ...doc, nodes, edges };
}

/** Shows only this layer (and the base, as context, unless it is the base itself). */
export function soloLayer<T extends Doc>(doc: T, id: string): T {
  const layers = layersOf(doc);
  return withLayers(
    doc,
    layers.map((l) => ({ ...l, visible: l.id === id || l.id === BASE_LAYER_ID })),
  );
}

export function showAllLayers<T extends Doc>(doc: T): T {
  return withLayers(
    doc,
    layersOf(doc).map((l) => ({ ...l, visible: true })),
  );
}

// ------------------------------------------------------------------ views

export function saveView<T extends Doc>(doc: T, name: string): { doc: T; id: string } {
  const id = `v${Math.random().toString(36).slice(2, 10)}`;
  const visible = layersOf(doc)
    .filter((l) => l.visible !== false)
    .map((l) => l.id);
  const view: PlanView = { id, name: name.trim().slice(0, 80) || "Visão", layers: visible };
  return { doc: { ...doc, views: [...(doc.views ?? []), view] }, id };
}

export function removeView<T extends Doc>(doc: T, id: string): T {
  const views = (doc.views ?? []).filter((v) => v.id !== id);
  const next: T = { ...doc, views };
  if (!views.length) delete (next as Partial<Doc>).views;
  return next;
}

/** Visibility a view asks for: its layers on, every other layer off. */
export function viewVisibility(doc: Pick<Doc, "layers" | "views">, viewId: string): Record<string, boolean> | null {
  const view = doc.views?.find((v) => v.id === viewId);
  if (!view) return null;
  const on = new Set(view.layers);
  return Object.fromEntries(layersOf(doc).map((l) => [l.id, on.has(l.id)]));
}

export function applyView<T extends Doc>(doc: T, viewId: string): T {
  const vis = viewVisibility(doc, viewId);
  if (!vis) return doc;
  return withLayers(
    doc,
    layersOf(doc).map((l) => ({ ...l, visible: vis[l.id] })),
  );
}

/** The saved view matching the current visibility, if any. */
export function activeView(doc: Pick<Doc, "layers" | "views">, visibility: ReadonlyMap<string, boolean>): string | null {
  for (const v of doc.views ?? []) {
    const on = new Set(v.layers);
    if (layersOf(doc).every((l) => (visibility.get(l.id) ?? true) === on.has(l.id))) return v.id;
  }
  return null;
}

// ------------------------------------------------------------------ rendering helpers

/** Nodes and edges hidden because their layer is off (an edge also hides with either end). */
export function hiddenByLayers(doc: Doc, visibility: ReadonlyMap<string, boolean>): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set(doc.nodes.filter((n) => visibility.get(layerIdOf(n)) === false).map((n) => n.id));
  const edges = new Set(doc.edges.filter((e) => visibility.get(layerIdOf(e)) === false || nodes.has(e.source) || nodes.has(e.target)).map((e) => e.id));
  return { nodes, edges };
}

/** Stacking index of each layer (0 = bottom). */
export function layerIndex(doc: Pick<Doc, "layers">): Map<string, number> {
  return new Map(layersOf(doc).map((l, i) => [l.id, i]));
}

/** Counts of nodes and edges per layer, for the layers panel. */
export function layerCounts(doc: Doc): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of [...doc.nodes.filter((n) => !n.parentId), ...doc.edges]) out.set(layerIdOf(x), (out.get(layerIdOf(x)) ?? 0) + 1);
  return out;
}
