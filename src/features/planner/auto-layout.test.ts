import { describe, expect, it } from "vitest";
import type { PlanDocument, PlanEdge, PlanNode } from "@/domain/plan";
import { autoLayout, directionalHandles, layoutSiblings, LAYOUT_GAP, LAYOUT_RANK_GAP, parentInsets } from "./auto-layout";
import { absRect } from "./doc-ops";

const n = (id: string, x: number, y: number, extra: Partial<PlanNode> = {}): PlanNode => ({
  id,
  kind: "block",
  x,
  y,
  width: 200,
  height: 72,
  data: { title: id },
  ...extra,
});
const e = (source: string, target: string, extra: Partial<PlanEdge> = {}): PlanEdge => ({ id: `${source}-${target}`, source, target, kind: "flow", ...extra });
const doc = (nodes: PlanNode[], edges: PlanEdge[] = []): PlanDocument => ({ schemaVersion: 1, nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } });

type R = { x: number; y: number; width: number; height: number };
const overlap = (a: R, b: R) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const get = (d: PlanDocument, id: string) => d.nodes.find((x) => x.id === id)!;

function expectNoSiblingOverlap(d: PlanDocument) {
  const groups = new Map<string, PlanNode[]>();
  for (const node of d.nodes) groups.set(node.parentId ?? "", [...(groups.get(node.parentId ?? "") ?? []), node]);
  for (const sibs of groups.values()) {
    for (let i = 0; i < sibs.length; i++)
      for (let j = i + 1; j < sibs.length; j++) {
        const a = { x: sibs[i].x, y: sibs[i].y, width: sibs[i].width, height: sibs[i].height };
        const b = { x: sibs[j].x, y: sibs[j].y, width: sibs[j].width, height: sibs[j].height };
        expect(overlap(a, b), `${sibs[i].id} overlaps ${sibs[j].id}`).toBe(false);
      }
  }
}

// a messy plan: a chain, a fork, a container with a nested flow and a couple of notes
const messy = () =>
  doc(
    [
      n("a", 500, 40),
      n("b", 10, 30),
      n("c", 30, 20),
      n("d", 260, 25),
      n("box", 90, 60, { kind: "container", width: 300, height: 200 }),
      n("k1", 10, 10, { parentId: "box", width: 120, height: 48 }),
      n("k2", 15, 12, { parentId: "box", width: 120, height: 48 }),
      n("k3", 20, 14, { parentId: "box", width: 120, height: 48 }),
      n("note1", 0, 0, { kind: "note", width: 220, height: 104 }),
      n("note2", 5, 5, { kind: "note", width: 220, height: 104 }),
    ],
    [e("a", "b"), e("b", "c"), e("a", "d"), e("d", "k1"), e("k1", "k2"), e("k1", "k3")],
  );

describe("autoLayout", () => {
  it("leaves no overlaps between laid-out siblings (both directions)", () => {
    for (const direction of ["TB", "LR"] as const) {
      const out = autoLayout(messy(), { direction });
      expectNoSiblingOverlap(out);
    }
  });

  it("ranks follow edge direction with the rank gap", () => {
    const d = doc([n("a", 0, 300), n("b", 0, 150), n("c", 0, 0)], [e("a", "b"), e("b", "c")]);
    const tb = autoLayout(d, { direction: "TB" });
    expect(get(tb, "b").y).toBeGreaterThanOrEqual(get(tb, "a").y + 72 + LAYOUT_RANK_GAP - 1);
    expect(get(tb, "c").y).toBeGreaterThanOrEqual(get(tb, "b").y + 72 + LAYOUT_RANK_GAP - 1);
    const lr = autoLayout(d, { direction: "LR" });
    expect(get(lr, "b").x).toBeGreaterThanOrEqual(get(lr, "a").x + 200 + LAYOUT_RANK_GAP - 1);
    expect(get(lr, "c").x).toBeGreaterThanOrEqual(get(lr, "b").x + 200 + LAYOUT_RANK_GAP - 1);
  });

  it("keeps children inside their parent and resizes the parent to fit", () => {
    for (const direction of ["TB", "LR"] as const) {
      const out = autoLayout(messy(), { direction });
      const box = get(out, "box");
      const ins = parentInsets(box);
      for (const id of ["k1", "k2", "k3"]) {
        const k = get(out, id);
        expect(k.parentId).toBe("box");
        expect(k.x).toBeGreaterThanOrEqual(ins.left);
        expect(k.y).toBeGreaterThanOrEqual(ins.top);
        expect(k.x + k.width).toBeLessThanOrEqual(box.width);
        expect(k.y + k.height).toBeLessThanOrEqual(box.height);
      }
      // fit: k1 → k2/k3 is two ranks inside the container
      const kids = ["k1", "k2", "k3"].map((id) => get(out, id));
      const right = Math.max(...kids.map((k) => k.x + k.width));
      const bottom = Math.max(...kids.map((k) => k.y + k.height));
      expect(box.width).toBe(Math.max(160, right + ins.right));
      expect(box.height).toBe(Math.max(88, bottom + ins.bottom));
      if (direction === "TB") expect(get(out, "k2").y).toBeGreaterThan(get(out, "k1").y + 48);
      else expect(get(out, "k2").x).toBeGreaterThan(get(out, "k1").x + 120);
    }
  });

  it("orders top-level ranks using edges into containers", () => {
    const out = autoLayout(messy(), { direction: "TB" });
    // d → k1 (inside box) makes the box a rank below d
    expect(get(out, "box").y).toBeGreaterThanOrEqual(get(out, "d").y + 72 + LAYOUT_RANK_GAP - 1);
  });

  it("puts unconnected nodes and notes after the graph", () => {
    const tb = autoLayout(messy(), { direction: "TB" });
    const graphBottom = Math.max(...["a", "b", "c", "d", "box"].map((id) => get(tb, id).y + get(tb, id).height));
    for (const id of ["note1", "note2"]) expect(get(tb, id).y).toBeGreaterThanOrEqual(graphBottom + LAYOUT_RANK_GAP - 1);
    // a tidy row: same top
    expect(get(tb, "note1").y).toBe(get(tb, "note2").y);

    const lr = autoLayout(messy(), { direction: "LR" });
    const graphRight = Math.max(...["a", "b", "c", "d", "box"].map((id) => get(lr, id).x + get(lr, id).width));
    for (const id of ["note1", "note2"]) expect(get(lr, id).x).toBeGreaterThanOrEqual(graphRight + LAYOUT_RANK_GAP - 1);
    expect(get(lr, "note1").x).toBe(get(lr, "note2").x);
  });

  it("keeps the bounding-box origin", () => {
    const d = messy();
    const out = autoLayout(d, { direction: "TB" });
    const top = (x: PlanDocument) => x.nodes.filter((m) => !m.parentId);
    expect(Math.min(...top(out).map((m) => m.x))).toBe(Math.min(...top(d).map((m) => m.x)));
    expect(Math.min(...top(out).map((m) => m.y))).toBe(Math.min(...top(d).map((m) => m.y)));
  });

  it("applies only to the selection, keeping its origin", () => {
    const d = messy();
    const out = autoLayout(d, { direction: "LR", selection: ["a", "b", "c"] });
    for (const id of ["d", "box", "k1", "note1", "note2"]) expect(get(out, id)).toEqual(get(d, id));
    const sel = ["a", "b", "c"];
    expect(Math.min(...sel.map((id) => get(out, id).x))).toBe(Math.min(...sel.map((id) => get(d, id).x)));
    expect(Math.min(...sel.map((id) => get(out, id).y))).toBe(Math.min(...sel.map((id) => get(d, id).y)));
    expect(get(out, "b").x).toBeGreaterThan(get(out, "a").x + 200);
    expect(get(out, "c").x).toBeGreaterThan(get(out, "b").x + 200);
  });

  it("a single selected container gets its inside arranged", () => {
    const d = messy();
    const out = autoLayout(d, { direction: "TB", selection: ["box"] });
    expect(get(out, "box").x).toBe(get(d, "box").x);
    expect(get(out, "box").y).toBe(get(d, "box").y);
    expect(get(out, "a")).toEqual(get(d, "a"));
    expectNoSiblingOverlap({ ...out, nodes: out.nodes.filter((m) => m.parentId === "box") });
  });

  it("does not touch the inside of collapsed containers", () => {
    const d = messy();
    const box = get(d, "box");
    box.data = { ...box.data, collapsed: true };
    const out = autoLayout(d, { direction: "TB" });
    for (const id of ["k1", "k2", "k3"]) expect(get(out, id)).toEqual(get(d, id));
    expect(get(out, "box").height).toBe(200);
  });

  it("re-picks facing handles for moved edges", () => {
    const d = doc([n("a", 0, 400), n("b", 0, 0)], [e("a", "b", { sourceHandle: "t", targetHandle: "b" })]);
    const tb = autoLayout(d, { direction: "TB" });
    expect(tb.edges[0]).toMatchObject({ sourceHandle: "b", targetHandle: "t" });
    const lr = autoLayout(d, { direction: "LR" });
    expect(lr.edges[0]).toMatchObject({ sourceHandle: "r", targetHandle: "l" });
  });

  it("wraps many loose nodes into a grid without overlaps", () => {
    const nodes = Array.from({ length: 14 }, (_, i) => n(`n${i}`, (i * 37) % 120, (i * 53) % 90));
    const out = autoLayout(doc(nodes), { direction: "TB" });
    expectNoSiblingOverlap(out);
    const rows = new Set(out.nodes.map((m) => m.y));
    expect(rows.size).toBeGreaterThan(1);
    expect(rows.size).toBeLessThan(14);
  });

  it("is a no-op on an empty plan", () => {
    const d = doc([]);
    expect(autoLayout(d, { direction: "TB" })).toBe(d);
  });
});

describe("layoutSiblings", () => {
  it("keeps the sibling gap", () => {
    const r = layoutSiblings(
      [
        { id: "a", w: 100, h: 40, x0: 0, y0: 0 },
        { id: "b", w: 100, h: 40, x0: 0, y0: 0 },
        { id: "c", w: 100, h: 40, x0: 0, y0: 0 },
      ],
      [
        ["a", "b"],
        ["a", "c"],
      ],
      "TB",
    );
    const b = r.pos.get("b")!;
    const c = r.pos.get("c")!;
    expect(Math.abs(b.x - c.x)).toBeGreaterThanOrEqual(100 + LAYOUT_GAP);
  });
});

describe("directionalHandles", () => {
  it("prefers the flow axis", () => {
    const a = { x: 0, y: 0, width: 100, height: 50 };
    expect(directionalHandles(a, { x: 600, y: 200, width: 100, height: 50 }, "TB")).toEqual({ sourceHandle: "b", targetHandle: "t" });
    expect(directionalHandles(a, { x: 200, y: 600, width: 100, height: 50 }, "LR")).toEqual({ sourceHandle: "r", targetHandle: "l" });
  });
});

it("absRect still agrees after layout (sanity)", () => {
  const out = autoLayout(messy(), { direction: "TB" });
  const k1 = absRect(out, "k1");
  const box = absRect(out, "box");
  expect(k1.x).toBeGreaterThan(box.x);
  expect(k1.y).toBeGreaterThan(box.y);
});
