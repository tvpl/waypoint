import { describe, expect, it } from "vitest";
import type { PlanNode } from "@/domain/plan";
import { ALL_ANNOTATIONS, annotationVisible, legend, pinNumbers } from "./annotations";

const ann = (id: string, type: "pin" | "callout", category: "note" | "risk", extra: Partial<PlanNode> = {}): PlanNode => ({
  id,
  kind: "annotation",
  x: 0,
  y: 0,
  width: 28,
  height: 28,
  data: { title: id, annotation: { type, category } },
  ...extra,
});

describe("annotations", () => {
  const nodes = [ann("c", "callout", "note", { y: 50 }), ann("p1", "pin", "risk"), { id: "b", kind: "block", x: 0, y: 0, width: 10, height: 10, data: { title: "" } } as PlanNode, ann("p2", "pin", "note", { y: 10 })];

  it("numbers pins in the order they were added and lists them first", () => {
    expect([...pinNumbers(nodes)]).toEqual([
      ["p1", 1],
      ["p2", 2],
    ]);
    expect(legend(nodes).map((i) => [i.node.id, i.number])).toEqual([
      ["p1", 1],
      ["p2", 2],
      ["c", undefined],
    ]);
  });

  it("filters by showing, category and resolved", () => {
    const a = { type: "pin" as const, category: "risk" as const };
    expect(annotationVisible(a, ALL_ANNOTATIONS)).toBe(true);
    expect(annotationVisible(a, { ...ALL_ANNOTATIONS, show: false })).toBe(false);
    expect(annotationVisible(a, { ...ALL_ANNOTATIONS, categories: new Set(["note"]) })).toBe(false);
    expect(annotationVisible({ ...a, resolved: true }, ALL_ANNOTATIONS)).toBe(false);
    expect(annotationVisible({ ...a, resolved: true }, { ...ALL_ANNOTATIONS, resolved: true })).toBe(true);
  });
});
