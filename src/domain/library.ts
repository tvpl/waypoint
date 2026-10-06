/**
 * "Minha biblioteca": reusable pieces of drawing. An item is a small plan fragment (elements and
 * the connections among them) stored with its top-left corner at the origin.
 */
import { z } from "zod";
import { planEdgeSchema, planNodeSchema, sortParentsFirst, type PlanDocument, type PlanEdge, type PlanNode } from "./plan";
import { stableStringify } from "./canvas-adapter";

export const LIBRARY_MAX_ITEMS = 1000;
export const LIBRARY_ITEM_MAX_BYTES = 512 * 1024;

export const libraryContentSchema = z.object({
  nodes: z.array(planNodeSchema).min(1).max(500),
  edges: z.array(planEdgeSchema).max(1000).default([]),
});
export type LibraryContent = z.infer<typeof libraryContentSchema>;

export type LibraryItem = { id: string; name: string; content: LibraryContent; createdAt: number; rev: string };

/**
 * Cleans a fragment for the library: no layers, no dangling parents or connections, and the
 * top-level elements moved so the fragment starts at (0, 0).
 */
export function normalizeLibraryContent(input: unknown): LibraryContent {
  const parsed = libraryContentSchema.parse(input);
  const ids = new Set(parsed.nodes.map((n) => n.id));
  const nodes: PlanNode[] = sortParentsFirst(
    parsed.nodes.map(({ layer: _l, ...n }) => {
      // A library item never points at another library item (copies are linked, the item is not).
      const { libraryRef: _r, ...data } = n.data;
      const clean = { ...n, data };
      return clean.parentId && !ids.has(clean.parentId) ? { ...clean, parentId: undefined } : clean;
    }),
  );
  const top = nodes.filter((n) => !n.parentId);
  const minX = Math.min(...top.map((n) => n.x));
  const minY = Math.min(...top.map((n) => n.y));
  const edges: PlanEdge[] = parsed.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target).map(({ layer: _l, ...e }) => e);
  return { nodes: nodes.map((n) => (n.parentId ? n : { ...n, x: Math.round(n.x - minX), y: Math.round(n.y - minY) })), edges };
}

/**
 * Revision of an item's content: changes when the drawing changes, not when ids of connections or
 * the order of the lists do. Copies remember it to know whether they are up to date.
 */
export function contentRev(content: LibraryContent): string {
  const nodes = [...content.nodes].sort((a, b) => (a.id < b.id ? -1 : 1)).map(({ layer: _l, z: _z, ...n }) => {
    const { libraryRef: _r, ...data } = n.data;
    return { ...n, data };
  });
  const edges = content.edges.map(({ id: _i, layer: _l, ...e }) => stableStringify(e)).sort();
  const text = stableStringify({ nodes, edges });
  // FNV-1a, twice with different seeds: short, and collisions don't matter here.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

/** A fresh copy with new ids, placed with its center at `at` (to insert into a plan). With `link`, the copy stays tied to its item. */
export function instantiateLibraryContent(
  content: LibraryContent,
  at: { x: number; y: number },
  newId: () => string,
  link?: { item: string; rev: string },
): LibraryContent {
  const map = new Map(content.nodes.map((n) => [n.id, newId()]));
  const instance = link ? newId() : "";
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
      ...(link ? { data: { ...n.data, libraryRef: { item: link.item, rev: link.rev, instance, node: n.id } } } : {}),
    })),
    edges: content.edges.map((e) => ({ ...e, id: newId(), source: map.get(e.source)!, target: map.get(e.target)! })),
  };
}

// ------------------------------------------------------------------ linked copies

type Doc = Pick<PlanDocument, "nodes" | "edges">;

export type LibraryInstance = { instance: string; item: string; rev: string; nodes: string[] };

/** The linked copies of library items in a plan. */
export function libraryInstances(doc: Pick<PlanDocument, "nodes">): LibraryInstance[] {
  const out = new Map<string, LibraryInstance>();
  for (const n of doc.nodes) {
    const r = n.data.libraryRef;
    if (!r) continue;
    const cur = out.get(r.instance);
    if (cur) cur.nodes.push(n.id);
    else out.set(r.instance, { instance: r.instance, item: r.item, rev: r.rev, nodes: [n.id] });
  }
  return [...out.values()];
}

/** A copy as library content, with the item's own ids (to compare with the item, or to send it back). */
export function instanceContent(doc: Doc, instance: string): LibraryContent | null {
  const mine = doc.nodes.filter((n) => n.data.libraryRef?.instance === instance);
  if (!mine.length) return null;
  const orig = new Map(mine.map((n) => [n.id, n.data.libraryRef!.node]));
  const nodes = mine.map((n) => ({ ...n, id: orig.get(n.id)!, parentId: n.parentId && orig.has(n.parentId) ? orig.get(n.parentId) : undefined }));
  const edges = doc.edges.filter((e) => orig.has(e.source) && orig.has(e.target)).map((e) => ({ ...e, source: orig.get(e.source)!, target: orig.get(e.target)! }));
  try {
    return normalizeLibraryContent({ nodes, edges });
  } catch {
    return null;
  }
}

/** Whether a copy was changed in the plan since it was inserted or last updated. */
export function instanceEdited(doc: Doc, inst: LibraryInstance): boolean {
  const c = instanceContent(doc, inst.instance);
  return !!c && contentRev(c) !== inst.rev;
}

/**
 * Replaces a copy with the item's current content, where the copy is: elements that still exist
 * in the item keep their ids (so connections from the rest of the plan stay), removed ones go,
 * new ones come in. The copy is then at the item's revision.
 */
export function updateInstance<T extends Doc>(doc: T, instance: string, content: LibraryContent, rev: string, newId: () => string): T {
  const old = doc.nodes.filter((n) => n.data.libraryRef?.instance === instance);
  if (!old.length) return doc;
  const item = old[0].data.libraryRef!.item;
  const oldIds = new Set(old.map((n) => n.id));
  const roots = old.filter((n) => !n.parentId || !oldIds.has(n.parentId));
  const anchor = { x: Math.min(...roots.map((n) => n.x)), y: Math.min(...roots.map((n) => n.y)) };
  const rootParent = roots[0].parentId;
  const layer = roots[0].layer;
  const byOrig = new Map(old.map((n) => [n.data.libraryRef!.node, n.id]));
  const idOf = new Map(content.nodes.map((n) => [n.id, byOrig.get(n.id) ?? newId()]));
  const fresh: PlanNode[] = content.nodes.map((n) => {
    const node: PlanNode = {
      ...n,
      id: idOf.get(n.id)!,
      ...(n.parentId ? { parentId: idOf.get(n.parentId) } : { x: anchor.x + n.x, y: anchor.y + n.y, parentId: rootParent }),
      data: { ...n.data, libraryRef: { item, rev, instance, node: n.id } },
    };
    if (!node.parentId) delete node.parentId;
    if (layer && !n.parentId) node.layer = layer;
    else delete node.layer;
    return node;
  });
  const keep = new Set(fresh.map((n) => n.id));
  // Where the copy was in the stacking order, the new copy goes.
  const at = doc.nodes.findIndex((n) => oldIds.has(n.id));
  const others = doc.nodes.filter((n) => !oldIds.has(n.id));
  const nodes = sortParentsFirst([...others.slice(0, at), ...fresh, ...others.slice(at)]);
  const edges = [
    ...doc.edges.filter((e) => !(oldIds.has(e.source) && oldIds.has(e.target)) && (!oldIds.has(e.source) || keep.has(e.source)) && (!oldIds.has(e.target) || keep.has(e.target))),
    ...content.edges.map((e) => ({ ...e, id: newId(), source: idOf.get(e.source)!, target: idOf.get(e.target)!, ...(layer ? { layer } : {}) })),
  ];
  return { ...doc, nodes, edges };
}

/** Cuts the tie between a copy and its item (it becomes ordinary elements). */
export function unlinkInstance<T extends Doc>(doc: T, instance: string): T {
  let changed = false;
  const nodes = doc.nodes.map((n) => {
    if (n.data.libraryRef?.instance !== instance) return n;
    changed = true;
    const { libraryRef: _r, ...data } = n.data;
    return { ...n, data };
  });
  return changed ? { ...doc, nodes } : doc;
}
