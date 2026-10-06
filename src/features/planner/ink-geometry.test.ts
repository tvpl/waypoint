import { describe, expect, it } from "vitest";
import { buildInk, buildTextInk, inkFontSize, inkPaths, pairsOf, shapePath, simplify, textBox, type Point } from "./ink-geometry";

describe("ink geometry", () => {
  it("builds a node box around the stroke with points relative to it", () => {
    const r = buildInk(
      [
        [100, 100],
        [150, 120],
        [200, 100],
      ],
      { size: 4, mode: "pen" },
    )!;
    expect(r).toMatchObject({ x: 96, y: 96, width: 108, height: 28 });
    expect(pairsOf(r.ink.points)[0]).toEqual([4, 4]);
    expect(r.ink).toMatchObject({ w: 108, h: 28, size: 4 });
    expect(inkPaths(r.ink).fill.startsWith("M")).toBe(true);
  });

  it("highlighter is wider; arrows keep only their ends and get a head", () => {
    const pts: Point[] = [
      [0, 0],
      [40, 30],
      [80, 0],
    ];
    expect(buildInk(pts, { size: 4, mode: "highlighter" })!.ink).toMatchObject({ size: 16, highlighter: true });
    const arrow = buildInk(pts, { size: 2, mode: "arrow" })!;
    expect(arrow.ink.arrow).toBe(true);
    expect(pairsOf(arrow.ink.points)).toHaveLength(2);
    expect(inkPaths(arrow.ink).head).toMatch(/^M/);
    // too short to be an arrow
    expect(buildInk([[0, 0], [1, 1]], { size: 2, mode: "arrow" })).toBeNull();
  });

  it("thins dense samples but keeps both ends", () => {
    const dense: Point[] = Array.from({ length: 4000 }, (_, i) => [i / 10, 0]);
    const out = simplify(dense, 0.75);
    expect(out.length).toBeLessThanOrEqual(1500);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([399.9, 0]);
  });
});

describe("ink shapes and text", () => {
  it("a dragged box becomes a rectangle or ellipse filling the node", () => {
    const r = buildInk(
      [
        [300, 200],
        [250, 240],
        [100, 100],
      ],
      { size: 4, mode: "rect" },
    )!;
    expect(r).toMatchObject({ x: 97, y: 97, width: 206, height: 106 });
    expect(r.ink.shape).toBe("rect");
    expect(buildInk([[0, 0], [3, 3]], { size: 4, mode: "ellipse" })).toBeNull();
    expect(shapePath("ellipse", 100, 50, 4)).toMatch(/^M.* a/);
    expect(shapePath("rect", 100, 50, 4)).toMatch(/^M.*Z$/);
  });

  it("text annotations size their box from the type size", () => {
    expect(inkFontSize(2)).toBe(17);
    const t = buildTextInk({ x: 10, y: 50 }, 4);
    expect(t.ink.shape).toBe("text");
    expect(t.y).toBeLessThan(50);
    expect(textBox("Uma anotação maior", 4).width).toBeGreaterThan(textBox("Oi", 4).width);
  });
});
