/**
 * The drawing style (stroke, fill, width, dash, hand-drawn, font…) applied to shapes, drawn
 * connections and freehand strokes. Pure: works on plan documents.
 */
import type { EdgeStyle, PlanDocument, PlanEdge, PlanNode, Shape } from "@/domain/plan";
import { DEFAULT_STYLE, measureText, type DrawStyle } from "./shape-geometry";

type Doc = Pick<PlanDocument, "nodes" | "edges">;

const SHAPE_KEYS = ["stroke", "fill", "fillStyle", "strokeWidth", "strokeStyle", "roughness", "round", "opacity", "font", "fontSize", "align"] as const;
const EDGE_KEYS = ["stroke", "strokeWidth", "strokeStyle", "roughness", "start", "end", "routing"] as const;

/** Only what differs from the defaults is stored, so documents stay small. */
function lean<T extends Record<string, unknown>>(obj: T, defaults: Partial<Record<string, unknown>>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== defaults[k]) out[k] = v;
  return out as T;
}

const SHAPE_DEFAULTS = { fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", round: true, opacity: 1, fontSize: 20, align: "center", font: "sans", roughness: 0 };

/** A new shape in the current style (text has no fill or outline). */
export function shapeFromStyle(type: Shape["type"], s: DrawStyle, seed: number): Shape {
  const base: Shape = { type, seed };
  const style: Partial<Shape> = {
    stroke: s.stroke,
    fill: type === "text" ? undefined : s.fill,
    fillStyle: s.fillStyle,
    strokeWidth: s.strokeWidth,
    strokeStyle: s.strokeStyle,
    roughness: s.roughness,
    round: s.round,
    opacity: s.opacity,
    font: s.font,
    fontSize: s.fontSize,
    align: type === "text" ? "left" : s.align,
  };
  return { ...base, ...lean(style, { ...SHAPE_DEFAULTS, ...(type === "text" ? { align: "left" } : {}) }) };
}

/** A drawn connection's style: arrows get the current heads; lines none. */
export function edgeStyleFromStyle(kind: "arrow" | "line", s: DrawStyle, seed: number): EdgeStyle {
  const style: EdgeStyle = {
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
    strokeStyle: s.strokeStyle,
    roughness: s.roughness,
    start: kind === "line" ? "none" : s.start,
    end: kind === "line" ? "none" : s.end,
    routing: s.routing,
    seed,
  };
  // Heads are stored explicitly (a missing end reads as "arrow").
  const out = lean(style, { strokeWidth: 2, strokeStyle: "solid", roughness: 0, start: "none" }) as EdgeStyle;
  if (style.end === "none") out.end = "none";
  return out;
}

const pick = <K extends string>(patch: Partial<DrawStyle>, keys: readonly K[]) => keys.filter((k) => k in patch) as K[];

/** Restyles shapes, drawn connections and freehand strokes among the given ids. */
export function applyStyle<T extends Doc>(doc: T, ids: { nodes: Iterable<string>; edges: Iterable<string> }, patch: Partial<DrawStyle>): T {
  const nodeIds = new Set(ids.nodes);
  const edgeIds = new Set(ids.edges);
  const shapeKeys = pick(patch, SHAPE_KEYS);
  const edgeKeys = pick(patch, EDGE_KEYS);
  let changed = false;

  const nodes = doc.nodes.map((n): PlanNode => {
    if (!nodeIds.has(n.id)) return n;
    if (n.kind === "shape" && n.data.shape && shapeKeys.length) {
      const shape: Shape = { ...n.data.shape };
      for (const k of shapeKeys) {
        const v = patch[k];
        if (v === undefined || v === SHAPE_DEFAULTS[k as keyof typeof SHAPE_DEFAULTS]) delete shape[k];
        else (shape as Record<string, unknown>)[k] = v;
      }
      if (shape.type === "text") delete shape.fill;
      changed = true;
      let next: PlanNode = { ...n, data: { ...n.data, shape } };
      // Text boxes follow their font.
      if (shape.type === "text" && (patch.font !== undefined || patch.fontSize !== undefined)) {
        const box = measureText(n.data.title, shape.font ?? DEFAULT_STYLE.font, shape.fontSize ?? DEFAULT_STYLE.fontSize);
        next = { ...next, width: box.width, height: box.height };
      }
      return next;
    }
    if (n.kind === "ink" && "stroke" in patch) {
      changed = true;
      const data = { ...n.data };
      if (patch.stroke) data.color = patch.stroke;
      else delete data.color;
      return { ...n, data };
    }
    return n;
  });

  const edges = doc.edges.map((e): PlanEdge => {
    if (!edgeIds.has(e.id) || !edgeKeys.length) return e;
    // A connection between handles that gets styled keeps its elbow route.
    const style: EdgeStyle = { ...(e.style ?? { routing: "elbow" }) };
    for (const k of edgeKeys) {
      const v = patch[k];
      if (v === undefined) delete style[k];
      else (style as Record<string, unknown>)[k] = v;
    }
    changed = true;
    return { ...e, style };
  });
  return changed ? { ...doc, nodes, edges } : doc;
}

/** The style shown for a selection: the first shape's or connection's values over the current style. */
export function styleOfSelection(current: DrawStyle, nodes: PlanNode["data"][], edges: (EdgeStyle | undefined)[]): DrawStyle {
  const shape = nodes.find((d) => d.shape)?.shape;
  if (shape) {
    return {
      ...current,
      stroke: shape.stroke,
      fill: shape.fill,
      fillStyle: shape.fillStyle ?? "solid",
      strokeWidth: shape.strokeWidth ?? 2,
      strokeStyle: shape.strokeStyle ?? "solid",
      roughness: shape.roughness ?? 0,
      round: shape.round ?? true,
      opacity: shape.opacity ?? 1,
      font: shape.font ?? "sans",
      fontSize: shape.fontSize ?? 20,
      align: shape.align ?? "center",
    };
  }
  const es = edges.find(Boolean);
  if (es) {
    return {
      ...current,
      stroke: es.stroke,
      strokeWidth: es.strokeWidth ?? 2,
      strokeStyle: es.strokeStyle ?? "solid",
      roughness: es.roughness ?? 0,
      start: es.start ?? "none",
      end: es.end ?? "arrow",
      routing: es.routing ?? "straight",
    };
  }
  return current;
}
