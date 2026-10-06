/**
 * Numbered flow steps on connections (pure). Numbering follows the flow: it starts at the
 * connections nothing points into and walks forward breadth-first, so parallel branches get
 * consecutive numbers; ties go by reading order (top to bottom, left to right).
 */
import type { PlanDocument, PlanEdge } from "@/domain/plan";
import { layerIdOf } from "@/domain/layers";
import { absRect } from "./doc-ops";

type Doc = Pick<PlanDocument, "nodes" | "edges">;

/** Connections in flow order. */
export function flowOrder(doc: Doc, edgeIds: Iterable<string>): PlanEdge[] {
  const want = new Set(edgeIds);
  const edges = doc.edges.filter((e) => want.has(e.id));
  if (!edges.length) return [];
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const pos = new Map<string, { x: number; y: number }>();
  const at = (id: string) => {
    let p = pos.get(id);
    if (!p) {
      const r = byId.has(id) ? absRect(doc, id, byId) : { x: 0, y: 0, width: 0, height: 0 };
      p = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      pos.set(id, p);
    }
    return p;
  };
  const reading = (a: string, b: string) => {
    const pa = at(a);
    const pb = at(b);
    return Math.abs(pa.y - pb.y) > 24 ? pa.y - pb.y : pa.x - pb.x;
  };
  const out = new Map<string, PlanEdge[]>();
  const incoming = new Set<string>();
  for (const e of edges) {
    out.set(e.source, [...(out.get(e.source) ?? []), e]);
    incoming.add(e.target);
  }
  for (const list of out.values()) list.sort((a, b) => reading(a.target, b.target));
  const done = new Set<string>();
  const order: PlanEdge[] = [];
  const walk = (starts: string[]) => {
    const queue = [...starts];
    const seen = new Set(starts);
    while (queue.length) {
      const id = queue.shift()!;
      for (const e of out.get(id) ?? []) {
        if (done.has(e.id)) continue;
        done.add(e.id);
        order.push(e);
        if (!seen.has(e.target)) {
          seen.add(e.target);
          queue.push(e.target);
        }
      }
    }
  };
  walk([...out.keys()].filter((id) => !incoming.has(id)).sort(reading));
  // Loops with no clear start: begin at the first remaining connection in reading order.
  while (done.size < edges.length) {
    const next = edges.filter((e) => !done.has(e.id)).sort((a, b) => reading(a.source, b.source))[0];
    walk([next.source]);
  }
  return order;
}

/** Numbers the given connections 1…n in flow order (other connections keep their numbers). */
export function numberFlow<T extends Doc>(doc: T, edgeIds: Iterable<string>): T {
  const step = new Map(flowOrder(doc, edgeIds).map((e, i) => [e.id, i + 1]));
  if (!step.size) return doc;
  return { ...doc, edges: doc.edges.map((e) => (step.has(e.id) ? { ...e, step: step.get(e.id) } : e)) };
}

export function clearSteps<T extends Doc>(doc: T, edgeIds: Iterable<string>): T {
  const ids = new Set(edgeIds);
  return {
    ...doc,
    edges: doc.edges.map((e) => {
      if (!ids.has(e.id) || e.step === undefined) return e;
      const { step: _s, ...rest } = e;
      return rest;
    }),
  };
}

/**
 * Which connections "Numerar passos" works on: the selected connections, else those between the
 * selected elements; a single connection stands for every connection on its layer.
 */
export function stepTargets(doc: Doc, sel: { nodes: ReadonlySet<string>; edges: ReadonlySet<string> }): string[] {
  if (sel.edges.size === 1 && sel.nodes.size === 0) {
    const one = doc.edges.find((e) => sel.edges.has(e.id));
    if (one) return doc.edges.filter((e) => layerIdOf(e) === layerIdOf(one)).map((e) => e.id);
  }
  if (sel.edges.size > 0) return [...sel.edges];
  return doc.edges.filter((e) => sel.nodes.has(e.source) && sel.nodes.has(e.target)).map((e) => e.id);
}
