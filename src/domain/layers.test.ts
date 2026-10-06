import { describe, expect, it } from "vitest";
import {
  activeView,
  addLayer,
  applyView,
  assignLayer,
  BASE_LAYER_ID,
  hiddenByLayers,
  layersOf,
  layerVisibility,
  moveLayer,
  removeLayer,
  removeView,
  saveView,
  soloLayer,
  syncNodeLayers,
  updateLayer,
} from "./layers";
import { normalizeDocument, type PlanDocument, type PlanNode } from "./plan";
import { contentSignature, fromFlow, toFlowEdges, toFlowNodes } from "./canvas-adapter";

const node = (id: string, extra: Partial<PlanNode> = {}): PlanNode => ({ id, kind: "block", x: 0, y: 0, width: 100, height: 50, data: { title: id }, ...extra });
const doc = (over: Partial<PlanDocument> = {}): PlanDocument => ({
  schemaVersion: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [node("a"), node("area", { kind: "container", width: 400, height: 300 }), node("child", { parentId: "area" })],
  edges: [{ id: "e1", source: "a", target: "child", kind: "flow", sourceHandle: "b", targetHandle: "t" }],
  ...over,
});

describe("layers", () => {
  it("has an implicit base layer that is only stored once edited", () => {
    expect(layersOf(doc()).map((l) => l.id)).toEqual([BASE_LAYER_ID]);
    const renamed = updateLayer(doc(), BASE_LAYER_ID, { name: "Atual" });
    expect(renamed.layers?.[0]).toMatchObject({ id: BASE_LAYER_ID, name: "Atual" });
    expect(updateLayer(renamed, BASE_LAYER_ID, { name: "Base" }).layers).toBeUndefined();
  });

  it("adds layers on top with distinct colors and moves them", () => {
    const { doc: d1, id: p } = addLayer(doc(), "Proposta");
    const { doc: d2, id: q } = addLayer(d1);
    expect(layersOf(d2).map((l) => l.name)).toEqual(["Base", "Proposta", "Camada 3"]);
    expect(layersOf(d2)[1].color).not.toBe(layersOf(d2)[2].color);
    expect(layersOf(moveLayer(d2, q, "down")).map((l) => l.id)).toEqual([BASE_LAYER_ID, q, p]);
    expect(moveLayer(d2, q, "up")).toBe(d2);
  });

  it("assigns a whole area (and what is inside) to a layer", () => {
    const { doc: d1, id } = addLayer(doc());
    const d2 = assignLayer(d1, id, { nodes: ["child"], edges: ["e1"] });
    expect(d2.nodes.find((n) => n.id === "area")?.layer).toBe(id);
    expect(d2.nodes.find((n) => n.id === "child")?.layer).toBe(id);
    expect(d2.nodes.find((n) => n.id === "a")?.layer).toBeUndefined();
    expect(d2.edges[0].layer).toBe(id);
    const back = assignLayer(d2, BASE_LAYER_ID, { nodes: ["area"] });
    expect(back.nodes.every((n) => n.layer === undefined)).toBe(true);
  });

  it("children follow their top-level ancestor", () => {
    const nodes = syncNodeLayers([node("area", { kind: "container", layer: "x" }), node("child", { parentId: "area" }), node("loose", { layer: "base" })]);
    expect(nodes.map((n) => n.layer)).toEqual(["x", "x", undefined]);
  });

  it("removes a layer merging its content down, or deleting it", () => {
    const { doc: d1, id } = addLayer(doc());
    const d2 = assignLayer(d1, id, { nodes: ["a"] });
    const merged = removeLayer(d2, id, "merge");
    expect(merged.nodes.find((n) => n.id === "a")?.layer).toBeUndefined();
    expect(merged.layers).toBeUndefined();
    const deleted = removeLayer(d2, id, "delete");
    expect(deleted.nodes.map((n) => n.id)).toEqual(["area", "child"]);
    expect(deleted.edges).toEqual([]);
    expect(removeLayer(d2, BASE_LAYER_ID, "delete")).toBe(d2);
  });

  it("hides nodes of hidden layers and the edges that touch them", () => {
    const { doc: d1, id } = addLayer(doc());
    const d2 = updateLayer(assignLayer(d1, id, { nodes: ["a"] }), id, { visible: false });
    const hidden = hiddenByLayers(d2, layerVisibility(d2));
    expect([...hidden.nodes]).toEqual(["a"]);
    expect([...hidden.edges]).toEqual(["e1"]);
    // a viewer can turn it back on without changing the document
    expect(hiddenByLayers(d2, layerVisibility(d2, { [id]: true })).nodes.size).toBe(0);
  });

  it("solo, saved views and the active view", () => {
    const { doc: d1, id } = addLayer(doc(), "Proposta");
    const { doc: d2, id: other } = addLayer(d1, "Notas");
    const solo = soloLayer(d2, id);
    expect(layersOf(solo).map((l) => l.visible)).toEqual([true, true, false]);
    const { doc: d3, id: view } = saveView(solo, "Só a proposta");
    expect(d3.views?.[0].layers).toEqual([BASE_LAYER_ID, id]);
    const all = updateLayer(d3, other, { visible: true });
    expect(activeView(all, layerVisibility(all))).toBeNull();
    const applied = applyView(all, view);
    expect(activeView(applied, layerVisibility(applied))).toBe(view);
    expect(removeView(applied, view).views).toBeUndefined();
  });
});

describe("layers in documents and on the canvas", () => {
  it("normalizes unknown layers away and keeps children with their area", () => {
    const d = normalizeDocument({
      ...doc(),
      layers: [{ id: "p", name: "Proposta", visible: true }],
      nodes: [node("a", { layer: "ghost" }), node("area", { kind: "container", layer: "p" }), node("child", { parentId: "area" })],
      views: [{ id: "v", name: "V", layers: ["p", "ghost", "base"] }],
    });
    expect(d.nodes.map((n) => n.layer)).toEqual([undefined, "p", "p"]);
    expect(d.views?.[0].layers).toEqual(["p", "base"]);
  });

  it("stacks layers, hides, locks and animates on the canvas and round-trips", () => {
    const { doc: d1, id } = addLayer(doc());
    const d2 = updateLayer(assignLayer(d1, id, { nodes: ["a"], edges: ["e1"] }), id, { locked: true, animate: true });
    const nodes = toFlowNodes(d2);
    const a = nodes.find((n) => n.id === "a")!;
    expect(a.zIndex).toBe(1000);
    expect(a.draggable).toBe(false);
    const edges = toFlowEdges(d2);
    expect(edges[0]).toMatchObject({ zIndex: 1001, animated: true, selectable: false });
    const back = { ...fromFlow(nodes, edges, d2.viewport), layers: d2.layers };
    expect(contentSignature(back)).toBe(contentSignature(d2));
    // read-only rendering ignores locks
    expect(toFlowNodes(d2, { readOnly: true }).find((n) => n.id === "a")?.draggable).toBe(false);
    const hidden = toFlowNodes(updateLayer(d2, id, { visible: false })).find((n) => n.id === "a");
    expect(hidden?.hidden).toBe(true);
  });
});
