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

/** How opaque a layer renders (the old `dimmed` flag reads as 30%). */
export function layerOpacity(l: Pick<PlanLayer, "opacity" | "dimmed">): number {
  return l.opacity ?? (l.dimmed ? 0.3 : 1);
}

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
  const b = layers[0];
  const onlyDefaultBase =
    layers.length === 1 && b.id === BASE_LAYER_ID && b.name === BASE_LAYER.name && b.visible !== false && !b.locked && !b.animate && !b.dimmed && !b.color && !b.reveal && (b.opacity ?? 1) >= 1;
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
    layers.map((l) => {
      if (l.id !== id) return l;
      const next: PlanLayer = { ...l, ...patch, name: (patch.name ?? l.name).slice(0, 80) };
      // Opacity replaces the old on/off fade; full opacity and false flags aren't stored.
      if ("opacity" in patch) delete next.dimmed;
      if (next.opacity !== undefined && next.opacity >= 1) delete next.opacity;
      for (const k of ["locked", "animate", "dimmed", "reveal"] as const) if (next[k] === false) delete next[k];
      return next;
    }),
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

// ------------------------------------------------------------------ templates

export type LayerTemplate = {
  id: string;
  name: string;
  description: string;
  /** New name for the base layer while it still has the default one. */
  base: string;
  layers: { name: string; color: string; reveal?: boolean; animate?: boolean; opacity?: number }[];
  /** Saved views, by layer position: 0 = base, 1… = the template's layers. */
  views: { name: string; layers: number[] }[];
};

/** Ready-made layer sets for the usual "perspectives" over one drawing. */
export const LAYER_TEMPLATES: LayerTemplate[] = [
  {
    id: "proposal",
    name: "Atual, proposta e riscos",
    description: "O que existe hoje, o que muda e o que preocupa.",
    base: "Atual",
    layers: [
      { name: "Proposta", color: "#12A594", animate: true, reveal: true },
      { name: "Riscos", color: "#E5484D", reveal: true },
    ],
    views: [
      { name: "Hoje", layers: [0] },
      { name: "Com a proposta", layers: [0, 1] },
      { name: "Proposta e riscos", layers: [0, 1, 2] },
    ],
  },
  {
    id: "exceptions",
    name: "Fluxo principal e exceções",
    description: "O caminho feliz separado dos desvios e erros.",
    base: "Fluxo principal",
    layers: [
      { name: "Exceções", color: "#F76B15", animate: true },
      { name: "Erros", color: "#E5484D" },
    ],
    views: [
      { name: "Caminho feliz", layers: [0] },
      { name: "Com exceções", layers: [0, 1] },
      { name: "Tudo", layers: [0, 1, 2] },
    ],
  },
  {
    id: "versions",
    name: "Versões v1 → v3",
    description: "Cada versão acrescenta uma camada; a apresentação revela uma por vez.",
    base: "v1",
    layers: [
      { name: "v2", color: "#2F4FD8", reveal: true },
      { name: "v3", color: "#8E4EC6", reveal: true },
    ],
    views: [
      { name: "v1", layers: [0] },
      { name: "v2", layers: [0, 1] },
      { name: "v3", layers: [0, 1, 2] },
    ],
  },
  {
    id: "extras",
    name: "Essencial, complementos e notas",
    description: "O núcleo limpo, com detalhes e anotações por cima.",
    base: "Essencial",
    layers: [
      { name: "Complementos", color: "#0090FF" },
      { name: "Anotações", color: "#D6409F", opacity: 0.85 },
    ],
    views: [
      { name: "Essencial", layers: [0] },
      { name: "Com complementos", layers: [0, 1] },
      { name: "Completo", layers: [0, 1, 2] },
    ],
  },
];

/**
 * Adds a template's layers and views. Existing layers stay; a name already in use gets a
 * number. Returns the first new layer (to make it the active one).
 */
export function applyLayerTemplate<T extends Doc>(doc: T, templateId: string): { doc: T; first: string | null } {
  const t = LAYER_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return { doc, first: null };
  let layers = layersOf(doc).map((l) => (l.id === BASE_LAYER_ID && l.name === BASE_LAYER.name ? { ...l, name: t.base } : l));
  const names = new Set(layers.map((l) => l.name.toLowerCase()));
  const unique = (name: string) => {
    let out = name;
    for (let i = 2; names.has(out.toLowerCase()); i++) out = `${name} (${i})`;
    names.add(out.toLowerCase());
    return out;
  };
  const ids = [BASE_LAYER_ID];
  for (const l of t.layers) {
    const id = newLayerId();
    ids.push(id);
    const layer: PlanLayer = { id, name: unique(l.name), color: l.color, visible: true };
    if (l.reveal) layer.reveal = true;
    if (l.animate) layer.animate = true;
    if (l.opacity !== undefined) layer.opacity = l.opacity;
    layers = [...layers, layer];
  }
  const views: PlanView[] = [...(doc.views ?? [])];
  for (const v of t.views) {
    if (views.length >= 30) break;
    views.push({ id: `v${Math.random().toString(36).slice(2, 10)}`, name: v.name, layers: v.layers.map((i) => ids[i]) });
  }
  return { doc: withLayers({ ...doc, views }, layers.slice(0, 50)), first: ids[1] ?? null };
}

// ------------------------------------------------------------------ comparing views

export type DiffStatus = "same" | "added" | "removed" | "changed";

/**
 * What a side of a comparison shows: a saved view (`v:<id>`) or a layer over the base
 * (`l:<id>`; the base alone for the base layer).
 */
export function compareSideLayers(doc: Pick<Doc, "layers" | "views">, side: string): Set<string> | null {
  if (side.startsWith("v:")) {
    const v = doc.views?.find((x) => x.id === side.slice(2));
    return v ? new Set(v.layers) : null;
  }
  if (side.startsWith("l:")) {
    const id = side.slice(2);
    return layersOf(doc).some((l) => l.id === id) ? new Set([BASE_LAYER_ID, id]) : null;
  }
  return null;
}

/** Everything a comparison can pick from: the saved views, then each layer over the base. */
export function compareOptions(doc: Pick<Doc, "layers" | "views">): { id: string; name: string }[] {
  return [
    ...(doc.views ?? []).map((v) => ({ id: `v:${v.id}`, name: v.name })),
    ...layersOf(doc).map((l) => ({ id: `l:${l.id}`, name: l.id === BASE_LAYER_ID ? `Só ${l.name}` : `${layersOf(doc)[0].name} + ${l.name}` })),
  ];
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

/**
 * Compares two sides (see `compareSideLayers`). Elements on layers both sides show are "same",
 * only in B "added", only in A "removed". A removed and an added element with the same title
 * are the same thing redrawn: both are "changed".
 */
export function compareViews(
  doc: Doc,
  a: string,
  b: string,
): {
  visibility: Record<string, boolean>;
  nodes: Map<string, DiffStatus>;
  edges: Map<string, DiffStatus>;
  counts: Record<Exclude<DiffStatus, "same">, number>;
} | null {
  const la = compareSideLayers(doc, a);
  const lb = compareSideLayers(doc, b);
  if (!la || !lb) return null;
  const status = (layer: string): DiffStatus | null => {
    const inA = la.has(layer);
    const inB = lb.has(layer);
    if (inA && inB) return "same";
    if (inB) return "added";
    if (inA) return "removed";
    return null;
  };
  const nodes = new Map<string, DiffStatus>();
  for (const n of doc.nodes) {
    const s = status(layerIdOf(n));
    if (s) nodes.set(n.id, s);
  }
  // Same title on both sides of the change: it was redrawn, not added or removed.
  const titled = (s: DiffStatus) => {
    const out = new Map<string, string[]>();
    for (const n of doc.nodes) {
      if (nodes.get(n.id) !== s || n.kind === "ink" || !n.data.title.trim()) continue;
      const k = norm(n.data.title);
      out.set(k, [...(out.get(k) ?? []), n.id]);
    }
    return out;
  };
  const removed = titled("removed");
  for (const [k, ids] of titled("added")) {
    const other = removed.get(k);
    if (!other) continue;
    for (const id of [...ids, ...other]) nodes.set(id, "changed");
  }
  const edges = new Map<string, DiffStatus>();
  for (const e of doc.edges) {
    const s = status(layerIdOf(e));
    if (!s || !nodes.has(e.source) || !nodes.has(e.target)) continue;
    edges.set(e.id, s);
  }
  const counts = { added: 0, removed: 0, changed: 0 };
  // Counted like the layers panel: top-level elements and connections.
  for (const n of doc.nodes) {
    const s = nodes.get(n.id);
    if (s && s !== "same" && !n.parentId) counts[s]++;
  }
  for (const s of edges.values()) if (s === "added" || s === "removed") counts[s]++;
  const visibility = Object.fromEntries(layersOf(doc).map((l) => [l.id, la.has(l.id) || lb.has(l.id)]));
  return { visibility, nodes, edges, counts };
}
