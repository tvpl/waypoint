import { describe, expect, it } from "vitest";
import { normalizeDocument, type PlanDocument } from "@/domain/plan";
import { centerOn, fromExcalidraw, hexOf, parseLibrary, parseScene, toClipboard, toExcalidraw, toExcalidrawLib, type ExElement } from "./excalidraw";
import { embedInPng, embedInSvg, readSceneFile, sceneFromPng, sceneFromSvg } from "./excalidraw-file";

const doc: PlanDocument = normalizeDocument({
  viewport: { x: 0, y: 0, zoom: 1 },
  layers: [
    { id: "base", name: "Base", visible: true },
    { id: "prop", name: "Proposta", visible: true, sketch: true, color: "#2F4FD8" },
    { id: "hid", name: "Oculta", visible: false },
  ],
  views: [{ id: "v1", name: "Hoje", layers: ["base"] }],
  nodes: [
    { id: "a", kind: "shape", x: 0, y: 0, width: 160, height: 80, data: { title: "Pedido", shape: { type: "rect", fill: "#A5D8FF", stroke: "#1971C2" } } },
    { id: "b", kind: "shape", x: 300, y: 0, width: 120, height: 120, data: { title: "", shape: { type: "diamond" } } },
    { id: "n", kind: "note", x: 0, y: 200, width: 200, height: 100, data: { title: "Lembrar", description: "Fila nova", color: "#FFF3C4", status: "planned" } },
    { id: "f", kind: "frame", x: 600, y: 0, width: 400, height: 300, layer: "prop", data: { title: "Quadro A" } },
    { id: "c", kind: "block", x: 40, y: 60, width: 200, height: 72, parentId: "f", layer: "prop", data: { title: "Serviço", resource: { type: "url", url: "https://example.com" } } },
    { id: "h", kind: "block", x: 0, y: 500, width: 200, height: 72, layer: "hid", data: { title: "Escondido" } },
    { id: "i", kind: "ink", x: 0, y: 400, width: 100, height: 50, data: { title: "", color: "#E03131", ink: { points: [0, 0, 50, 25, 100, 50], w: 100, h: 50, size: 4 } } },
  ],
  edges: [
    { id: "e1", source: "a", target: "b", kind: "flow", label: "envia", step: 2, style: { end: "arrow", routing: "straight", roughness: 1 } },
    { id: "e2", source: "b", target: "c", kind: "dependency", layer: "prop" },
    { id: "e3", source: "a", target: "h", kind: "flow" },
  ],
});

describe("excalidraw export", () => {
  const scene = toExcalidraw(doc, { title: "Arquitetura", now: 1 });
  const byId = new Map(scene.elements.map((e) => [e.id, e]));

  it("maps shapes, boxes, frames, strokes and bound arrows", () => {
    expect(scene.type).toBe("excalidraw");
    expect(byId.get("a")).toMatchObject({ type: "rectangle", backgroundColor: "#A5D8FF", strokeColor: "#1971C2", roundness: { type: 3 } });
    expect(byId.get("a:t")).toMatchObject({ type: "text", containerId: "a", originalText: "Pedido" });
    expect(byId.get("b")?.type).toBe("diamond");
    expect(byId.get("n")).toMatchObject({ type: "rectangle", backgroundColor: "#FFF3C4" });
    expect(byId.get("n:t")?.originalText).toBe("Lembrar\n\nFila nova");
    expect(byId.get("f")).toMatchObject({ type: "frame", name: "Quadro A" });
    // children sit in their frame, at absolute coordinates, before it
    expect(byId.get("c")).toMatchObject({ frameId: "f", x: 640, y: 60, link: "https://example.com", roughness: 1 });
    expect(scene.elements.findIndex((e) => e.id === "c")).toBeLessThan(scene.elements.findIndex((e) => e.id === "f"));
    expect(byId.get("i")).toMatchObject({ type: "freedraw", strokeColor: "#E03131" });
    const e1 = byId.get("e1")!;
    expect(e1).toMatchObject({ type: "arrow", startBinding: { elementId: "a" }, endBinding: { elementId: "b" }, endArrowhead: "arrow", roughness: 1 });
    expect(byId.get("e1:t")?.originalText).toBe("2. envia");
    expect(byId.get("a")?.boundElements).toEqual(expect.arrayContaining([{ id: "e1", type: "arrow" }, { id: "a:t", type: "text" }]));
    expect(byId.get("e2")).toMatchObject({ strokeStyle: "dashed", endArrowhead: "arrow" });
  });

  it("leaves hidden layers out", () => {
    expect(byId.has("h")).toBe(false);
    expect(byId.has("e3")).toBe(false);
    const all = toExcalidraw(doc, { visible: () => true, now: 1 });
    expect(all.elements.some((e) => e.id === "h")).toBe(true);
  });

  it("comes back as the same plan (kinds, layers, steps, parents)", () => {
    const back = fromExcalidraw(parseScene(JSON.parse(JSON.stringify(scene)))!);
    const n = new Map(back.nodes.map((x) => [x.id, x]));
    expect(back.title).toBe("Arquitetura");
    expect(back.layers.map((l) => l.id)).toEqual(["prop"]);
    expect(back.layers[0]).toMatchObject({ name: "Proposta", sketch: true });
    expect(back.views).toEqual([{ id: "v1", name: "Hoje", layers: ["base"] }]);
    expect(n.get("a")).toMatchObject({ kind: "shape", x: 0, y: 0, width: 160, data: { title: "Pedido", shape: { type: "rect", fill: "#A5D8FF", stroke: "#1971C2" } } });
    expect(n.get("n")).toMatchObject({ kind: "note", data: { title: "Lembrar", description: "Fila nova", status: "planned" } });
    expect(n.get("c")).toMatchObject({ kind: "block", parentId: "f", x: 40, y: 60, layer: "prop", data: { title: "Serviço", resource: { url: "https://example.com" } } });
    expect(n.get("f")).toMatchObject({ kind: "frame", layer: "prop" });
    expect(n.get("i")).toMatchObject({ kind: "ink", data: { color: "#E03131" } });
    expect(n.get("i")!.data.ink!.size).toBeCloseTo(4, 0);
    const e = new Map(back.edges.map((x) => [x.id, x]));
    expect(e.get("e1")).toMatchObject({ source: "a", target: "b", label: "envia", step: 2, style: { end: "arrow", routing: "straight", roughness: 1 } });
    expect(e.get("e2")).toMatchObject({ kind: "dependency", layer: "prop" });
    expect(e.get("e2")!.style).toBeUndefined();
    // and it is a valid plan
    expect(() => normalizeDocument({ viewport: { x: 0, y: 0, zoom: 1 }, nodes: back.nodes, edges: back.edges, layers: back.layers })).not.toThrow();
  });

  it("copies in Excalidraw's clipboard format", () => {
    expect(JSON.parse(toClipboard(scene))).toMatchObject({ type: "excalidraw/clipboard", elements: expect.any(Array) });
  });
});

describe("excalidraw import", () => {
  const el = (p: Partial<ExElement> & Pick<ExElement, "id" | "type">): ExElement => ({ x: 0, y: 0, width: 100, height: 50, strokeColor: "#1e1e1e", backgroundColor: "transparent", roughness: 1, ...p });
  const scene = {
    type: "excalidraw",
    elements: [
      el({ id: "r", type: "rectangle", backgroundColor: "#ffc9c9", fillStyle: "hachure", roundness: { type: 3 }, boundElements: [{ id: "rt", type: "text" }] }),
      el({ id: "rt", type: "text", text: "Olá", originalText: "Olá", containerId: "r", fontFamily: 5, fontSize: 28 }),
      el({ id: "o", type: "ellipse", x: 300, strokeColor: "#e03131" }),
      el({ id: "ar", type: "arrow", x: 100, y: 25, points: [[0, 0], [200, 0]], startBinding: { elementId: "r" }, endBinding: { elementId: "o" }, endArrowhead: "triangle", startArrowhead: null }),
      el({ id: "free", type: "arrow", x: 0, y: 200, points: [[0, 0], [50, 30], [120, 0]], endArrowhead: "arrow" }),
      el({ id: "t", type: "text", x: 10, y: 300, text: "Nota solta", fontFamily: 2, fontSize: 20, textAlign: "left" }),
      el({ id: "d", type: "freedraw", x: 400, y: 300, points: [[0, 0], [10, 5], [20, 0]], strokeWidth: 2 }),
      el({ id: "fr", type: "frame", x: 500, y: 0, width: 300, height: 200, name: "Tela" }),
      el({ id: "in", type: "diamond", x: 550, y: 50, frameId: "fr" }),
      el({ id: "gone", type: "rectangle", isDeleted: true }),
      el({ id: "img", type: "image", x: 0, y: 600, fileId: "F1" }),
    ],
    files: { F1: { id: "F1", mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" } },
  };
  const out = fromExcalidraw(parseScene(scene)!);
  const n = new Map(out.nodes.map((x) => [x.id, x]));

  it("turns shapes, texts, frames and strokes into plan elements", () => {
    expect(n.get("r")).toMatchObject({ kind: "shape", data: { title: "Olá", shape: { type: "rect", fill: "#FFC9C9", fillStyle: "hachure", roughness: 1, font: "hand", fontSize: 28 } } });
    expect(n.get("r")!.data.shape!.stroke).toBeUndefined();
    expect(n.get("o")!.data.shape).toMatchObject({ type: "ellipse", stroke: "#E03131" });
    expect(n.has("rt")).toBe(false);
    expect(n.get("t")).toMatchObject({ kind: "shape", data: { title: "Nota solta", shape: { type: "text" } } });
    expect(n.get("d")).toMatchObject({ kind: "ink" });
    expect(n.get("fr")).toMatchObject({ kind: "frame", data: { title: "Tela" } });
    expect(n.get("in")).toMatchObject({ parentId: "fr", x: 50, y: 50 });
    expect(out.nodes.findIndex((x) => x.id === "fr")).toBeLessThan(out.nodes.findIndex((x) => x.id === "in"));
    expect(n.has("gone")).toBe(false);
    expect(out.images).toEqual([{ nodeId: "img", file: scene.files.F1 }]);
  });

  it("binds arrows between shapes and keeps loose ones as strokes", () => {
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]).toMatchObject({ source: "r", target: "o", style: { end: "triangle", routing: "straight", roughness: 1 } });
    const free = n.get("free")!;
    expect(free.kind).toBe("ink");
    expect(free.data.ink).toMatchObject({ arrow: true });
    expect(free.data.ink!.points).toHaveLength(6);
  });

  it("renames ids on request and recenters", () => {
    let i = 0;
    const renamed = fromExcalidraw(parseScene(scene)!, { newId: () => `x${++i}` });
    expect(renamed.nodes.every((x) => x.id.startsWith("x"))).toBe(true);
    const ids = new Set(renamed.nodes.map((x) => x.id));
    expect(renamed.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
    const moved = centerOn(renamed.nodes, { x: 0, y: 0 });
    const top = moved.filter((x) => !x.parentId);
    const minX = Math.min(...top.map((x) => x.x));
    const maxX = Math.max(...top.map((x) => x.x + x.width));
    expect(Math.abs(minX + maxX)).toBeLessThanOrEqual(2);
  });

  it("rejects what isn't a scene", () => {
    expect(parseScene({ nodes: [] })).toBeNull();
    expect(parseScene("x")).toBeNull();
    expect(hexOf("#abc")).toBe("#AABBCC");
    expect(hexOf("transparent")).toBeUndefined();
  });
});

describe("excalidraw files", () => {
  const scene = toExcalidraw(doc, { now: 1 });
  // A minimal PNG: signature, IHDR, IEND (chunk CRCs aren't checked by the reader).
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

  it("embeds the scene in a PNG and reads it back", async () => {
    const out = await embedInPng(png, scene);
    expect(out.length).toBeGreaterThan(png.length);
    const back = (await sceneFromPng(out)) as typeof scene;
    expect(back.elements.length).toBe(scene.elements.length);
    expect(await sceneFromPng(png)).toBeNull();
    const file = new File([out as BlobPart], "plan.png", { type: "image/png" });
    expect((await readSceneFile(file))?.elements.length).toBe(scene.elements.length);
  });

  it("embeds the scene in an SVG and reads it back", async () => {
    const svg = await embedInSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>', scene);
    expect(svg).toContain("<!-- svg-source:excalidraw -->");
    const back = (await sceneFromSvg(svg)) as typeof scene;
    expect(back.elements.map((e) => e.id)).toEqual(scene.elements.map((e) => e.id));
  });

  it("reads .excalidraw files", async () => {
    const file = new File([JSON.stringify(scene)], "a.excalidraw", { type: "" });
    expect((await readSceneFile(file))?.elements.length).toBe(scene.elements.length);
    expect(await readSceneFile(new File(["{}"], "b.json"))).toBeNull();
  });
});

describe("icons and libraries", () => {
  const glyph = { id: "lucide:database", viewBox: "0 0 24 24", paths: ["M3 5V19A9 3 0 0 0 21 19V5", "M3 12A9 3 0 0 0 21 12"] };
  const iconDoc = normalizeDocument({
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: "ic", kind: "shape", x: 0, y: 0, width: 64, height: 88, data: { title: "Banco", shape: { type: "icon", glyph, stroke: "#1971C2", fill: "#E9ECEF" } } },
      { id: "r", kind: "shape", x: 200, y: 0, width: 100, height: 60, data: { title: "", shape: { type: "rect" } } },
    ],
    edges: [{ id: "e", source: "r", target: "ic", kind: "flow", style: { end: "arrow" } }],
  });

  it("exports an icon as an SVG image with its label, and brings it back", () => {
    const scene = toExcalidraw(iconDoc, { now: 1 });
    const img = scene.elements.find((e) => e.id === "ic")!;
    expect(img).toMatchObject({ type: "image", width: 64, height: 64 });
    const file = scene.files[img.fileId!];
    expect(file.mimeType).toBe("image/svg+xml");
    expect(atob(file.dataURL.split(",")[1])).toContain('stroke="#1971C2"');
    const label = scene.elements.find((e) => e.id === "ic:t")!;
    expect(label).toMatchObject({ text: "Banco", groupIds: img.groupIds });
    expect(scene.elements.find((e) => e.id === "e")?.endBinding?.elementId).toBe("ic");

    const back = fromExcalidraw(parseScene(JSON.parse(JSON.stringify(scene)))!);
    const ic = back.nodes.find((n) => n.id === "ic")!;
    expect(ic).toMatchObject({ kind: "shape", width: 64, height: 88, data: { title: "Banco", shape: { type: "icon", glyph, fill: "#E9ECEF" } } });
    expect(back.nodes.some((n) => n.id === "ic:t")).toBe(false);
    expect(back.images).toEqual([]);
    expect(back.edges[0]).toMatchObject({ source: "r", target: "ic" });
  });

  it("reads and writes Excalidraw libraries", () => {
    const lib = JSON.parse(toExcalidrawLib([{ id: "i1", name: "Banco", nodes: iconDoc.nodes, edges: iconDoc.edges }], 1));
    expect(lib).toMatchObject({ type: "excalidrawlib", version: 2, libraryItems: [{ id: "i1", name: "Banco", status: "unpublished" }] });
    const items = parseLibrary(lib)!;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Banco");
    // version 1: a list of element lists
    const v1 = parseLibrary({ type: "excalidrawlib", version: 1, library: [[{ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }], []] })!;
    expect(v1).toHaveLength(1);
    expect(parseLibrary({ type: "excalidraw", elements: [] })).toBeNull();
  });
});
