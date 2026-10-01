import { describe, expect, it } from "vitest";
import { normalizeDocument, type PlanDocument } from "./plan";
import { COLLAPSED_HEIGHT, contentSignature, fromFlow, toFlowEdges, toFlowNodes } from "./canvas-adapter";

const doc: PlanDocument = normalizeDocument({
  schemaVersion: 1,
  viewport: { x: 10, y: -20, zoom: 1.25 },
  nodes: [
    // child listed before its parent on purpose
    { id: "pix", kind: "block", x: 20, y: 48, width: 92, height: 60, parentId: "pay", data: { title: "PIX", status: "production" } },
    { id: "pay", kind: "container", x: 276, y: 316, width: 340, height: 196, z: 2, data: { title: "Pagamentos", color: "#FFEADB" } },
    { id: "gw", kind: "block", x: 346, y: 176, width: 200, height: 72, data: { title: "API Gateway", icon: "shield", tags: ["gateway"], resource: { type: "url", url: "https://example.com/docs" }, openIn: "modal" } },
    { id: "note", kind: "note", x: 48, y: 40, width: 220, height: 92, data: { title: "Atenção", description: "Validar SLA" } },
  ],
  edges: [
    { id: "e1", source: "gw", target: "pix", kind: "flow", label: "REST", sourceHandle: "b", targetHandle: "t" },
    { id: "e2", source: "note", target: "gw", kind: "dependency" },
    { id: "e3", source: "pay", target: "gw", kind: "strong" },
    { id: "e4", source: "pay", target: "note", kind: "relation", description: "contexto" },
  ],
});

describe("canvas adapter", () => {
  it("round-trips a document losslessly", () => {
    const back = fromFlow(toFlowNodes(doc), toFlowEdges(doc), doc.viewport);
    expect(back).toEqual(doc);
    expect(contentSignature(back)).toBe(contentSignature(doc));
  });

  it("orders parents before children and keeps relative child positions", () => {
    const nodes = toFlowNodes(doc);
    const iParent = nodes.findIndex((n) => n.id === "pay");
    const iChild = nodes.findIndex((n) => n.id === "pix");
    expect(iParent).toBeLessThan(iChild);
    const child = nodes[iChild];
    expect(child.parentId).toBe("pay");
    expect(child.position).toEqual({ x: 20, y: 48 });
    expect(child.extent).toBeUndefined();
  });

  it("maps sizes, z-index and kinds", () => {
    const pay = toFlowNodes(doc).find((n) => n.id === "pay")!;
    expect(pay.type).toBe("container");
    expect(pay.width).toBe(340);
    expect(pay.height).toBe(196);
    expect(pay.zIndex).toBe(2);
  });

  it("styles edges by kind", () => {
    const edges = toFlowEdges(doc);
    const byId = Object.fromEntries(edges.map((e) => [e.id, e]));
    expect(byId.e1.type).toBe("plan");
    expect(byId.e1.markerEnd).toMatchObject({ type: "arrowclosed" });
    expect(byId.e2.markerEnd).toMatchObject({ type: "arrowclosed" });
    expect(byId.e3.markerEnd).toBeUndefined();
    expect(byId.e4.markerEnd).toBeUndefined();
    expect(byId.e1.sourceHandle).toBe("b");
    expect(byId.e1.data?.label).toBe("REST");
  });

  it("collapses containers: hides descendants and restores the real height", () => {
    const collapsed: PlanDocument = { ...doc, nodes: doc.nodes.map((n) => (n.id === "pay" ? { ...n, data: { ...n.data, collapsed: true } } : n)) };
    const nodes = toFlowNodes(collapsed);
    const pay = nodes.find((n) => n.id === "pay")!;
    expect(pay.height).toBe(COLLAPSED_HEIGHT);
    expect(nodes.find((n) => n.id === "pix")!.hidden).toBe(true);
    const back = fromFlow(nodes, toFlowEdges(collapsed), collapsed.viewport);
    expect(back.nodes.find((n) => n.id === "pay")!.height).toBe(196);
    expect(back.nodes.find((n) => n.id === "pay")!.data).not.toHaveProperty("_h");
  });

  it("reads React Flow resize results (width/height, measured, style)", () => {
    const nodes = toFlowNodes(doc).map((n) => (n.id === "gw" ? { ...n, width: undefined, height: undefined, measured: { width: 250.04, height: 90 } } : n));
    const back = fromFlow(nodes, [], doc.viewport);
    const gw = back.nodes.find((n) => n.id === "gw")!;
    expect(gw.width).toBe(250);
    expect(gw.height).toBe(90);
  });

  it("drops edges whose endpoints no longer exist", () => {
    const nodes = toFlowNodes(doc).filter((n) => n.id !== "note");
    const back = fromFlow(nodes, toFlowEdges(doc), doc.viewport);
    expect(back.edges.map((e) => e.id).sort()).toEqual(["e1", "e3"]);
  });

  it("produces documents that pass validation", () => {
    const back = fromFlow(toFlowNodes(doc), toFlowEdges(doc), { x: 1.23456, y: 2, zoom: 0.83333 });
    expect(() => normalizeDocument(back)).not.toThrow();
    expect(back.viewport.zoom).toBeCloseTo(0.833, 3);
  });

  it("marks selection and read-only flags", () => {
    const nodes = toFlowNodes(doc, { selected: new Set(["gw"]), readOnly: true });
    const gw = nodes.find((n) => n.id === "gw")!;
    expect(gw.selected).toBe(true);
    expect(gw.draggable).toBe(false);
    expect(gw.connectable).toBe(false);
  });
});
