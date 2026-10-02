import { COLLAPSED_HEIGHT, hiddenByCollapse } from "./canvas-adapter";
import type { PlanDocument } from "./plan";

/** Lightweight shape for list thumbnails. */
export type ThumbNode = { x: number; y: number; w: number; h: number; color?: string; kind: string };
/** Nodes (absolute boxes) plus connections as [from, to] indexes into `nodes`. */
export type Thumb = { nodes: ThumbNode[]; edges: [number, number][] };

const THUMB_MAX_NODES = 80;

/** What a plan looks like from afar: absolute boxes and connections, as the canvas shows it. */
export function planThumb(doc: PlanDocument): Thumb {
  // absolute positions (children are relative to parents)
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const abs = (id: string, depth = 0): { x: number; y: number } => {
    const n = byId.get(id)!;
    if (!n.parentId || depth > 20 || !byId.has(n.parentId)) return { x: n.x, y: n.y };
    const p = abs(n.parentId, depth + 1);
    return { x: p.x + n.x, y: p.y + n.y };
  };
  // What the canvas shows: no children of collapsed areas, which shrink to their header.
  const hidden = hiddenByCollapse(doc);
  const shown = doc.nodes.filter((n) => !hidden.has(n.id)).slice(0, THUMB_MAX_NODES);
  const index = new Map(shown.map((n, i) => [n.id, i]));
  const nodes = shown.map((n) => {
    const p = abs(n.id);
    const collapsed = n.data.collapsed && (n.kind === "container" || n.kind === "section");
    return { x: p.x, y: p.y, w: n.width, h: collapsed ? COLLAPSED_HEIGHT : n.height, color: n.data.color, kind: n.kind };
  });
  const edges = doc.edges
    .map((e) => [index.get(e.source), index.get(e.target)] as const)
    .filter((e): e is readonly [number, number] => e[0] != null && e[1] != null)
    .slice(0, 120)
    .map(([a, b]) => [a, b] as [number, number]);
  return { nodes, edges };
}
