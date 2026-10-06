/** Alignment guides while dragging: snap to siblings' edges and centers. Pure (shared by tests). */

export type Box = { id: string; x: number; y: number; width: number; height: number };

export type Guides = {
  /** Snapped position for the dragged box (only the axes that matched). */
  x?: number;
  y?: number;
  /** Guide lines to draw, in the same coordinate space as the boxes. */
  vertical?: { x: number; y1: number; y2: number };
  horizontal?: { y: number; x1: number; x2: number };
  /** Equal gaps found (drawn as measured spans with their size). */
  spacing?: Span[];
};

/** A measured gap between two boxes: horizontal (y fixed) or vertical (x fixed). */
export type Span = { axis: "x" | "y"; from: number; to: number; at: number; gap: number };

const xs = (b: Box) => [b.x, b.x + b.width / 2, b.x + b.width];
const ys = (b: Box) => [b.y, b.y + b.height / 2, b.y + b.height];

/**
 * Finds the closest alignment (left/center/right, top/middle/bottom) between the dragged
 * box and the others within `threshold`, per axis.
 */
export function helperLines(dragged: Box, others: Box[], threshold: number): Guides {
  const out: Guides = {};
  let bestX = threshold + 1;
  let bestY = threshold + 1;
  const dx = xs(dragged);
  const dy = ys(dragged);
  for (const o of others) {
    if (o.id === dragged.id) continue;
    const ox = xs(o);
    const oy = ys(o);
    dx.forEach((a) =>
      ox.forEach((b) => {
        const d = Math.abs(a - b);
        if (d < bestX) {
          bestX = d;
          out.x = dragged.x + (b - a);
          const top = Math.min(dragged.y, o.y);
          const bottom = Math.max(dragged.y + dragged.height, o.y + o.height);
          out.vertical = { x: b, y1: top, y2: bottom };
        }
      }),
    );
    dy.forEach((a) =>
      oy.forEach((b) => {
        const d = Math.abs(a - b);
        if (d < bestY) {
          bestY = d;
          out.y = dragged.y + (b - a);
          const left = Math.min(dragged.x, o.x);
          const right = Math.max(dragged.x + dragged.width, o.x + o.width);
          out.horizontal = { y: b, x1: left, x2: right };
        }
      }),
    );
  }
  // Equal spacing wins over an alignment that is farther away.
  for (const axis of ["x", "y"] as const) {
    const sp = equalSpacing(dragged, others, axis, threshold);
    if (!sp) continue;
    const dist = Math.abs(sp.pos - (axis === "x" ? dragged.x : dragged.y));
    if (axis === "x" && dist <= bestX) {
      out.x = sp.pos;
      delete out.vertical;
      out.spacing = [...(out.spacing ?? []), ...sp.spans];
    }
    if (axis === "y" && dist <= bestY) {
      out.y = sp.pos;
      delete out.horizontal;
      out.spacing = [...(out.spacing ?? []), ...sp.spans];
    }
  }
  return out;
}

/**
 * Along one axis, among the boxes in the same row (or column) as the dragged one: a position that
 * centers it between its neighbors, or repeats a gap already used in that row. Null when none is
 * within `threshold`.
 */
export function equalSpacing(dragged: Box, others: Box[], axis: "x" | "y", threshold: number): { pos: number; spans: Span[] } | null {
  const lo = (b: Box) => (axis === "x" ? b.x : b.y);
  const size = (b: Box) => (axis === "x" ? b.width : b.height);
  const hi = (b: Box) => lo(b) + size(b);
  // Cross axis: boxes that overlap the dragged one there are in its row.
  const clo = (b: Box) => (axis === "x" ? b.y : b.x);
  const chi = (b: Box) => clo(b) + (axis === "x" ? b.height : b.width);
  const row = others.filter((o) => o.id !== dragged.id && chi(o) > clo(dragged) && clo(o) < chi(dragged)).sort((a, b) => lo(a) - lo(b));
  if (!row.length) return null;
  const cur = lo(dragged);
  const center = cur + size(dragged) / 2;
  const before = row.filter((o) => hi(o) <= center && lo(o) < cur).pop();
  const after = row.find((o) => lo(o) >= center && hi(o) > hi(dragged));
  // The cross position of a span: the middle of where the two boxes overlap.
  const mid = (a: Box, b: Box) => (Math.max(clo(a), clo(b)) + Math.min(chi(a), chi(b))) / 2;
  const span = (a: Box, b: Box, from: number, to: number): Span => ({ axis, from, to, at: mid(a, b), gap: Math.round(to - from) });
  const cands: { pos: number; spans: (pos: number) => Span[] }[] = [];
  if (before && after) {
    const free = lo(after) - hi(before) - size(dragged);
    if (free > 0) {
      const pos = hi(before) + free / 2;
      cands.push({
        pos,
        spans: (p) => [span(before, dragged, hi(before), p), span(dragged, after, p + size(dragged), lo(after))],
      });
    }
  }
  // Gaps already in the row, repeated next to a neighbor.
  for (let i = 1; i < row.length; i++) {
    const a = row[i - 1];
    const b = row[i];
    const gap = lo(b) - hi(a);
    if (gap <= 0) continue;
    const existing = span(a, b, hi(a), lo(b));
    if (before) cands.push({ pos: hi(before) + gap, spans: (p) => [existing, span(before, dragged, hi(before), p)] });
    if (after) cands.push({ pos: lo(after) - gap - size(dragged), spans: (p) => [existing, span(dragged, after, p + size(dragged), lo(after))] });
  }
  let best: { pos: number; spans: Span[] } | null = null;
  let bestD = threshold + 0.0001;
  for (const c of cands) {
    const d = Math.abs(c.pos - cur);
    if (d < bestD) {
      bestD = d;
      best = { pos: c.pos, spans: c.spans(c.pos) };
    }
  }
  return best;
}
