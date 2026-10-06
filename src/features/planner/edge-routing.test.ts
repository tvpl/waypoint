import { describe, expect, it } from "vitest";
import { avoidanceBoxes, nearestAlong, orthoRoute, plainElbow, pointAlong, polylineHits, roundedPath } from "./edge-routing";

describe("elbow routing", () => {
  const s = { x: 0, y: 50 };
  const t = { x: 400, y: 50 };
  const src = { x: -100, y: 20, w: 100, h: 60 };
  const tgt = { x: 400, y: 20, w: 100, h: 60 };

  it("goes straight when nothing is in the way", () => {
    expect(plainElbow(s, "right", t, "left")).toEqual([s, t]);
    expect(orthoRoute(s, "right", t, "left", [], [src, tgt])).toEqual([s, t]);
  });

  it("goes around an element in between, keeping clear of it", () => {
    const wall = { x: 170, y: 0, w: 60, h: 100 };
    const r = orthoRoute(s, "right", t, "left", [wall], [src, tgt])!;
    expect(r[0]).toEqual(s);
    expect(r.at(-1)).toEqual(t);
    expect(polylineHits(r, [wall])).toBe(false);
    // every leg is horizontal or vertical
    for (let i = 1; i < r.length; i++) expect(r[i].x === r[i - 1].x || r[i].y === r[i - 1].y).toBe(true);
    // and it arrives from the left, as the handle says
    expect(r.at(-2)!.y).toBe(t.y);
    expect(r.at(-2)!.x).toBeLessThan(t.x);
  });

  it("gives up when the start is boxed in", () => {
    expect(orthoRoute(s, "right", t, "left", [{ x: 5, y: 0, w: 30, h: 100 }], [])).toBeNull();
  });

  it("rounds corners and measures along the line", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const { d, mid } = roundedPath(pts, 10);
    expect(d).toContain("Q100 0 100 10");
    expect(mid).toEqual({ x: 100, y: 0 });
    expect(pointAlong(pts, 0.25)).toEqual({ x: 50, y: 0 });
    expect(nearestAlong(pts, { x: 120, y: 50 })).toBeCloseTo(0.75, 5);
  });

  it("lists only the elements around a connection that are not its ends or inside them", () => {
    const node = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({ id, position: { x, y }, width: 100, height: 60, ...extra });
    const nodes = [
      node("a", 0, 0),
      node("b", 600, 0),
      node("wall", 300, 0),
      node("far", 3000, 3000),
      node("area", 250, -50, { type: "section", width: 300, height: 200 }),
      node("box", 1000, 0, { type: "container", width: 400, height: 300 }),
      node("kid", 20, 20, { parentId: "box" }),
    ];
    const edges = [
      { id: "ab", source: "a", target: "b" },
      { id: "drawn", source: "a", target: "b", data: { style: { routing: "straight" } } },
      { id: "toBox", source: "b", target: "box" },
    ];
    const m = avoidanceBoxes(nodes, edges);
    expect(m.get("ab")!.boxes).toEqual([{ x: 300, y: 0, w: 100, h: 60 }]);
    expect(m.has("drawn")).toBe(false);
    expect(m.has("toBox")).toBe(false);
  });
});
