import { describe, expect, it } from "vitest";
import { normalizeDocument, type PlanDocument } from "./plan";
import { contentSignature, fromFlow, toFlowEdges, toFlowNodes } from "./canvas-adapter";
import { avoidanceBoxes } from "@/features/planner/edge-routing";

/** A plan of 2,000 elements and 1,500 connections, laid out on a grid. */
function bigPlan(): PlanDocument {
  const nodes = [] as PlanDocument["nodes"];
  for (let i = 0; i < 2000; i++) nodes.push({ id: `n${i}`, kind: "block", x: (i % 50) * 260, y: Math.floor(i / 50) * 160, width: 200, height: 72, data: { title: `Elemento ${i}` } });
  const edges = [] as PlanDocument["edges"];
  for (let i = 0; i < 1500; i++) {
    const a = (i * 7919) % 2000;
    const b = Math.min(1999, a + 1 + ((i * 31) % 60));
    if (a !== b) edges.push({ id: `e${i}`, source: `n${a}`, target: `n${b}`, kind: "flow" });
  }
  return normalizeDocument({ viewport: { x: 0, y: 0, zoom: 1 }, nodes, edges });
}

const timed = (fn: () => unknown) => {
  fn();
  const t = performance.now();
  fn();
  return performance.now() - t;
};

// Generous limits (CI machines vary): they catch accidental O(n²) work, not small slowdowns.
describe("big plans stay fast", () => {
  const doc = bigPlan();
  const flowNodes = toFlowNodes(doc);
  const flowEdges = toFlowEdges(doc);

  it("converts to and from the canvas in linear time", () => {
    expect(timed(() => toFlowNodes(doc))).toBeLessThan(60);
    expect(timed(() => toFlowEdges(doc))).toBeLessThan(60);
    expect(timed(() => fromFlow(flowNodes, flowEdges, doc.viewport))).toBeLessThan(80);
    expect(timed(() => contentSignature(doc))).toBeLessThan(120);
  });

  it("finds what elbow connections go around without scanning everything per connection", () => {
    expect(timed(() => avoidanceBoxes(flowNodes, flowEdges))).toBeLessThan(250);
  });
});
