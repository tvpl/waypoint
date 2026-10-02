/** Alignment guides while dragging: snap to siblings' edges and centers. Pure (shared by tests). */

export type Box = { id: string; x: number; y: number; width: number; height: number };

export type Guides = {
  /** Snapped position for the dragged box (only the axes that matched). */
  x?: number;
  y?: number;
  /** Guide lines to draw, in the same coordinate space as the boxes. */
  vertical?: { x: number; y1: number; y2: number };
  horizontal?: { y: number; x1: number; x2: number };
};

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
  return out;
}
