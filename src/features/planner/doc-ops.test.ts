import { describe, expect, it } from "vitest";
import type { PlanDocument, PlanNode } from "@/domain/plan";
import {
  absPos,
  alignNodes,
  bringToFront,
  copySubgraph,
  distributeNodes,
  duplicateNodes,
  findDropTarget,
  groupNodes,
  pasteClip,
  removeNodes,
  reparent,
  sendToBack,
  swapEdge,
  ungroupNodes,
} from "./doc-ops";

const n = (id: string, x: number, y: number, extra: Partial<PlanNode> = {}): PlanNode => ({
  id,
  kind: "block",
  x,
  y,
  width: 100,
  height: 50,
  data: { title: id },
  ...extra,
});

const base = (): PlanDocument => ({
  schemaVersion: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    n("box", 100, 100, { kind: "container", width: 400, height: 300 }),
    n("a", 20, 60, { parentId: "box" }),
    n("b", 200, 60, { parentId: "box" }),
    n("c", 700, 100),
    n("d", 900, 400),
  ],
  edges: [
    { id: "e1", source: "a", target: "b", kind: "flow" },
    { id: "e2", source: "b", target: "c", kind: "relation", sourceHandle: "r", targetHandle: "l" },
  ],
});

describe("doc-ops", () => {
  it("computes absolute positions through parents", () => {
    expect(absPos(base(), "a")).toEqual({ x: 120, y: 160 });
  });

  it("removes nodes with their descendants and edges", () => {
    const d = removeNodes(base(), ["box"]);
    expect(d.nodes.map((x) => x.id)).toEqual(["c", "d"]);
    expect(d.edges).toEqual([]);
  });

  it("reparents keeping the absolute position, and refuses cycles", () => {
    let d = reparent(base(), "c", "box");
    const c = d.nodes.find((x) => x.id === "c")!;
    expect(c.parentId).toBe("box");
    expect(absPos(d, "c")).toEqual({ x: 700, y: 100 });
    d = reparent(d, "a", undefined);
    expect(d.nodes.find((x) => x.id === "a")!.parentId).toBeUndefined();
    expect(absPos(d, "a")).toEqual({ x: 120, y: 160 });
    const cyc = reparent(d, "box", "c");
    expect(cyc.nodes.find((x) => x.id === "box")!.parentId).toBeUndefined();
  });

  it("finds the container under a node's center", () => {
    const d = base();
    d.nodes.find((x) => x.id === "c")!.x = 250; // center at (300,125) → inside box
    expect(findDropTarget(d, "c")).toBe("box");
    expect(findDropTarget(d, "d")).toBeUndefined();
    expect(findDropTarget(d, "box")).toBeUndefined();
  });

  it("groups a selection into a container with relative children", () => {
    const res = groupNodes(base(), ["c", "d"])!;
    const g = res.doc.nodes.find((x) => x.id === res.id)!;
    expect(g.kind).toBe("container");
    const c = res.doc.nodes.find((x) => x.id === "c")!;
    expect(c.parentId).toBe(res.id);
    expect(absPos(res.doc, "c")).toEqual({ x: 700, y: 100 });
    expect(absPos(res.doc, "d")).toEqual({ x: 900, y: 400 });
    // parents first
    expect(res.doc.nodes.findIndex((x) => x.id === res.id)).toBeLessThan(res.doc.nodes.findIndex((x) => x.id === "c"));
  });

  it("ungroups lifting children and keeping their positions", () => {
    const res = ungroupNodes(base(), ["box"]);
    expect(res.doc.nodes.find((x) => x.id === "box")).toBeUndefined();
    expect(res.doc.nodes.find((x) => x.id === "a")!.parentId).toBeUndefined();
    expect(absPos(res.doc, "a")).toEqual({ x: 120, y: 160 });
    expect(res.doc.edges.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("copies and pastes a subgraph with fresh ids and internal edges", () => {
    const clip = copySubgraph(base(), ["box"])!;
    expect(clip.nodes.map((x) => x.id)).toEqual(["box", "a", "b"]);
    expect(clip.edges.map((e) => e.id)).toEqual(["e1"]);
    const res = pasteClip(base(), clip, { offset: { x: 24, y: 24 } });
    expect(res.doc.nodes).toHaveLength(8);
    expect(res.ids).toHaveLength(1);
    const root = res.doc.nodes.find((x) => x.id === res.ids[0])!;
    expect(root.x).toBe(124);
    const kids = res.doc.nodes.filter((x) => x.parentId === root.id);
    expect(kids).toHaveLength(2);
    expect(res.doc.edges).toHaveLength(3);
  });

  it("pastes child selections at absolute positions", () => {
    const clip = copySubgraph(base(), ["a"])!;
    expect(clip.nodes[0].parentId).toBeUndefined();
    expect(clip.nodes[0].x).toBe(120);
    const at = pasteClip(base(), clip, { at: { x: 0, y: 0 } });
    const p = at.doc.nodes.find((x) => x.id === at.ids[0])!;
    expect([p.x, p.y]).toEqual([0, 0]);
  });

  it("duplicates in place inside the same parent", () => {
    const res = duplicateNodes(base(), ["a"]);
    const dup = res.doc.nodes.find((x) => x.id === res.ids[0])!;
    expect(dup.parentId).toBe("box");
    expect([dup.x, dup.y]).toEqual([44, 84]);
  });

  it("aligns and distributes in absolute space", () => {
    const left = alignNodes(base(), ["a", "c"], "left");
    expect(absPos(left, "c").x).toBe(120);
    expect(absPos(left, "a").x).toBe(120);
    const top = alignNodes(base(), ["a", "d"], "top");
    expect(absPos(top, "d").y).toBe(160);
    const dist = distributeNodes(base(), ["a", "c", "d"], "horizontal");
    // span 120..1000, widths 300 → gap 290
    expect(absPos(dist, "c").x).toBe(510);
  });

  it("restacks within siblings", () => {
    const front = bringToFront(base(), ["c"]);
    expect(front.nodes.find((x) => x.id === "c")!.z).toBe(1);
    const back = sendToBack(base(), ["c"]);
    expect(back.nodes.find((x) => x.id === "c")!.z).toBe(-1);
  });

  it("swaps edge direction with handles", () => {
    const d = swapEdge(base(), "e2");
    expect(d.edges[1]).toMatchObject({ source: "c", target: "b", sourceHandle: "l", targetHandle: "r" });
  });
});
