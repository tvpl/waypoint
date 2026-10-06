/**
 * Elbow connections that go around what is in their way. The editor and the viewer work out, for
 * each elbow connection, which elements sit near it (`avoidanceBoxes`); the edge then draws React
 * Flow's usual step path when nothing is hit, or an orthogonal route found on a sparse grid
 * (`orthoRoute`) when something is.
 */

export type Box = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };
export type Side = "left" | "right" | "top" | "bottom";

const DIR: Record<Side, Pt> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

/** Room kept between a route and the elements it passes. */
export const ROUTE_PAD = 14;
/** How far a route leaves an element straight before it may turn. */
export const ROUTE_LEAD = 20;
const BEND_COST = 36;

const inflate = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, w: b.w + by * 2, h: b.h + by * 2 });

/** Whether a horizontal or vertical segment passes through the inside of a box. */
function segmentHits(a: Pt, b: Pt, box: Box): boolean {
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  const eps = 0.01;
  return x2 > box.x + eps && x1 < box.x + box.w - eps && y2 > box.y + eps && y1 < box.y + box.h - eps;
}

/** Whether a polyline crosses any of the boxes. */
export function polylineHits(points: Pt[], boxes: Box[]): boolean {
  for (let i = 1; i < points.length; i++) for (const b of boxes) if (segmentHits(points[i - 1], points[i], b)) return true;
  return false;
}

/** The plain elbow between two handles (what the route looks like with nothing in the way). */
export function plainElbow(s: Pt, sSide: Side, t: Pt, tSide: Side): Pt[] {
  return orthoRoute(s, sSide, t, tSide, [], []) ?? [s, t];
}

/**
 * Shortest orthogonal route from `s` (leaving through `sSide`) to `t` (entering through `tSide`)
 * that keeps out of `obstacles` (grown by ROUTE_PAD) and of the two end elements, with few bends.
 * Null when there is no way through (the caller then draws the plain path).
 */
export function orthoRoute(s: Pt, sSide: Side, t: Pt, tSide: Side, obstacles: Box[], ends: Box[]): Pt[] | null {
  const sd = DIR[sSide];
  const td = DIR[tSide];
  const s1 = { x: s.x + sd.x * ROUTE_LEAD, y: s.y + sd.y * ROUTE_LEAD };
  const t1 = { x: t.x + td.x * ROUTE_LEAD, y: t.y + td.y * ROUTE_LEAD };
  const walls = [...obstacles.map((b) => inflate(b, ROUTE_PAD)), ...ends.map((b) => inflate(b, ROUTE_LEAD - 6))];
  const inside = (p: Pt) => walls.some((w) => p.x > w.x + 0.01 && p.x < w.x + w.w - 0.01 && p.y > w.y + 0.01 && p.y < w.y + w.h - 0.01);
  if (inside(s1) || inside(t1)) return null;

  const xs = new Set([s1.x, t1.x, (s1.x + t1.x) / 2]);
  const ys = new Set([s1.y, t1.y, (s1.y + t1.y) / 2]);
  for (const w of walls) {
    xs.add(w.x);
    xs.add(w.x + w.w);
    ys.add(w.y);
    ys.add(w.y + w.h);
  }
  const X = [...xs].sort((a, b) => a - b);
  const Y = [...ys].sort((a, b) => a - b);
  const W = X.length;
  const H = Y.length;
  const id = (i: number, j: number) => j * W + i;
  const si = X.indexOf(s1.x);
  const sj = Y.indexOf(s1.y);
  const ti = X.indexOf(t1.x);
  const tj = Y.indexOf(t1.y);

  // Dijkstra over (point, heading). Headings: 0 left, 1 right, 2 up, 3 down.
  const STEPS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;
  const headingOf = (d: Pt) => (d.x < 0 ? 0 : d.x > 0 ? 1 : d.y < 0 ? 2 : 3);
  const startH = headingOf(sd);
  const endH = headingOf({ x: -td.x, y: -td.y });
  const N = W * H * 4;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const start = id(si, sj) * 4 + startH;
  dist[start] = 0;
  const heap = new MinHeap();
  heap.push(start, 0);
  while (heap.size) {
    const [cur, d] = heap.pop();
    if (d > dist[cur]) continue;
    const h = cur % 4;
    const p = (cur - h) / 4;
    const i = p % W;
    const j = (p - i) / W;
    if (i === ti && j === tj) continue;
    for (let nh = 0; nh < 4; nh++) {
      if ((h ^ 1) === nh && h >> 1 === nh >> 1) continue; // no U-turn on the spot
      const ni = i + STEPS[nh][0];
      const nj = j + STEPS[nh][1];
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const a = { x: X[i], y: Y[j] };
      const b = { x: X[ni], y: Y[nj] };
      if (walls.some((w) => segmentHits(a, b, w))) continue;
      const next = id(ni, nj) * 4 + nh;
      const nd = d + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (nh === h ? 0 : BEND_COST);
      if (nd < dist[next]) {
        dist[next] = nd;
        prev[next] = cur;
        heap.push(next, nd);
      }
    }
  }
  // The last leg must arrive heading into the target: arriving any other way costs a bend.
  let best = -1;
  let bestCost = Infinity;
  for (let h = 0; h < 4; h++) {
    const c = id(ti, tj) * 4 + h;
    const cost = dist[c] + (h === endH ? 0 : BEND_COST);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  if (best < 0 || bestCost === Infinity) return null;
  const pts: Pt[] = [];
  for (let c = best; c >= 0; c = prev[c]) {
    const p = (c - (c % 4)) / 4;
    pts.push({ x: X[p % W], y: Y[Math.floor(p / W)] });
  }
  pts.reverse();
  return simplify([s, ...pts, t]);
}

/** Drops repeated and collinear points. */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    const before = out[out.length - 2];
    if (before && last && ((Math.abs(before.x - last.x) < 0.01 && Math.abs(last.x - p.x) < 0.01) || (Math.abs(before.y - last.y) < 0.01 && Math.abs(last.y - p.y) < 0.01))) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** SVG path through the points with rounded corners, and the point halfway along it (for the label). */
export function roundedPath(pts: Pt[], radius = 10): { d: string; mid: Pt } {
  let d = `M${r1(pts[0].x)} ${r1(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const r = Math.min(radius, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const inX = b.x - Math.sign(b.x - a.x) * r;
    const inY = b.y - Math.sign(b.y - a.y) * r;
    const outX = b.x + Math.sign(c.x - b.x) * r;
    const outY = b.y + Math.sign(c.y - b.y) * r;
    d += ` L${r1(inX)} ${r1(inY)} Q${r1(b.x)} ${r1(b.y)} ${r1(outX)} ${r1(outY)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${r1(last.x)} ${r1(last.y)}`;
  return { d, mid: pointAlong(pts, 0.5) };
}

/** The point at `t` (0–1) of the polyline's length. */
export function pointAlong(pts: Pt[], t: number): Pt {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  let left = lens.reduce((a, b) => a + b, 0) * Math.min(1, Math.max(0, t));
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, left / lens[i]) : 0;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
    }
    left -= lens[i];
  }
  return pts[0];
}

/** Where along a polyline (0–1) the point nearest to `p` is. */
export function nearestAlong(pts: Pt[], p: Pt): number {
  let total = 0;
  let bestT = 0;
  let bestD = Infinity;
  const lens = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  const sum = lens.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < lens.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len2 = lens[i] ** 2 || 1;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2));
    const q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    const dd = Math.hypot(p.x - q.x, p.y - q.y);
    if (dd < bestD) {
      bestD = dd;
      bestT = (total + lens[i] * k) / sum;
    }
    total += lens[i];
  }
  return bestT;
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.ids[0], this.keys[0]];
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.ids.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}

// ------------------------------------------------------------------ which elements are in the way

type FlowLike = {
  id: string;
  type?: string;
  parentId?: string;
  hidden?: boolean;
  position: Pt;
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  className?: string;
};
type EdgeLike = { id: string; source: string; target: string; data?: { style?: { routing?: string } } };

/** Kinds a connection never needs to go around (areas it crosses on purpose, drawings, notes on top). */
const SOFT = new Set(["annotation", "ink", "frame", "section"]);

/** Absolute boxes of the nodes (children are stored relative to their parent). */
export function absoluteBoxes(nodes: FlowLike[]): Map<string, Box> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, Box>();
  const of = (n: FlowLike, depth = 0): Box => {
    const known = out.get(n.id);
    if (known) return known;
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    const base = parent && depth < 50 ? of(parent, depth + 1) : { x: 0, y: 0 };
    const b = { x: base.x + n.position.x, y: base.y + n.position.y, w: n.measured?.width ?? n.width ?? 0, h: n.measured?.height ?? n.height ?? 0 };
    out.set(n.id, b);
    return b;
  };
  for (const n of nodes) of(n);
  return out;
}

const CELL = 400;

/**
 * For every elbow connection, the elements near it that it should go around: not its ends, not
 * what contains or is inside them, not areas, drawings or annotations. Connections with nothing
 * near are left out.
 */
export function avoidanceBoxes(nodes: FlowLike[], edges: EdgeLike[]): Map<string, { boxes: Box[]; source: Box; target: Box }> {
  const out = new Map<string, { boxes: Box[]; source: Box; target: Box }>();
  const elbow = edges.filter((e) => !e.data?.style || e.data.style.routing === "elbow");
  if (!elbow.length) return out;
  const boxes = absoluteBoxes(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // A coarse grid so each connection only looks at the elements around it.
  const grid = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.hidden || SOFT.has(n.type ?? "") || n.className?.includes("wp-overlay")) continue;
    const b = boxes.get(n.id)!;
    if (!b.w || !b.h) continue;
    for (let gx = Math.floor(b.x / CELL); gx <= Math.floor((b.x + b.w) / CELL); gx++)
      for (let gy = Math.floor(b.y / CELL); gy <= Math.floor((b.y + b.h) / CELL); gy++) {
        const k = `${gx},${gy}`;
        const list = grid.get(k);
        if (list) list.push(n.id);
        else grid.set(k, [n.id]);
      }
  }
  const lineage = (id: string) => {
    const s = new Set<string>();
    for (let p: string | undefined = id, i = 0; p && i < 50; p = byId.get(p)?.parentId, i++) s.add(p);
    return s;
  };
  for (const e of elbow) {
    const sb = boxes.get(e.source);
    const tb = boxes.get(e.target);
    if (!sb || !tb) continue;
    const x1 = Math.min(sb.x, tb.x) - ROUTE_LEAD;
    const y1 = Math.min(sb.y, tb.y) - ROUTE_LEAD;
    const x2 = Math.max(sb.x + sb.w, tb.x + tb.w) + ROUTE_LEAD;
    const y2 = Math.max(sb.y + sb.h, tb.y + tb.h) + ROUTE_LEAD;
    const skip = new Set([...lineage(e.source), ...lineage(e.target)]);
    const found = new Set<string>();
    for (let gx = Math.floor(x1 / CELL); gx <= Math.floor(x2 / CELL); gx++)
      for (let gy = Math.floor(y1 / CELL); gy <= Math.floor(y2 / CELL); gy++)
        for (const id of grid.get(`${gx},${gy}`) ?? []) {
          if (skip.has(id) || found.has(id)) continue;
          const b = boxes.get(id)!;
          if (b.x + b.w < x1 || b.x > x2 || b.y + b.h < y1 || b.y > y2) continue;
          // Something inside one of the ends (a block in the container it links) is not in the way.
          const anc = lineage(id);
          if (anc.has(e.source) || anc.has(e.target)) continue;
          found.add(id);
        }
    if (found.size && found.size <= 40) out.set(e.id, { boxes: [...found].map((id) => boxes.get(id)!), source: sb, target: tb });
  }
  return out;
}
