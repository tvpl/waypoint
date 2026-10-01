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
