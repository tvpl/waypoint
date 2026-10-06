/**
 * "Minha biblioteca": reusable pieces of drawing. An item is a small plan fragment (elements and
 * the connections among them) stored with its top-left corner at the origin.
 */
import { z } from "zod";
import { planEdgeSchema, planNodeSchema, sortParentsFirst, type PlanEdge, type PlanNode } from "./plan";

export const LIBRARY_MAX_ITEMS = 1000;
export const LIBRARY_ITEM_MAX_BYTES = 512 * 1024;

export const libraryContentSchema = z.object({
  nodes: z.array(planNodeSchema).min(1).max(500),
  edges: z.array(planEdgeSchema).max(1000).default([]),
});
export type LibraryContent = z.infer<typeof libraryContentSchema>;

export type LibraryItem = { id: string; name: string; content: LibraryContent; createdAt: number };

/**
 * Cleans a fragment for the library: no layers, no dangling parents or connections, and the
 * top-level elements moved so the fragment starts at (0, 0).
 */
export function normalizeLibraryContent(input: unknown): LibraryContent {
  const parsed = libraryContentSchema.parse(input);
  const ids = new Set(parsed.nodes.map((n) => n.id));
  const nodes: PlanNode[] = sortParentsFirst(
    parsed.nodes.map(({ layer: _l, ...n }) => (n.parentId && !ids.has(n.parentId) ? { ...n, parentId: undefined } : n)),
  );
  const top = nodes.filter((n) => !n.parentId);
  const minX = Math.min(...top.map((n) => n.x));
  const minY = Math.min(...top.map((n) => n.y));
  const edges: PlanEdge[] = parsed.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target).map(({ layer: _l, ...e }) => e);
  return { nodes: nodes.map((n) => (n.parentId ? n : { ...n, x: Math.round(n.x - minX), y: Math.round(n.y - minY) })), edges };
}

/** A fresh copy with new ids, placed with its center at `at` (to insert into a plan). */
export function instantiateLibraryContent(content: LibraryContent, at: { x: number; y: number }, newId: () => string): LibraryContent {
  const map = new Map(content.nodes.map((n) => [n.id, newId()]));
  const top = content.nodes.filter((n) => !n.parentId);
  const w = Math.max(...top.map((n) => n.x + n.width));
  const h = Math.max(...top.map((n) => n.y + n.height));
  const dx = Math.round(at.x - w / 2);
  const dy = Math.round(at.y - h / 2);
  return {
    nodes: content.nodes.map((n) => ({
      ...n,
      id: map.get(n.id)!,
      ...(n.parentId ? { parentId: map.get(n.parentId) } : { x: n.x + dx, y: n.y + dy }),
    })),
    edges: content.edges.map((e) => ({ ...e, id: newId(), source: map.get(e.source)!, target: map.get(e.target)! })),
  };
}
