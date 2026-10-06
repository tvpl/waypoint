/**
 * Automatic layout ("Organizar automaticamente") on the domain document.
 *
 * Pure: takes a PlanDocument and returns a new one, never touching React
 * Flow. Siblings are laid out independently per level — the top level and
 * the children of every container/section — and parents are resized to fit
 * their laid-out children. Connected siblings go through dagre (ranks follow
 * edge direction); unconnected siblings (notes, loose blocks…) are placed in
 * a tidy wrapped row/column after the graph.
 */
import dagre from "@dagrejs/dagre";
import type { PlanDocument, PlanEdge, PlanNode } from "@/domain/plan";
import { absRect, childrenMap, selectionRoots, visibleHeight, type Rect } from "./doc-ops";
import { PARENT_KINDS } from "./defaults";

export type LayoutDirection = "TB" | "LR";

export type AutoLayoutOptions = {
  direction: LayoutDirection;
  /** Lay out only these nodes (and the inside of selected containers). Omit for the whole plan. */
  selection?: Iterable<string>;
};

type Doc = Pick<PlanDocument, "nodes" | "edges"> & Partial<Pick<PlanDocument, "schemaVersion" | "viewport">>;

/** Gap between siblings on the same rank. */
export const LAYOUT_GAP = 48;
/** Gap between ranks (along the flow direction). */
export const LAYOUT_RANK_GAP = 96;
/** Inner padding of containers/sections around their children. */
export const LAYOUT_PAD = 32;
/** Header band of containers/sections (title row). */
export const LAYOUT_HEADER = 44;
/** Extra header room when a section shows its description under the title. */
const SECTION_DESC = 28;
/** Minimum parent size (matches the canvas resizer minimums). */
const PARENT_MIN: Record<string, [number, number]> = { container: [160, 88], section: [160, 100] };
/** Loose items wrap after this extent when there is no graph to align with. */
const LOOSE_WRAP = 1200;

type Item = { id: string; w: number; h: number; x0: number; y0: number };
type Pos = { x: number; y: number };

/** Offset of children inside a parent (left padding, top = header + padding). */
export function parentInsets(n: Pick<PlanNode, "kind" | "data">): { left: number; top: number; right: number; bottom: number } {
  const desc = n.kind === "section" && !!n.data.description?.trim();
  return { left: LAYOUT_PAD, top: LAYOUT_HEADER + (desc ? SECTION_DESC : 0) + LAYOUT_PAD / 2, right: LAYOUT_PAD, bottom: LAYOUT_PAD };
}

/** Reading order: rows by y, then x (with a tolerance so slightly misaligned rows read left→right). */
function readingOrder(a: { x0: number; y0: number; h: number }, b: { x0: number; y0: number; h: number }) {
  const tol = Math.min(a.h, b.h) / 2;
  if (Math.abs(a.y0 - b.y0) > tol) return a.y0 - b.y0;
  return a.x0 - b.x0;
}

/**
 * Lays out one set of siblings. Returns top-left positions relative to the
 * set's own origin (0,0 = top-left of the resulting bounding box).
 */
export function layoutSiblings(items: Item[], links: [string, string][], dir: LayoutDirection): { pos: Map<string, Pos>; width: number; height: number } {
  const pos = new Map<string, Pos>();
  if (!items.length) return { pos, width: 0, height: 0 };
  const ids = new Set(items.map((i) => i.id));
  const seen = new Set<string>();
  const edges: [string, string][] = [];
  for (const [a, b] of links) {
    if (a === b || !ids.has(a) || !ids.has(b)) continue;
    const k = `${a}\u0000${b}`;
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push([a, b]);
  }
  const degree = new Map<string, number>();
  for (const [a, b] of edges) {
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  const sorted = [...items].sort(readingOrder);
  const connected = sorted.filter((i) => degree.has(i.id));
  const loose = sorted.filter((i) => !degree.has(i.id));

  // ---- graph part (dagre)
  let gw = 0;
  let gh = 0;
  if (connected.length) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: dir, nodesep: LAYOUT_GAP, ranksep: LAYOUT_RANK_GAP, edgesep: 24, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const i of connected) g.setNode(i.id, { width: i.w, height: i.h });
    for (const [a, b] of edges) g.setEdge(a, b);
    dagre.layout(g);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const raw = new Map<string, Pos>();
    for (const i of connected) {
      const n = g.node(i.id) as { x: number; y: number };
      const p = { x: n.x - i.w / 2, y: n.y - i.h / 2 };
      raw.set(i.id, p);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + i.w);
      maxY = Math.max(maxY, p.y + i.h);
    }
    for (const [id, p] of raw) pos.set(id, { x: Math.round(p.x - minX), y: Math.round(p.y - minY) });
    gw = Math.round(maxX - minX);
    gh = Math.round(maxY - minY);
  }

  if (!loose.length) return { pos, width: gw, height: gh };

  // ---- loose part: wrapped rows (TB) or columns (LR)
  // Unconnected siblings behave like one more rank: side by side across the
  // flow (a row in a vertical flow, a column in a horizontal one). With a
  // graph they go after it (below / to the right) and wrap at its extent.
  const hasGraph = connected.length > 0;
  const rows = dir === "TB";
  const limit = hasGraph ? Math.max(rows ? gw : gh, LOOSE_WRAP / 2) : looseLimit(loose, rows);
  const origin = hasGraph ? (dir === "TB" ? { x: 0, y: gh + LAYOUT_RANK_GAP } : { x: gw + LAYOUT_RANK_GAP, y: 0 }) : { x: 0, y: 0 };
  let main = 0; // position along the line
  let cross = 0; // offset of the current line
  let lineSize = 0; // thickness of the current line
  let maxMain = 0;
  for (const i of loose) {
    const len = rows ? i.w : i.h;
    const thick = rows ? i.h : i.w;
    if (main > 0 && main + len > limit) {
      cross += lineSize + LAYOUT_GAP;
      main = 0;
      lineSize = 0;
    }
    pos.set(i.id, rows ? { x: origin.x + main, y: origin.y + cross } : { x: origin.x + cross, y: origin.y + main });
    main += len + LAYOUT_GAP;
    maxMain = Math.max(maxMain, main - LAYOUT_GAP);
    lineSize = Math.max(lineSize, thick);
  }
  const looseMain = maxMain;
  const looseCross = cross + lineSize;
  const width = rows ? Math.max(gw, origin.x + looseMain) : Math.max(gw, origin.x + looseCross);
  const height = rows ? Math.max(gh, origin.y + looseCross) : Math.max(gh, origin.y + looseMain);
  return { pos, width, height };
}

/** Wrap extent for a graph-less set: one line up to 6 items, then a roughly square grid. */
function looseLimit(items: Item[], rows: boolean) {
  const lens = items.map((i) => (rows ? i.w : i.h));
  if (items.length <= 6) return lens.reduce((s, l) => s + l + LAYOUT_GAP, 0);
  const perLine = Math.ceil(Math.sqrt(items.length));
  const avg = lens.reduce((s, l) => s + l, 0) / lens.length;
  return Math.max(perLine * (avg + LAYOUT_GAP) - LAYOUT_GAP, Math.max(...lens));
}

/**
 * Picks facing handle sides for an edge given absolute rects, preferring the
 * layout direction: in a vertical flow a target fully below the source
 * connects bottom→top, in a horizontal one right→left.
 */
export function directionalHandles(a: Rect, b: Rect, dir: LayoutDirection): { sourceHandle: string; targetHandle: string } {
  if (dir === "TB") {
    if (b.y >= a.y + a.height - 1) return { sourceHandle: "b", targetHandle: "t" };
    if (b.y + b.height <= a.y + 1) return { sourceHandle: "t", targetHandle: "b" };
  } else {
    if (b.x >= a.x + a.width - 1) return { sourceHandle: "r", targetHandle: "l" };
    if (b.x + b.width <= a.x + 1) return { sourceHandle: "l", targetHandle: "r" };
  }
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? { sourceHandle: "r", targetHandle: "l" } : { sourceHandle: "l", targetHandle: "r" };
  return dy >= 0 ? { sourceHandle: "b", targetHandle: "t" } : { sourceHandle: "t", targetHandle: "b" };
}

/**
 * Lays out the whole plan (or only `selection`) and returns a new document.
 * The bounding-box origin of each laid-out set is kept, so the result stays
 * where the user was looking.
 */
export function autoLayout<T extends Doc>(doc: T, opts: AutoLayoutOptions): T {
  const dir = opts.direction;
  const nodes = new Map(doc.nodes.map((n) => [n.id, { ...n }]));
  const kids = childrenMap(doc);
  const orig = new Map(doc.nodes.map((n) => [n.id, n]));

  const isOpenParent = (n: PlanNode) => PARENT_KINDS.has(n.kind) && !n.data.collapsed && (kids.get(n.id)?.length ?? 0) > 0;

  /** Sibling of `parent` that contains `id` (itself or an ancestor), if any. */
  const repIn = (id: string, parent: string | undefined): string | undefined => {
    let cur = nodes.get(id);
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      if ((cur.parentId ?? undefined) === parent) return cur.id;
      cur = cur.parentId ? nodes.get(cur.parentId) : undefined;
    }
    return undefined;
  };

  const linksFor = (parent: string | undefined, members: Set<string>): [string, string][] => {
    const out: [string, string][] = [];
    for (const e of doc.edges) {
      const a = repIn(e.source, parent);
      const b = repIn(e.target, parent);
      if (a && b && a !== b && members.has(a) && members.has(b)) out.push([a, b]);
    }
    return out;
  };

  /** Lays out a sibling set in place, keeping the bbox origin (or putting it at `at`). */
  const arrange = (all: string[], parent: string | undefined, at?: Pos) => {
    // Drawings are annotations: they stay where they were drawn.
    const ids = all.filter((id) => nodes.get(id)?.kind !== "ink");
    if (!ids.length) return { width: 0, height: 0 };
    const items: Item[] = ids.map((id) => {
      const n = nodes.get(id)!;
      return { id, w: n.width, h: visibleHeight(n), x0: n.x, y0: n.y };
    });
    const origin = at ?? { x: Math.min(...items.map((i) => i.x0)), y: Math.min(...items.map((i) => i.y0)) };
    const r = layoutSiblings(items, linksFor(parent, new Set(ids)), dir);
    for (const [id, p] of r.pos) {
      const n = nodes.get(id)!;
      n.x = Math.round(origin.x + p.x);
      n.y = Math.round(origin.y + p.y);
    }
    return r;
  };

  /** Recursively lays out the inside of a parent and resizes it to fit. */
  const arrangeInside = (id: string) => {
    const p = nodes.get(id);
    if (!p || !isOpenParent(p)) return;
    const children = kids.get(id) ?? [];
    for (const c of children) arrangeInside(c);
    const ins = parentInsets(p);
    const r = arrange(children, id, { x: ins.left, y: ins.top });
    const [mw, mh] = PARENT_MIN[p.kind] ?? [160, 88];
    p.width = Math.max(mw, Math.round(r.width + ins.left + ins.right));
    p.height = Math.max(mh, Math.round(r.height + ins.top + ins.bottom));
  };

  /** Grows ancestors (never shrinks) so a re-arranged subset still fits. */
  const growToFit = (parentId: string | undefined) => {
    let pid = parentId;
    const guard = new Set<string>();
    while (pid && !guard.has(pid)) {
      guard.add(pid);
      const p = nodes.get(pid);
      if (!p) return;
      const ins = parentInsets(p);
      for (const c of kids.get(pid) ?? []) {
        const n = nodes.get(c)!;
        // children pushed above/left of the content box shift everything back in
        if (n.x < ins.left || n.y < ins.top) {
          const dx = Math.max(0, ins.left - n.x);
          const dy = Math.max(0, ins.top - n.y);
          for (const s of kids.get(pid) ?? []) {
            const sn = nodes.get(s)!;
            sn.x += dx;
            sn.y += dy;
          }
        }
      }
      for (const c of kids.get(pid) ?? []) {
        const n = nodes.get(c)!;
        p.width = Math.max(p.width, Math.round(n.x + n.width + ins.right));
        p.height = Math.max(p.height, Math.round(n.y + visibleHeight(n) + ins.bottom));
      }
      pid = p.parentId;
    }
  };

  let scopeRoots: string[];
  if (opts.selection) {
    scopeRoots = selectionRoots(doc, opts.selection);
    if (!scopeRoots.length) return doc;
    const groups = new Map<string, string[]>();
    for (const id of scopeRoots) {
      const k = nodes.get(id)?.parentId ?? "";
      groups.set(k, [...(groups.get(k) ?? []), id]);
    }
    for (const id of scopeRoots) arrangeInside(id);
    for (const [k, ids] of groups) {
      // a single selected node only gets its inside arranged
      if (ids.length > 1) arrange(ids, k || undefined);
      growToFit(k || undefined);
    }
  } else {
    const top = doc.nodes.filter((n) => !n.parentId).map((n) => n.id);
    scopeRoots = top;
    for (const id of top) arrangeInside(id);
    arrange(top, undefined);
  }

  const out = doc.nodes.map((n) => nodes.get(n.id)!);
  const next = { ...doc, nodes: out };

  // re-pick facing sides for edges whose endpoints moved or resized
  const before = new Map(doc.nodes.map((n) => [n.id, absRect(doc, n.id)]));
  const changed = new Set<string>();
  const byIdNext = new Map(out.map((n) => [n.id, n]));
  const after = new Map(out.map((n) => [n.id, absRect(next, n.id, byIdNext)]));
  for (const [id, r] of after) {
    const b = before.get(id)!;
    if (b.x !== r.x || b.y !== r.y || b.width !== r.width || b.height !== r.height) changed.add(id);
  }
  if (!changed.size && out.every((n) => n === orig.get(n.id))) return doc;
  const edges: PlanEdge[] = doc.edges.map((e) => {
    if (!changed.has(e.source) && !changed.has(e.target)) return e;
    const a = after.get(e.source);
    const b = after.get(e.target);
    if (!a || !b) return e;
    return { ...e, ...directionalHandles(a, b, dir) };
  });
  return { ...next, edges };
}
