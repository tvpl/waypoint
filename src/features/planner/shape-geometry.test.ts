import { describe, expect, it } from "vitest";
import { arrowheadPath, floatingEnds, headInset, linkPaths, outlinePoint, resolveShape, seedOf, shapePaths } from "./shape-geometry";

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
