import { describe, expect, it } from "vitest";
import type { PlanDocument, PlanEdge, PlanNode } from "@/domain/plan";
import { clearSteps, flowOrder, numberFlow, stepTargets } from "./flow-steps";

const n = (id: string, x: number, y: number): PlanNode => ({ id, kind: "block", x, y, width: 100, height: 50, data: { title: id } });
const e = (id: string, source: string, target: string, extra: Partial<PlanEdge> = {}): PlanEdge => ({ id, source, target, kind: "flow", ...extra });

// start → (a, b) → end, plus a loop end → start
const doc = (): PlanDocument => ({
  schemaVersion: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [n("end", 600, 0), n("b", 300, 200), n("start", 0, 0), n("a", 300, 0)],
  edges: [e("toEnd2", "b", "end"), e("toB", "start", "b"), e("toEnd1", "a", "end"), e("toA", "start", "a"), e("other", "a", "b", { layer: "x" })],
});

describe("flow steps", () => {
  it("numbers connections breadth-first from where the flow starts, branches in reading order", () => {
    const ids = ["toEnd2", "toB", "toEnd1", "toA"];
    expect(flowOrder(doc(), ids).map((x) => x.id)).toEqual(["toA", "toB", "toEnd1", "toEnd2"]);
    const d = numberFlow(doc(), ids);
    expect(Object.fromEntries(d.edges.map((x) => [x.id, x.step]))).toEqual({ toA: 1, toB: 2, toEnd1: 3, toEnd2: 4, other: undefined });
    expect(clearSteps(d, ["toA"]).edges.find((x) => x.id === "toA")?.step).toBeUndefined();
  });

  it("handles loops and picks targets from the selection", () => {
    const loop: PlanDocument = { ...doc(), edges: [e("x", "a", "b"), e("y", "b", "a")] };
    expect(flowOrder(loop, ["x", "y"]).map((x) => x.id)).toEqual(["x", "y"]);
    const none = new Set<string>();
    expect(stepTargets(doc(), { nodes: none, edges: new Set(["toA"]) }).sort()).toEqual(["toA", "toB", "toEnd1", "toEnd2"]);
    expect(stepTargets(doc(), { nodes: new Set(["start", "a"]), edges: none })).toEqual(["toA"]);
  });
});
