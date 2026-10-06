import { describe, expect, it } from "vitest";
import { contentRev, instanceContent, instanceEdited, instantiateLibraryContent, libraryInstances, normalizeLibraryContent, unlinkInstance, updateInstance } from "./library";

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

describe("linked library copies", () => {
  const content = normalizeLibraryContent({
    nodes: [
      { id: "box", kind: "container", x: 0, y: 0, width: 300, height: 200, data: { title: "Serviço" } },
      { id: "db", kind: "shape", x: 20, y: 40, width: 80, height: 80, parentId: "box", data: { title: "DB", shape: { type: "cylinder" } } },
      { id: "api", kind: "block", x: 400, y: 0, width: 200, height: 72, data: { title: "API" } },
    ],
    edges: [{ id: "e", source: "api", target: "box", kind: "flow" }],
  });
  const rev = contentRev(content);
  let n = 0;
  const newId = () => `id${++n}`;

  it("keeps the revision stable across copies and moves, and changes it with the drawing", () => {
    const copy = instantiateLibraryContent(content, { x: 900, y: 500 }, newId, { item: "it1", rev });
    const doc = { nodes: copy.nodes, edges: copy.edges };
    const [inst] = libraryInstances(doc);
    expect(inst).toMatchObject({ item: "it1", rev, nodes: copy.nodes.map((x) => x.id) });
    expect(contentRev(instanceContent(doc, inst.instance)!)).toBe(rev);
    expect(instanceEdited(doc, inst)).toBe(false);
    const moved = { ...doc, nodes: doc.nodes.map((x) => (x.parentId ? x : { ...x, x: x.x + 50 })) };
    expect(instanceEdited(moved, inst)).toBe(false);
    const renamed = { ...doc, nodes: doc.nodes.map((x) => (x.data.title === "API" ? { ...x, data: { ...x.data, title: "API v2" } } : x)) };
    expect(instanceEdited(renamed, inst)).toBe(true);
  });

  it("updates a copy in place: same ids for what stays, outside connections kept", () => {
    const copy = instantiateLibraryContent(content, { x: 900, y: 500 }, newId, { item: "it1", rev });
    const outside = { id: "o", kind: "note" as const, x: 0, y: 0, width: 100, height: 60, data: { title: "nota" } };
    const api = copy.nodes.find((x) => x.data.title === "API")!;
    const dbNode = copy.nodes.find((x) => x.data.title === "DB")!;
    const doc = { nodes: [outside, ...copy.nodes], edges: [...copy.edges, { id: "x1", source: "o", target: api.id, kind: "flow" as const }, { id: "x2", source: "o", target: dbNode.id, kind: "flow" as const }] };
    // The item changes: the database goes, a cache comes in, the API is renamed.
    const next = normalizeLibraryContent({
      nodes: [
        { id: "box", kind: "container", x: 0, y: 0, width: 300, height: 200, data: { title: "Serviço" } },
        { id: "cache", kind: "shape", x: 20, y: 40, width: 80, height: 80, parentId: "box", data: { title: "Cache", shape: { type: "rect" } } },
        { id: "api", kind: "block", x: 400, y: 0, width: 200, height: 72, data: { title: "API v2" } },
      ],
      edges: [{ id: "e", source: "api", target: "box", kind: "flow" }],
    });
    const rev2 = contentRev(next);
    const inst = libraryInstances(doc)[0].instance;
    const up = updateInstance(doc, inst, next, rev2, newId);
    const titles = up.nodes.map((x) => x.data.title);
    expect(titles).toEqual(["nota", "Serviço", "Cache", "API v2"]);
    expect(up.nodes.find((x) => x.data.title === "API v2")!.id).toBe(api.id);
    expect(up.edges.map((e) => e.id)).toContain("x1");
    expect(up.edges.map((e) => e.id)).not.toContain("x2");
    expect(libraryInstances(up)[0].rev).toBe(rev2);
    expect(instanceEdited(up, libraryInstances(up)[0])).toBe(false);
    // where it was: the API keeps its place
    expect(up.nodes.find((x) => x.id === api.id)).toMatchObject({ x: api.x, y: api.y });
  });

  it("unlinks a copy, and never stores links inside the library", () => {
    const copy = instantiateLibraryContent(content, { x: 0, y: 0 }, newId, { item: "it1", rev });
    const doc = { nodes: copy.nodes, edges: copy.edges };
    const inst = libraryInstances(doc)[0].instance;
    expect(libraryInstances(unlinkInstance(doc, inst))).toEqual([]);
    expect(normalizeLibraryContent(doc).nodes.every((x) => !x.data.libraryRef)).toBe(true);
  });
});
