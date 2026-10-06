import { describe, expect, it } from "vitest";
import type { PlanDocument, PlanNode } from "@/domain/plan";
import { activeIdsFor, clearCustomOrder, hasCustomOrder, presentationState, presentationSteps, setIncluded, setOrder } from "./presentation-steps";

const n = (id: string, x: number, y: number, extra: Partial<PlanNode> = {}): PlanNode => ({ id, kind: "block", x, y, width: 200, height: 72, data: { title: id }, ...extra });
const doc = (nodes: PlanNode[]): PlanDocument => ({ schemaVersion: 1, nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

const sample = () =>
  doc([
    n("b2", 600, 20), // top row, right
    n("b1", 0, 30), // top row, left (slightly lower but same row)
    n("secB", 700, 400, { kind: "section", width: 400, height: 300 }),
    n("secA", 0, 400, { kind: "section", width: 400, height: 300 }),
    n("inner", 40, 60, { parentId: "secA" }),
    n("low", 100, 900),
    n("hiddenOne", 300, 900, { data: { title: "x", presentation: { hidden: true } } }),
  ]);

describe("presentation steps", () => {
  it("starts with the overview, then areas, then other top-level nodes in reading order", () => {
    const steps = presentationSteps(sample(), "Plano");
    expect(steps.map((s) => s.nodeId)).toEqual([null, "secA", "secB", "b1", "b2", "low"]);
    expect(steps[0].title).toBe("Plano");
    expect(steps[1].title).toBe("secA");
  });

  it("uses only ordered nodes once a custom order exists", () => {
    let d = sample();
    d = setOrder(d, "inner", 2);
    d = setOrder(d, "b2", 1);
    expect(hasCustomOrder(d)).toBe(true);
    expect(presentationSteps(d, "P").map((s) => s.nodeId)).toEqual([null, "b2", "inner"]);
    expect(presentationSteps(clearCustomOrder(d), "P").map((s) => s.nodeId)).toEqual([null, "secA", "secB", "b1", "b2", "low"]);
  });

  it("including a nested node materializes the automatic order first", () => {
    const d = setIncluded(sample(), "inner", true);
    expect(presentationSteps(d, "P").map((s) => s.nodeId)).toEqual([null, "secA", "secB", "b1", "b2", "low", "inner"]);
    expect(presentationState(d, "inner")).toMatchObject({ included: true, custom: true, position: 6, total: 6 });
  });

  it("excluding and re-including top-level nodes", () => {
    let d = setIncluded(sample(), "b1", false);
    expect(presentationState(d, "b1").included).toBe(false);
    expect(presentationSteps(d, "P").map((s) => s.nodeId)).not.toContain("b1");
    d = setIncluded(d, "hiddenOne", true);
    expect(presentationState(d, "hiddenOne").included).toBe(true);
    expect(hasCustomOrder(d)).toBe(false);
  });

  it("lights a node and its descendants", () => {
    expect(activeIdsFor(sample(), null)).toBeNull();
    expect([...activeIdsFor(sample(), "secA")!].sort()).toEqual(["inner", "secA"]);
  });
});

describe("presentation steps and layers", () => {
  it("skips drawings and nodes on hidden layers (document or viewer)", () => {
    const mk = (id: string, extra: Partial<PlanNode> = {}): PlanNode => ({ id, kind: "block", x: 0, y: 0, width: 100, height: 50, data: { title: id }, ...extra });
    const doc = {
      nodes: [mk("a"), mk("b", { x: 200, layer: "p" }), mk("ink", { kind: "ink", x: 400 })],
      edges: [],
      layers: [
        { id: "base", name: "Base", visible: true },
        { id: "p", name: "Proposta", visible: false },
      ],
    };
    expect(presentationSteps(doc, "T").map((s) => s.nodeId)).toEqual([null, "a"]);
    expect(presentationSteps(doc, "T", { p: true }).map((s) => s.nodeId)).toEqual([null, "a", "b"]);
  });
});

describe("presentation reveals layers", () => {
  it("hides revealed layers until their step, right before their first element", () => {
    const d: PlanDocument = {
      ...doc([n("a", 0, 0), n("b", 300, 0, { layer: "v2" }), n("c", 0, 300, { layer: "notes" }), n("ink", 0, 600, { kind: "ink", layer: "notes" })]),
      layers: [
        { id: "base", name: "v1", visible: true },
        { id: "v2", name: "v2", visible: true, reveal: true },
        { id: "notes", name: "Notas", visible: true },
      ],
    };
    const steps = presentationSteps(d, "Plano");
    expect(steps.map((s) => s.layerId ?? s.nodeId)).toEqual([null, "a", "c", "v2", "b"]);
    expect(steps[0].layers).toEqual({ base: true, v2: false, notes: true });
    expect(steps[3]).toMatchObject({ title: "v2", nodeId: null, layers: { v2: true } });
    // a revealed layer with no steps of its own still appears at the end
    const drawingsOnly = { ...d, layers: d.layers!.map((l) => (l.id === "notes" ? { ...l, reveal: true } : l)), nodes: d.nodes.filter((x) => x.id !== "c") };
    expect(presentationSteps(drawingsOnly, "P").map((s) => s.layerId ?? s.nodeId)).toEqual([null, "a", "v2", "b", "notes"]);
    // without revealed layers nothing changes
    expect(presentationSteps(doc([n("a", 0, 0)]), "P")[0].layers).toBeUndefined();
  });
});
