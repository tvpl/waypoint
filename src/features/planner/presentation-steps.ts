/**
 * Presentation steps (pure). Step 0 is always the overview; the rest come
 * either from the automatic reading order or from the custom order stored in
 * node data (`data.presentation.order`).
 */
import type { PlanDocument, PlanNode } from "@/domain/plan";
import { layerIdOf, layerVisibility } from "@/domain/layers";
import { absRect, childrenMap, descendants } from "./doc-ops";
import { KIND_LABEL, PARENT_KINDS } from "./defaults";

type Doc = Pick<PlanDocument, "nodes" | "edges"> & Partial<Pick<PlanDocument, "layers">>;

/** Nodes on layers that are switched off (document defaults plus a viewer's overrides) aren't steps. */
function onVisibleLayer(doc: Doc, overrides?: Readonly<Record<string, boolean>>) {
  const vis = layerVisibility(doc, overrides);
  return (n: PlanNode) => vis.get(layerIdOf(n)) !== false;
}

export type PresentationStep = {
  /** null = overview (whole plan). */
  nodeId: string | null;
  title: string;
};

/** True when any node carries an explicit presentation order. */
export function hasCustomOrder(doc: Pick<PlanDocument, "nodes">): boolean {
  return doc.nodes.some((n) => typeof n.data.presentation?.order === "number" && !n.data.presentation.hidden);
}

function byReading(doc: Doc) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const rect = new Map(doc.nodes.map((n) => [n.id, absRect(doc, n.id, byId)]));
  return (a: PlanNode, b: PlanNode) => {
    const ra = rect.get(a.id)!;
    const rb = rect.get(b.id)!;
    // same "row" when the tops are within half the shorter height
    const tol = Math.min(ra.height, rb.height) / 2;
    if (Math.abs(ra.y - rb.y) > tol) return ra.y - rb.y;
    return ra.x - rb.x;
  };
}

/** Automatic order: top-level sections/containers, then the other top-level nodes, in reading order. */
export function defaultStepNodes(doc: Doc, overrides?: Readonly<Record<string, boolean>>): PlanNode[] {
  const order = byReading(doc);
  const visible = onVisibleLayer(doc, overrides);
  // Drawings are annotations, not steps.
  const top = doc.nodes.filter((n) => !n.parentId && !n.data.presentation?.hidden && n.kind !== "ink" && visible(n));
  const areas = top.filter((n) => PARENT_KINDS.has(n.kind)).sort(order);
  const rest = top.filter((n) => !PARENT_KINDS.has(n.kind)).sort(order);
  return [...areas, ...rest];
}

/** Custom order: nodes with `presentation.order` (any depth), ascending; ties by reading order. */
export function customStepNodes(doc: Doc, overrides?: Readonly<Record<string, boolean>>): PlanNode[] {
  const order = byReading(doc);
  const visible = onVisibleLayer(doc, overrides);
  return doc.nodes
    .filter((n) => typeof n.data.presentation?.order === "number" && !n.data.presentation.hidden && visible(n))
    .sort((a, b) => a.data.presentation!.order! - b.data.presentation!.order! || order(a, b));
}

export function stepTitle(n: PlanNode) {
  return n.data.title.trim() || KIND_LABEL[n.kind];
}

export function presentationSteps(doc: Doc, planTitle: string, overrides?: Readonly<Record<string, boolean>>): PresentationStep[] {
  const nodes = hasCustomOrder(doc) ? customStepNodes(doc, overrides) : defaultStepNodes(doc, overrides);
  return [{ nodeId: null, title: planTitle || "Visão geral" }, ...nodes.map((n) => ({ nodeId: n.id, title: stepTitle(n) }))];
}

/** Ids that stay lit on a step: the node and everything inside it. */
export function activeIdsFor(doc: Doc, nodeId: string | null, kids = childrenMap(doc)): Set<string> | null {
  if (!nodeId) return null;
  return new Set([nodeId, ...descendants(doc, nodeId, kids)]);
}

/**
 * Whether a node currently appears in the presentation (for the inspector
 * toggle) and its 1-based position.
 */
export function presentationState(doc: Doc, nodeId: string): { included: boolean; custom: boolean; position: number | null; total: number } {
  const custom = hasCustomOrder(doc);
  const list = custom ? customStepNodes(doc) : defaultStepNodes(doc);
  const i = list.findIndex((n) => n.id === nodeId);
  return { included: i >= 0, custom, position: i >= 0 ? i + 1 : null, total: list.length };
}

/**
 * Includes/excludes a node. Including a node that the automatic order would
 * skip switches the plan to a custom order, materialized from the current
 * automatic sequence so nothing silently disappears.
 */
export function setIncluded<T extends Doc>(doc: T, nodeId: string, include: boolean): T {
  const custom = hasCustomOrder(doc);
  const patch = new Map<string, NonNullable<PlanNode["data"]["presentation"]> | undefined>();
  if (!include) {
    patch.set(nodeId, { hidden: true });
  } else if (custom) {
    const max = Math.max(0, ...customStepNodes(doc).map((n) => n.data.presentation!.order!));
    patch.set(nodeId, { order: max + 1 });
  } else {
    const node = doc.nodes.find((n) => n.id === nodeId);
    if (node && !node.parentId) {
      // top-level nodes are part of the automatic order: un-hiding is enough
      patch.set(nodeId, undefined);
    } else {
      const auto = defaultStepNodes(doc);
      auto.forEach((n, i) => patch.set(n.id, { order: i + 1 }));
      patch.set(nodeId, { order: auto.length + 1 });
    }
  }
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      if (!patch.has(n.id)) return n;
      const p = patch.get(n.id);
      const data = { ...n.data };
      if (p) data.presentation = p;
      else delete data.presentation;
      return { ...n, data };
    }),
  };
}

/** Sets a node's custom position (1-based). */
export function setOrder<T extends Doc>(doc: T, nodeId: string, order: number): T {
  const o = Math.max(1, Math.min(9999, Math.round(order)));
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, presentation: { order: o } } } : n)) };
}

/** Back to the automatic order (keeps nodes hidden from it). */
export function clearCustomOrder<T extends Doc>(doc: T): T {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      const p = n.data.presentation;
      if (!p || p.order === undefined) return n;
      const data = { ...n.data };
      if (p.hidden) data.presentation = { hidden: true };
      else delete data.presentation;
      return { ...n, data };
    }),
  };
}
