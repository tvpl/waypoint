/**
 * Overlays: another plan shown on a layer of this one ("sobrepor"), or an earlier version of this
 * plan under everything ("papel vegetal"). Their elements are renamed and placed for rendering
 * only; they never enter the document being edited.
 */
import { hiddenByLayers, layerIndex, layerVisibility } from "./layers";
import type { PlanDocument, PlanEdge, PlanNode } from "./plan";

export const OVERLAY_PREFIX = "ov~";
export const isOverlayId = (id: string) => id.startsWith(OVERLAY_PREFIX);

/**
 * The elements of `source` (what its own visible layers show) renamed under `key`, on `layer`,
 * moved by (dx, dy).
 */
export function overlayElements(source: Pick<PlanDocument, "nodes" | "edges" | "layers">, opts: { key: string; layer?: string; dx?: number; dy?: number }): { nodes: PlanNode[]; edges: PlanEdge[] } {
  const hidden = hiddenByLayers(source, layerVisibility(source));
  const rank = layerIndex(source);
  const id = (x: string) => `${OVERLAY_PREFIX}${opts.key}~${x}`;
  const kept = source.nodes.filter((n) => !hidden.nodes.has(n.id));
  const ids = new Set(kept.map((n) => n.id));
  // Its own layers' stacking, flattened into one layer here.
  const order = new Map(kept.map((n, i) => [n.id, (rank.get(n.layer ?? "base") ?? 0) * 100000 + i]));
  const nodes = [...kept]
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    .map((n): PlanNode => {
      const { layer: _l, z: _z, ...rest } = n;
      const parent = n.parentId && ids.has(n.parentId) ? id(n.parentId) : undefined;
      const out: PlanNode = { ...rest, id: id(n.id), parentId: parent };
      if (!parent) {
        out.x = n.x + (opts.dx ?? 0);
        out.y = n.y + (opts.dy ?? 0);
      }
      if (opts.layer) out.layer = opts.layer;
      if (!out.parentId) delete out.parentId;
      return out;
    });
  const edges = source.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target) && !hidden.edges.has(e.id))
    .map((e): PlanEdge => {
      const { layer: _l, ...rest } = e;
      return { ...rest, id: id(e.id), source: id(e.source), target: id(e.target), ...(opts.layer ? { layer: opts.layer } : {}) };
    });
  return { nodes, edges };
}
