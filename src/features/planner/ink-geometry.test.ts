import { describe, expect, it } from "vitest";
import { buildInk, inkPaths, pairsOf, simplify, type Point } from "./ink-geometry";

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
