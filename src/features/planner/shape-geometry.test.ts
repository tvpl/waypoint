import { describe, expect, it } from "vitest";
import { arrowheadPath, bendThrough, curveApex, DEFAULT_BEND, floatingEnds, headInset, linkPaths, outlinePoint, outlinePoints, resolveShape, seedOf, shapePaths } from "./shape-geometry";

describe("shape geometry", () => {
  it("resolves styles: own values, then the layer's sketch, then defaults", () => {
    expect(resolveShape({ type: "rect" })).toMatchObject({ roughness: 0, strokeWidth: 2, font: "sans" });
    expect(resolveShape({ type: "rect" }, true)).toMatchObject({ roughness: 1, font: "hand" });
    expect(resolveShape({ type: "rect", roughness: 0, font: "mono" }, true)).toMatchObject({ roughness: 0, font: "mono" });
  });

  it("draws clean and hand-drawn outlines, fills and patterns; text has no outline", () => {
    const clean = shapePaths({ type: "diamond", fill: "#A5D8FF" }, 120, 80, { seed: 1 });
    expect(clean).toHaveLength(2);
    expect(clean[0].fill).toBe("#A5D8FF");
    expect(clean[1].stroke).toBe("currentColor");
    const rough = shapePaths({ type: "ellipse", roughness: 2, fill: "#FFC9C9", fillStyle: "hachure", strokeStyle: "dashed" }, 120, 80, { seed: 1 });
    expect(rough.length).toBeGreaterThan(1);
    expect(rough.at(-1)?.dash).toBeTruthy();
    // same seed, same wobble
    expect(shapePaths({ type: "rect", roughness: 1 }, 100, 50, { seed: 7 })).toEqual(shapePaths({ type: "rect", roughness: 1 }, 100, 50, { seed: 7 }));
    expect(shapePaths({ type: "text" }, 100, 30, { seed: 1 })).toEqual([]);
    expect(seedOf("abc")).toBe(seedOf("abc"));
  });

  it("finds where a line leaves each outline", () => {
    const box = { x: 0, y: 0, w: 100, h: 50 };
    expect(outlinePoint(box, "rect", { x: 200, y: 25 })).toEqual({ x: 100, y: 25 });
    expect(outlinePoint(box, "ellipse", { x: 50, y: 200 })).toEqual({ x: 50, y: 50 });
    const d = outlinePoint(box, "diamond", { x: 150, y: 75 });
    expect(Math.abs((d.x - 50) / 50) + Math.abs((d.y - 25) / 25)).toBeCloseTo(1);
    const ends = floatingEnds({ ...box, type: "rect" }, { x: 300, y: 0, w: 100, h: 50, type: "ellipse" }, 0);
    expect(ends.start).toEqual({ x: 100, y: 25 });
    expect(ends.end).toEqual({ x: 300, y: 25 });
  });

  it("builds connection paths and arrowheads", () => {
    expect(linkPaths({ x: 0, y: 0 }, { x: 100, y: 0 }, { roughness: 0, seed: 1, strokeWidth: 2 })).toEqual(["M0 0 L100 0"]);
    expect(linkPaths({ x: 0, y: 0 }, { x: 100, y: 0 }, { curve: true, roughness: 0, seed: 1, strokeWidth: 2 })[0]).toMatch(/^M0 0 Q/);
    expect(linkPaths({ x: 0, y: 0 }, { x: 100, y: 0 }, { roughness: 1.5, seed: 1, strokeWidth: 2 }).length).toBeGreaterThan(0);
    expect(arrowheadPath("none", { x: 0, y: 0 }, 0, 2)).toBeNull();
    expect(arrowheadPath("triangle", { x: 0, y: 0 }, 0, 2)?.filled).toBe(true);
    expect(arrowheadPath("arrow", { x: 0, y: 0 }, 0, 2)?.filled).toBe(false);
    expect(headInset("triangle", 2)).toBeGreaterThan(0);
  });
});

describe("more shapes", () => {
  it("draws every outline type, clean and hand-drawn", async () => {
    const { OUTLINE_TYPES } = await import("@/domain/plan");
    for (const type of OUTLINE_TYPES) {
      for (const roughness of [0, 1]) {
        const paths = shapePaths({ type, roughness, fill: "#A5D8FF" }, 160, 100, { seed: 7 });
        expect(paths.length).toBeGreaterThan(0);
        for (const p of paths) expect(p.d).not.toMatch(/NaN|undefined/);
      }
    }
    // the cylinder adds its rim
    expect(shapePaths({ type: "cylinder" }, 100, 120, { seed: 1 }).length).toBe(2);
  });
});

describe("outline points and bends", () => {
  it("samples every outline into a closed polyline inside its box", () => {
    for (const type of ["rect", "diamond", "ellipse", "hexagon", "parallelogram", "triangle", "cylinder", "document", "cloud", "speech", "star"] as const) {
      const pts = outlinePoints(type, 0, 0, 200, 120);
      expect(pts.length, type).toBeGreaterThan(3);
      expect(pts[0], type).toEqual(pts.at(-1));
      for (const [x, y] of pts) {
        expect(x, type).toBeGreaterThanOrEqual(-12);
        expect(x, type).toBeLessThanOrEqual(212);
        expect(y, type).toBeGreaterThanOrEqual(-12);
        expect(y, type).toBeLessThanOrEqual(132);
      }
    }
    expect(outlinePoints("triangle", 0, 0, 100, 100)).toEqual([[50, 0], [100, 100], [0, 100], [50, 0]]);
  });

  it("finds the bend that runs a curve through a point, and back", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 200, y: 0 };
    expect(bendThrough(a, b, curveApex(a, b))).toBeCloseTo(DEFAULT_BEND, 3);
    expect(bendThrough(a, b, curveApex(a, b, -0.8))).toBeCloseTo(-0.8, 3);
    expect(bendThrough(a, b, { x: 100, y: 0 })).toBe(0);
    expect(bendThrough(a, b, { x: 100, y: 1e6 })).toBe(3);
  });
});
