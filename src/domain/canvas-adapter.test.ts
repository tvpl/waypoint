import { describe, expect, it } from "vitest";
import { normalizeDocument, type PlanDocument } from "./plan";
import { COLLAPSED_HEIGHT, contentSignature, flowFingerprint, fromFlow, sameFingerprint, toFlowEdges, toFlowNodes } from "./canvas-adapter";

const doc: PlanDocument = normalizeDocument({
  schemaVersion: 1,
  viewport: { x: 10, y: -20, zoom: 1.25 },
  nodes: [
    // child listed before its parent on purpose
    { id: "pix", kind: "block", x: 20, y: 48, width: 92, height: 60, parentId: "pay", data: { title: "PIX", status: "production" } },
    { id: "pay", kind: "container", x: 276, y: 316, width: 340, height: 196, z: 2, data: { title: "Pagamentos", color: "#FFEADB", presentation: { hidden: true } } },
    { id: "gw", kind: "block", x: 346, y: 176, width: 200, height: 72, data: { title: "API Gateway", icon: "shield", tags: ["gateway"], resource: { type: "url", url: "https://example.com/docs" }, openIn: "modal" } },
    { id: "note", kind: "note", x: 48, y: 40, width: 220, height: 92, data: { title: "Atenção", description: "Validar SLA", presentation: { order: 3 } } },
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
    const d: PlanDocument = { ...doc, edges: doc.edges.map((e) => ({ ...e, sourceHandle: e.sourceHandle ?? "r", targetHandle: e.targetHandle ?? "l" })) };
    const back = fromFlow(toFlowNodes(d), toFlowEdges(d), d.viewport);
    expect(back).toEqual(d);
    expect(contentSignature(back)).toBe(contentSignature(d));
    expect(back.nodes.find((n) => n.id === "note")?.data.presentation).toEqual({ order: 3 });
    expect(back.nodes.find((n) => n.id === "pay")?.data.presentation).toEqual({ hidden: true });
    // a second pass is stable
    expect(contentSignature(fromFlow(toFlowNodes(back), toFlowEdges(back), back.viewport))).toBe(contentSignature(d));
  });

  it("fills missing handles from node geometry (parent-aware)", () => {
    const byId = Object.fromEntries(toFlowEdges(doc).map((e) => [e.id, e]));
    // note (left/top) → gateway: mostly horizontal
    expect([byId.e2.sourceHandle, byId.e2.targetHandle]).toEqual(["r", "l"]);
    // container (below) → gateway (above): vertical, going up
    expect([byId.e3.sourceHandle, byId.e3.targetHandle]).toEqual(["t", "b"]);
    // explicit handles are kept
    expect([byId.e1.sourceHandle, byId.e1.targetHandle]).toEqual(["b", "t"]);
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

describe("flowFingerprint", () => {
  const data = { title: "A" };
  const node = { id: "a", type: "block", position: { x: 1, y: 2 }, width: 10, height: 20, data };
  it("ignores selection but sees moves and data changes", () => {
    const fp = flowFingerprint([node], []);
    expect(sameFingerprint(fp, flowFingerprint([{ ...node, selected: true } as typeof node], []))).toBe(true);
    expect(sameFingerprint(fp, flowFingerprint([{ ...node, position: { x: 2, y: 2 } }], []))).toBe(false);
    expect(sameFingerprint(fp, flowFingerprint([{ ...node, data: { ...data } }], []))).toBe(false);
    expect(sameFingerprint(fp, flowFingerprint([node], [{ id: "e", source: "a", target: "a" }]))).toBe(false);
    expect(sameFingerprint(null, fp)).toBe(false);
  });
});

describe("locked and hidden elements", () => {
  const d: PlanDocument = {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === "pay" ? { ...n, data: { ...n.data, hidden: true } } : n.id === "gw" ? { ...n, data: { ...n.data, locked: true } } : n)),
  };
  const flow = toFlowNodes(d);
  const byId = Object.fromEntries(flow.map((n) => [n.id, n]));

  it("hides an element with what is inside it, and keeps a locked one still and unselectable", () => {
    expect(byId.pay.hidden).toBe(true);
    expect(byId.pix.hidden).toBe(true);
    expect(byId.note.hidden).toBeUndefined();
    expect(byId.gw).toMatchObject({ draggable: false, selectable: false, deletable: false, className: "wp-locked" });
    expect(toFlowNodes(d, { readOnly: true }).find((n) => n.id === "gw")?.className).toBeUndefined();
  });

  it("keeps both flags in the document", () => {
    const back = fromFlow(flow, toFlowEdges(d), d.viewport);
    expect(back.nodes.find((n) => n.id === "pay")?.data.hidden).toBe(true);
    expect(back.nodes.find((n) => n.id === "gw")?.data.locked).toBe(true);
  });
});
