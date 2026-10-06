import { describe, expect, it } from "vitest";
import { instantiateLibraryContent, normalizeLibraryContent } from "./library";

const content = {
  nodes: [
    { id: "a", kind: "shape", x: 100, y: 50, width: 80, height: 40, layer: "x", data: { title: "A", shape: { type: "rect" } } },
    { id: "b", kind: "frame", x: 300, y: 80, width: 200, height: 100, data: { title: "F" } },
    { id: "c", kind: "shape", x: 10, y: 10, width: 40, height: 40, parentId: "b", data: { title: "", shape: { type: "ellipse" } } },
    { id: "d", kind: "shape", x: 0, y: 0, width: 10, height: 10, parentId: "gone", data: { title: "" } },
  ],
  edges: [
    { id: "e", source: "a", target: "c", kind: "flow" },
    { id: "f", source: "a", target: "zz", kind: "flow" },
  ],
};

describe("library content", () => {
  it("moves the fragment to the origin and drops layers and dangling links", () => {
    const n = normalizeLibraryContent(content);
    const byId = new Map(n.nodes.map((x) => [x.id, x]));
    expect(byId.get("a")).toMatchObject({ x: 100, y: 50 });
    expect(byId.get("d")).toMatchObject({ x: 0, y: 0 });
    expect(byId.get("d")!.parentId).toBeUndefined();
    expect(byId.get("c")).toMatchObject({ parentId: "b", x: 10, y: 10 });
    expect(byId.get("a")!.layer).toBeUndefined();
    expect(n.edges.map((e) => e.id)).toEqual(["e"]);
  });

  it("instantiates with new ids around a point", () => {
    let i = 0;
    const n = normalizeLibraryContent({ ...content, nodes: content.nodes.slice(0, 3) });
    const out = instantiateLibraryContent(n, { x: 1000, y: 1000 }, () => `n${++i}`);
    expect(out.nodes.every((x) => x.id.startsWith("n"))).toBe(true);
    const child = out.nodes.find((x) => x.parentId)!;
    expect(out.nodes.some((x) => x.id === child.parentId)).toBe(true);
    expect(out.edges[0].source).toBe(out.nodes[0].id);
    const top = out.nodes.filter((x) => !x.parentId);
    expect(Math.min(...top.map((x) => x.x))).toBe(1000 - 400 / 2);
  });
});
