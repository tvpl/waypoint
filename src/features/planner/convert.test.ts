import { describe, expect, it } from "vitest";
import type { PlanNode } from "@/domain/plan";
import { convertKind, convertNodes } from "./convert";

const doc = (nodes: PlanNode[]) => ({ nodes });
const block: PlanNode = { id: "b", kind: "block", x: 0, y: 0, width: 200, height: 72, data: { title: "API", description: "d", color: "#E8EDFF", icon: "box", resource: { type: "url", url: "https://x.dev" } } };
const shape: PlanNode = { id: "s", kind: "shape", x: 0, y: 0, width: 100, height: 60, data: { title: "Fila", shape: { type: "rect", fill: "#A5D8FF", strokeWidth: 4 } } };

describe("convert", () => {
  it("block → ellipse keeps title, link and color as fill", () => {
    const n = convertNodes(doc([block]), ["b"], "ellipse").nodes[0];
    expect(n).toMatchObject({ kind: "shape", data: { title: "API", description: "d", resource: { url: "https://x.dev" }, shape: { type: "ellipse", fill: "#E8EDFF" } } });
    expect(n.data.color).toBeUndefined();
  });

  it("shape → note and back keeps its style", () => {
    const note = convertNodes(doc([shape]), ["s"], "note").nodes[0];
    expect(note).toMatchObject({ kind: "note", data: { title: "Fila", color: "#A5D8FF" } });
    const diamond = convertNodes(doc([shape]), ["s"], "diamond").nodes[0];
    expect(diamond.data.shape).toMatchObject({ type: "diamond", fill: "#A5D8FF", strokeWidth: 4 });
    const text = convertNodes(doc([shape]), ["s"], "text").nodes[0];
    expect(text.data.shape).toMatchObject({ type: "text" });
    expect(text.data.shape!.fill).toBeUndefined();
  });

  it("leaves areas and icons alone", () => {
    const area: PlanNode = { id: "a", kind: "container", x: 0, y: 0, width: 300, height: 200, data: { title: "X" } };
    expect(convertKind(area)).toBeNull();
    const d = doc([area]);
    expect(convertNodes(d, ["a"], "block")).toBe(d);
  });
});
