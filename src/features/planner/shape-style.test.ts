import { describe, expect, it } from "vitest";
import type { PlanDocument } from "@/domain/plan";
import { normalizeDocument } from "@/domain/plan";
import { DEFAULT_STYLE } from "./shape-geometry";
import { applyStyle, edgeStyleFromStyle, shapeFromStyle, styleOfSelection } from "./shape-style";

const doc = (): PlanDocument => ({
  schemaVersion: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    { id: "a", kind: "shape", x: 0, y: 0, width: 100, height: 60, data: { title: "A", shape: { type: "rect" } } },
    { id: "t", kind: "shape", x: 0, y: 100, width: 40, height: 30, data: { title: "Olá", shape: { type: "text" } } },
    { id: "b", kind: "block", x: 300, y: 0, width: 200, height: 72, data: { title: "B" } },
    { id: "i", kind: "ink", x: 0, y: 200, width: 40, height: 20, data: { title: "", ink: { points: [0, 0, 40, 20], w: 40, h: 20, size: 2 } } },
  ],
  edges: [
    { id: "e", source: "a", target: "b", kind: "flow" },
    { id: "d", source: "a", target: "b", kind: "flow", style: { routing: "straight", end: "arrow" } },
  ],
});

describe("drawing style", () => {
  it("new shapes and links store only what differs from the defaults", () => {
    expect(shapeFromStyle("rect", DEFAULT_STYLE, 5)).toEqual({ type: "rect", seed: 5 });
    const s = { ...DEFAULT_STYLE, stroke: "#E03131", fill: "#A5D8FF", roughness: 1, font: "hand" as const };
    expect(shapeFromStyle("ellipse", s, 1)).toEqual({ type: "ellipse", seed: 1, stroke: "#E03131", fill: "#A5D8FF", roughness: 1, font: "hand" });
    expect(shapeFromStyle("text", s, 1).fill).toBeUndefined();
    expect(edgeStyleFromStyle("arrow", DEFAULT_STYLE, 2)).toEqual({ end: "arrow", routing: "straight", seed: 2 });
    expect(edgeStyleFromStyle("line", DEFAULT_STYLE, 2)).toMatchObject({ end: "none" });
    expect(normalizeDocument({ ...doc(), nodes: [...doc().nodes, { id: "z", kind: "shape", x: 0, y: 0, width: 10, height: 10, data: { title: "", shape: shapeFromStyle("diamond", s, 3) } }] }).nodes.at(-1)?.data.shape?.type).toBe("diamond");
  });

  it("restyles shapes, strokes and connections in the selection", () => {
    const d = applyStyle(doc(), { nodes: ["a", "t", "b", "i"], edges: ["e", "d"] }, { stroke: "#2F9E44", roughness: 2, fontSize: 40 });
    const by = new Map(d.nodes.map((n) => [n.id, n]));
    expect(by.get("a")?.data.shape).toMatchObject({ stroke: "#2F9E44", roughness: 2, fontSize: 40 });
    expect(by.get("b")?.data.shape).toBeUndefined(); // blocks keep their look
    expect(by.get("i")?.data.color).toBe("#2F9E44");
    expect(by.get("t")!.width).toBeGreaterThan(40); // text grew with its size
    const edges = new Map(d.edges.map((e) => [e.id, e]));
    expect(edges.get("e")?.style).toMatchObject({ stroke: "#2F9E44", routing: "elbow" }); // keeps its route
    expect(edges.get("d")?.style).toMatchObject({ stroke: "#2F9E44", routing: "straight" });
    // back to defaults drops the stored values
    const back = applyStyle(d, { nodes: ["a"], edges: [] }, { stroke: undefined, roughness: 0 });
    expect(back.nodes.find((n) => n.id === "a")?.data.shape).toEqual({ type: "rect", fontSize: 40 });
  });

  it("reads the style of the selection", () => {
    const d = doc();
    const fromShape = styleOfSelection(DEFAULT_STYLE, [{ title: "", shape: { type: "rect", fill: "#FFC9C9", strokeWidth: 4 } }], []);
    expect(fromShape).toMatchObject({ fill: "#FFC9C9", strokeWidth: 4 });
    expect(styleOfSelection(DEFAULT_STYLE, [], [d.edges[1].style])).toMatchObject({ routing: "straight", end: "arrow" });
    expect(styleOfSelection(DEFAULT_STYLE, [], [])).toBe(DEFAULT_STYLE);
  });
});
