/**
 * Pure structural operations on a PlanDocument (group, align, paste…).
 * The editor converts React Flow state → document, applies one of these and
 * converts back, so every operation is testable without a DOM.
 */
import { sortParentsFirst, type PlanDocument, type PlanEdge, type PlanNode, type NodeData } from "@/domain/plan";
import { COLLAPSED_HEIGHT } from "@/domain/canvas-adapter";
import { syncNodeLayers } from "@/domain/layers";
import { newId } from "@/lib/utils";
import { createNode, PARENT_KINDS } from "./defaults";

type Doc = Pick<PlanDocument, "nodes" | "edges"> & Partial<Pick<PlanDocument, "schemaVersion" | "viewport">>;
export type Rect = { x: number; y: number; width: number; height: number };
type ById = Map<string, PlanNode>;

const byIdOf = (doc: Doc): ById => new Map(doc.nodes.map((n) => [n.id, n]));

function withoutParent(n: PlanNode): PlanNode {
  const { parentId: _p, ...rest } = n;
  return rest;
}

function setParent(n: PlanNode, parentId: string | undefined, x: number, y: number): PlanNode {
  const base = withoutParent(n);
  return parentId ? { ...base, parentId, x, y } : { ...base, x, y };
}

export function absPos(doc: Doc, id: string, byId: ById = byIdOf(doc)): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    x += cur.x;
    y += cur.y;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return { x, y };
}

export function visibleHeight(n: PlanNode) {
  return n.data.collapsed && PARENT_KINDS.has(n.kind) ? COLLAPSED_HEIGHT : n.height;
}

export function absRect(doc: Doc, id: string, byId: ById = byIdOf(doc)): Rect {
  const n = byId.get(id);
  if (!n) return { x: 0, y: 0, width: 0, height: 0 };
  const p = absPos(doc, id, byId);
  return { x: p.x, y: p.y, width: n.width, height: visibleHeight(n) };
}

export function childrenMap(doc: Doc) {
  const m = new Map<string, string[]>();
  for (const n of doc.nodes) {
    if (!n.parentId) continue;
    const list = m.get(n.parentId) ?? [];
    list.push(n.id);
    m.set(n.parentId, list);
  }
  return m;
}

export function descendants(doc: Doc, id: string, kids = childrenMap(doc)): Set<string> {
  const out = new Set<string>();
  const stack = [...(kids.get(id) ?? [])];
  while (stack.length) {
    const c = stack.pop()!;
    if (out.has(c)) continue;
    out.add(c);
    stack.push(...(kids.get(c) ?? []));
  }
  return out;
}

/** Selected ids whose ancestors are not also selected (order follows the document). */
export function selectionRoots(doc: Doc, ids: Iterable<string>): string[] {
  const sel = new Set(ids);
  const byId = byIdOf(doc);
  const isCovered = (n: PlanNode) => {
    let p = n.parentId ? byId.get(n.parentId) : undefined;
    const seen = new Set<string>();
    while (p && !seen.has(p.id)) {
      if (sel.has(p.id)) return true;
      seen.add(p.id);
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return false;
  };
  return doc.nodes.filter((n) => sel.has(n.id) && !isCovered(n)).map((n) => n.id);
}

function finish<T extends Doc>(doc: T, nodes: PlanNode[], edges: PlanEdge[] = doc.edges): T {
  // Nodes follow the layer of the area they are in.
  return { ...doc, nodes: syncNodeLayers(sortParentsFirst(nodes)), edges };
}

// ------------------------------------------------------------------ add / remove

export function addNodes<T extends Doc>(doc: T, nodes: PlanNode[]): T {
  return finish(doc, [...doc.nodes, ...nodes]);
}

export function removeNodes<T extends Doc>(doc: T, ids: Iterable<string>): T {
  const kids = childrenMap(doc);
  const kill = new Set<string>();
  for (const id of ids) {
    kill.add(id);
    for (const d of descendants(doc, id, kids)) kill.add(d);
  }
  return finish(
    doc,
    doc.nodes.filter((n) => !kill.has(n.id)),
    doc.edges.filter((e) => !kill.has(e.source) && !kill.has(e.target)),
  );
}

export function removeEdges<T extends Doc>(doc: T, ids: Iterable<string>): T {
  const kill = new Set(ids);
  return { ...doc, edges: doc.edges.filter((e) => !kill.has(e.id)) };
}

export function updateNodeData<T extends Doc>(doc: T, id: string, patch: Partial<NodeData>): T {
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) };
}

export function updateEdge<T extends Doc>(doc: T, id: string, patch: Partial<Omit<PlanEdge, "id">>): T {
  return { ...doc, edges: doc.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

export function swapEdge<T extends Doc>(doc: T, id: string): T {
  return {
    ...doc,
    edges: doc.edges.map((e) =>
      e.id === id ? { ...e, source: e.target, target: e.source, sourceHandle: e.targetHandle ?? null, targetHandle: e.sourceHandle ?? null } : e,
    ),
  };
}

export function setCollapsed<T extends Doc>(doc: T, id: string, collapsed: boolean): T {
  return updateNodeData(doc, id, { collapsed });
}

// ------------------------------------------------------------------ clipboard

/**
 * A self-contained subgraph. Root nodes keep their parentId only when it is
 * meaningful in the source document (`relative`), otherwise they carry
 * absolute coordinates and no parent.
 */
export type Clip = { nodes: PlanNode[]; edges: PlanEdge[] };

export function copySubgraph(doc: Doc, ids: Iterable<string>, opts: { relative?: boolean } = {}): Clip | null {
  const roots = selectionRoots(doc, ids);
  if (!roots.length) return null;
  const kids = childrenMap(doc);
  const byId = byIdOf(doc);
  const include = new Set(roots);
  for (const r of roots) for (const d of descendants(doc, r, kids)) include.add(d);
  const rootSet = new Set(roots);
  const nodes = doc.nodes
    .filter((n) => include.has(n.id))
    .map((n) => {
      if (!rootSet.has(n.id) || opts.relative) return structuredClone(n);
      const p = absPos(doc, n.id, byId);
      return structuredClone(setParent(n, undefined, p.x, p.y));
    });
  const edges = doc.edges.filter((e) => include.has(e.source) && include.has(e.target)).map((e) => ({ ...e }));
  return { nodes, edges };
}

/**
 * Inserts a clip with fresh ids. Either shifts it by `offset` or places its
 * top-left corner at `at` (absolute). Returns the ids of the pasted roots.
 */
export function pasteClip<T extends Doc>(doc: T, clip: Clip, opts: { offset?: { x: number; y: number }; at?: { x: number; y: number } } = {}): { doc: T; ids: string[] } {
  const map = new Map(clip.nodes.map((n) => [n.id, newId()]));
  const existing = new Set(doc.nodes.map((n) => n.id));
  const isRoot = (n: PlanNode) => !n.parentId || !map.has(n.parentId);
  const roots = clip.nodes.filter(isRoot);
  if (!roots.length) return { doc, ids: [] };
  let dx = opts.offset?.x ?? 0;
  let dy = opts.offset?.y ?? 0;
  if (opts.at) {
    const absOf = (r: PlanNode) => {
      const base = r.parentId && existing.has(r.parentId) ? absPos(doc, r.parentId) : { x: 0, y: 0 };
      return { x: base.x + r.x, y: base.y + r.y };
    };
    const abs = roots.map(absOf);
    // roots are lifted to the top level below, so shift relative to their absolute corner
    dx = opts.at.x - Math.min(...abs.map((p) => p.x));
    dy = opts.at.y - Math.min(...abs.map((p) => p.y));
  }
  const nodes = clip.nodes.map((n) => {
    const id = map.get(n.id)!;
    if (!isRoot(n)) return { ...structuredClone(n), id, parentId: map.get(n.parentId!)! };
    // keep a still-existing parent only when shifting by an offset (duplicate in place)
    const keepParent = !opts.at && n.parentId && existing.has(n.parentId) ? n.parentId : undefined;
    let x = n.x + dx;
    let y = n.y + dy;
    if (!keepParent && n.parentId && existing.has(n.parentId)) {
      const p = absPos(doc, n.parentId);
      x += p.x;
      y += p.y;
    }
    return setParent({ ...structuredClone(n), id }, keepParent, x, y);
  });
  // A pasted library copy is a new copy of the same item (its own instance id).
  const instances = new Map<string, string>();
  for (const n of nodes) {
    const r = n.data.libraryRef;
    if (!r) continue;
    if (!instances.has(r.instance)) instances.set(r.instance, newId());
    n.data = { ...n.data, libraryRef: { ...r, instance: instances.get(r.instance)! } };
  }
  const edges = clip.edges.filter((e) => map.has(e.source) && map.has(e.target)).map((e) => ({ ...e, id: newId(), source: map.get(e.source)!, target: map.get(e.target)! }));
  return { doc: finish(doc, [...doc.nodes, ...nodes], [...doc.edges, ...edges]), ids: roots.map((r) => map.get(r.id)!) };
}

export function duplicateNodes<T extends Doc>(doc: T, ids: Iterable<string>, offset = { x: 24, y: 24 }) {
  const clip = copySubgraph(doc, ids, { relative: true });
  if (!clip) return { doc, ids: [] as string[] };
  return pasteClip(doc, clip, { offset });
}

// ------------------------------------------------------------------ hierarchy

/** Moves a node under `parentId` (or to the top level) keeping its absolute position. */
export function reparent<T extends Doc>(doc: T, id: string, parentId: string | undefined): T {
  const byId = byIdOf(doc);
  const node = byId.get(id);
  if (!node) return doc;
  if ((node.parentId ?? undefined) === parentId) return doc;
  if (parentId) {
    const parent = byId.get(parentId);
    if (!parent || parentId === id || descendants(doc, id).has(parentId)) return doc;
  }
  const abs = absPos(doc, id, byId);
  const base = parentId ? absPos(doc, parentId, byId) : { x: 0, y: 0 };
  const next = setParent(node, parentId, abs.x - base.x, abs.y - base.y);
  return finish(
    doc,
    doc.nodes.map((n) => (n.id === id ? next : n)),
  );
}

/**
 * Deepest (smallest) container/section whose area contains the node's center. Drawings stay
 * free; `canHold` rules out areas on hidden or locked layers.
 */
export function findDropTarget(doc: Doc, id: string, canHold?: (n: PlanNode) => boolean): string | undefined {
  const byId = byIdOf(doc);
  const node = byId.get(id);
  if (!node || node.kind === "ink") return undefined;
  const r = absRect(doc, id, byId);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const banned = descendants(doc, id);
  banned.add(id);
  let best: { id: string; area: number } | undefined;
  for (const n of doc.nodes) {
    if (banned.has(n.id) || !PARENT_KINDS.has(n.kind) || n.data.collapsed || (canHold && !canHold(n))) continue;
    const pr = absRect(doc, n.id, byId);
    if (cx < pr.x || cx > pr.x + pr.width || cy < pr.y || cy > pr.y + pr.height) continue;
    const area = pr.width * pr.height;
    if (!best || area < best.area) best = { id: n.id, area };
  }
  return best?.id;
}

const GROUP_PAD = 24;
const GROUP_HEADER = 36;

/** Wraps the selection in a new container; children become relative to it. */
export function groupNodes<T extends Doc>(doc: T, ids: Iterable<string>, title = "Grupo"): { doc: T; id: string } | null {
  const byId = byIdOf(doc);
  const roots = selectionRoots(doc, ids).filter((id) => byId.has(id));
  if (!roots.length) return null;
  const parents = new Set(roots.map((r) => byId.get(r)!.parentId ?? ""));
  const common = parents.size === 1 ? [...parents][0] || undefined : undefined;
  const rects = roots.map((r) => absRect(doc, r, byId));
  const minX = Math.min(...rects.map((r) => r.x)) - GROUP_PAD;
  const minY = Math.min(...rects.map((r) => r.y)) - GROUP_PAD - GROUP_HEADER;
  const maxX = Math.max(...rects.map((r) => r.x + r.width)) + GROUP_PAD;
  const maxY = Math.max(...rects.map((r) => r.y + r.height)) + GROUP_PAD;
  const base = common ? absPos(doc, common, byId) : { x: 0, y: 0 };
  const group = createNode("container", { x: minX - base.x, y: minY - base.y }, { title });
  group.x = Math.round(minX - base.x);
  group.y = Math.round(minY - base.y);
  group.width = Math.round(maxX - minX);
  group.height = Math.round(maxY - minY);
  if (common) group.parentId = common;
  // The new area lives on the layer of the first grouped element.
  const firstLayer = byId.get(roots[0])!.layer;
  if (firstLayer) group.layer = firstLayer;
  const rootSet = new Set(roots);
  const nodes = doc.nodes.map((n) => {
    if (!rootSet.has(n.id)) return n;
    const a = absPos(doc, n.id, byId);
    return setParent(n, group.id, a.x - minX, a.y - minY);
  });
  // the group goes where its first child was, so stacking stays intuitive
  const firstIdx = nodes.findIndex((n) => rootSet.has(n.id));
  nodes.splice(firstIdx, 0, group);
  return { doc: finish(doc, nodes), id: group.id };
}

/** Removes the given containers/sections, lifting their children one level up. */
export function ungroupNodes<T extends Doc>(doc: T, ids: Iterable<string>): { doc: T; ids: string[] } {
  const byId = byIdOf(doc);
  const groups = [...ids].filter((id) => {
    const n = byId.get(id);
    return n && PARENT_KINDS.has(n.kind);
  });
  if (!groups.length) return { doc, ids: [] };
  const gset = new Set(groups);
  const lifted: string[] = [];
  let nodes = doc.nodes.filter((n) => !gset.has(n.id));
  nodes = nodes.map((n) => {
    if (!n.parentId || !gset.has(n.parentId)) return n;
    // climb past every removed ancestor
    let x = n.x;
    let y = n.y;
    let p = byId.get(n.parentId);
    while (p && gset.has(p.id)) {
      x += p.x;
      y += p.y;
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    lifted.push(n.id);
    return setParent({ ...n, data: { ...n.data } }, p?.id, x, y);
  });
  const edges = doc.edges.filter((e) => !gset.has(e.source) && !gset.has(e.target));
  return { doc: finish(doc, nodes, edges), ids: lifted };
}

// ------------------------------------------------------------------ layout

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

function moveToAbs<T extends Doc>(doc: T, targets: Map<string, { x: number; y: number }>): T {
  const byId = byIdOf(doc);
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      const t = targets.get(n.id);
      if (!t) return n;
      const base = n.parentId ? absPos(doc, n.parentId, byId) : { x: 0, y: 0 };
      return { ...n, x: Math.round(t.x - base.x), y: Math.round(t.y - base.y) };
    }),
  };
}

export function alignNodes<T extends Doc>(doc: T, ids: Iterable<string>, mode: AlignMode): T {
  const byId = byIdOf(doc);
  const roots = selectionRoots(doc, ids);
  if (roots.length < 2) return doc;
  const rects = roots.map((id) => ({ id, r: absRect(doc, id, byId) }));
  const minX = Math.min(...rects.map(({ r }) => r.x));
  const maxX = Math.max(...rects.map(({ r }) => r.x + r.width));
  const minY = Math.min(...rects.map(({ r }) => r.y));
  const maxY = Math.max(...rects.map(({ r }) => r.y + r.height));
  const targets = new Map<string, { x: number; y: number }>();
  for (const { id, r } of rects) {
    let { x, y } = r;
    if (mode === "left") x = minX;
    if (mode === "right") x = maxX - r.width;
    if (mode === "center") x = (minX + maxX) / 2 - r.width / 2;
    if (mode === "top") y = minY;
    if (mode === "bottom") y = maxY - r.height;
    if (mode === "middle") y = (minY + maxY) / 2 - r.height / 2;
    targets.set(id, { x, y });
  }
  return moveToAbs(doc, targets);
}

/** Equal gaps between the selected nodes along an axis (needs 3+). */
export function distributeNodes<T extends Doc>(doc: T, ids: Iterable<string>, axis: "horizontal" | "vertical"): T {
  const byId = byIdOf(doc);
  const roots = selectionRoots(doc, ids);
  if (roots.length < 3) return doc;
  const h = axis === "horizontal";
  const items = roots.map((id) => ({ id, r: absRect(doc, id, byId) })).sort((a, b) => (h ? a.r.x - b.r.x : a.r.y - b.r.y));
  const first = items[0].r;
  const last = items[items.length - 1].r;
  const span = h ? last.x + last.width - first.x : last.y + last.height - first.y;
  const total = items.reduce((s, { r }) => s + (h ? r.width : r.height), 0);
  const gap = (span - total) / (items.length - 1);
  let cursor = h ? first.x : first.y;
  const targets = new Map<string, { x: number; y: number }>();
  for (const { id, r } of items) {
    targets.set(id, h ? { x: cursor, y: r.y } : { x: r.x, y: cursor });
    cursor += (h ? r.width : r.height) + gap;
  }
  return moveToAbs(doc, targets);
}

export function bringToFront<T extends Doc>(doc: T, ids: Iterable<string>): T {
  return restack(doc, ids, "front");
}

export function sendToBack<T extends Doc>(doc: T, ids: Iterable<string>): T {
  return restack(doc, ids, "back");
}

function restack<T extends Doc>(doc: T, ids: Iterable<string>, dir: "front" | "back"): T {
  const sel = new Set(selectionRoots(doc, ids));
  if (!sel.size) return doc;
  const z = new Map<string, number>();
  const groups = new Map<string, PlanNode[]>();
  for (const n of doc.nodes) {
    const k = n.parentId ?? "";
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  for (const siblings of groups.values()) {
    const moving = siblings.filter((n) => sel.has(n.id));
    if (!moving.length) continue;
    const others = siblings.filter((n) => !sel.has(n.id)).map((n) => n.z ?? 0);
    if (dir === "front") {
      const top = others.length ? Math.max(...others) : 0;
      moving.forEach((n, i) => z.set(n.id, top + 1 + i));
    } else {
      const bottom = others.length ? Math.min(...others) : 0;
      moving.forEach((n, i) => z.set(n.id, bottom - moving.length + i));
    }
  }
  const nodes = doc.nodes.map((n) => (z.has(n.id) ? { ...n, z: z.get(n.id)! } : n));
  // array order also matters for nodes with equal z
  const order = (n: PlanNode) => (sel.has(n.id) ? (dir === "front" ? 1 : -1) : 0);
  const sorted = nodes.map((n, i) => ({ n, i })).sort((a, b) => order(a.n) - order(b.n) || a.i - b.i).map((x) => x.n);
  return finish(doc, sorted);
}

/** Bounding box (absolute) of the given nodes. */
export function boundsOf(doc: Doc, ids: Iterable<string>): Rect | null {
  const byId = byIdOf(doc);
  const rects = [...ids].filter((id) => byId.has(id)).map((id) => absRect(doc, id, byId));
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) - x, height: Math.max(...rects.map((r) => r.y + r.height)) - y };
}

// ------------------------------------------------------------------ colors

/** Every color the drawing uses (shapes, element colors, strokes, drawn connections), most used first. */
export function colorsInUse(doc: Doc): string[] {
  const count = new Map<string, number>();
  const add = (c: unknown) => {
    if (typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c)) return;
    const k = c.toUpperCase();
    count.set(k, (count.get(k) ?? 0) + 1);
  };
  for (const n of doc.nodes) {
    add(n.data.color);
    add(n.data.shape?.stroke);
    add(n.data.shape?.fill);
  }
  for (const e of doc.edges) add(e.style?.stroke);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

/** Swaps one color for another everywhere in the drawing (a plan-wide recolor). */
export function replaceColor<T extends Doc>(doc: T, from: string, to: string): T {
  const f = from.toUpperCase();
  const swap = <V extends string | undefined>(c: V): V | string => (typeof c === "string" && c.toUpperCase() === f ? to : c);
  let changed = false;
  const nodes = doc.nodes.map((n) => {
    const data = { ...n.data };
    let touched = false;
    if (data.color && swap(data.color) !== data.color) ((data.color = to), (touched = true));
    if (data.shape && (swap(data.shape.stroke) !== data.shape.stroke || swap(data.shape.fill) !== data.shape.fill)) {
      data.shape = { ...data.shape, stroke: swap(data.shape.stroke) as string | undefined, fill: swap(data.shape.fill) as string | undefined };
      if (data.shape.stroke === undefined) delete data.shape.stroke;
      if (data.shape.fill === undefined) delete data.shape.fill;
      touched = true;
    }
    if (!touched) return n;
    changed = true;
    return { ...n, data };
  });
  const edges = doc.edges.map((e) => {
    if (!e.style?.stroke || swap(e.style.stroke) === e.style.stroke) return e;
    changed = true;
    return { ...e, style: { ...e.style, stroke: to } };
  });
  return changed ? { ...doc, nodes, edges } : doc;
}
