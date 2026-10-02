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
