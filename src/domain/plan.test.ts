import { describe, expect, it } from "vitest";
import { documentResourceRefs, normalizeDocument, sortParentsFirst, type PlanNode } from "./plan";

const node = (id: string, parentId?: string): PlanNode => ({ id, kind: "block", x: 0, y: 0, width: 100, height: 50, parentId, data: { title: id } });

describe("normalizeDocument", () => {
  it("drops dangling edges and parents", () => {
    const doc = normalizeDocument({
      nodes: [node("a"), node("b", "missing")],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "a", target: "ghost" },
        { id: "e3", source: "a", target: "a" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    expect(doc.nodes.find((n) => n.id === "b")?.parentId).toBeUndefined();
    expect(doc.edges.map((e) => e.id)).toEqual(["e1"]);
    expect(doc.edges[0].kind).toBe("flow");
  });

  it("rejects invalid resources", () => {
    const bad = { ...node("a"), data: { title: "a", resource: { type: "url", url: "not a url" } } };
    expect(() => normalizeDocument({ nodes: [bad], edges: [], viewport: { x: 0, y: 0, zoom: 1 } })).toThrow();
  });
});

describe("sortParentsFirst", () => {
  it("orders parents before children and breaks cycles", () => {
    const out = sortParentsFirst([node("child", "mid"), node("mid", "root"), node("root"), node("x", "y"), node("y", "x")]);
    const idx = (id: string) => out.findIndex((n) => n.id === id);
    expect(idx("root")).toBeLessThan(idx("mid"));
    expect(idx("mid")).toBeLessThan(idx("child"));
    expect(out).toHaveLength(5);
  });
});

describe("documentResourceRefs", () => {
  it("collects node resources", () => {
    const n = { ...node("a"), data: { title: "Docs", resource: { type: "favorite" as const, id: "fav1" } } };
    expect(documentResourceRefs({ schemaVersion: 1, nodes: [n], edges: [], viewport: { x: 0, y: 0, zoom: 1 } })).toEqual([
      { nodeId: "a", nodeTitle: "Docs", type: "favorite", targetId: "fav1" },
    ]);
  });
});
