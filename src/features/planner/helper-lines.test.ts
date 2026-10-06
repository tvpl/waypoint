import { describe, expect, it } from "vitest";
import { helperLines } from "./helper-lines";

const box = (id: string, x: number, y: number, width = 100, height = 40) => ({ id, x, y, width, height });

describe("helperLines", () => {
  it("snaps left edges and draws a vertical guide", () => {
    const g = helperLines(box("a", 203, 300), [box("b", 200, 100)], 6);
    expect(g.x).toBe(200);
    expect(g.vertical).toEqual({ x: 200, y1: 100, y2: 340 });
    expect(g.y).toBeUndefined();
  });
  it("snaps centers and middles", () => {
    const g = helperLines(box("a", 52, 98, 100, 40), [box("b", 0, 100, 200, 36)], 6);
    expect(g.x).toBe(50); // centers: 102 → 100
    expect(g.y).toBe(98); // middle 118 vs 118
  });
  it("ignores far boxes and itself", () => {
    expect(helperLines(box("a", 0, 0), [box("a", 0, 0), box("b", 500, 500)], 6)).toEqual({});
  });
});

describe("equal spacing", () => {
  it("centers a box between its two neighbors", () => {
    const g = helperLines(box("d", 203, 0), [box("a", 0, 0), box("b", 400, 0)], 6);
    // free room 400-100-100 = 200 → 100 on each side
    expect(g.x).toBe(200);
    expect(g.spacing).toEqual([
      { axis: "x", from: 100, to: 200, at: 20, gap: 100 },
      { axis: "x", from: 300, to: 400, at: 20, gap: 100 },
    ]);
  });

  it("repeats a gap already used in the row", () => {
    const g = helperLines(box("d", 283, 300), [box("a", 0, 300), box("b", 140, 300)], 6);
    // a → b leaves 40; d goes 40 after b
    expect(g.x).toBe(280);
    expect(g.spacing?.map((s) => s.gap)).toEqual([40, 40]);
  });

  it("ignores boxes in other rows", () => {
    const g = helperLines(box("d", 248, 500), [box("a", 0, 0), box("b", 400, 0)], 6);
    expect(g.spacing).toBeUndefined();
  });
});
