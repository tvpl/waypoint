/**
 * Drawn shapes and styled connections (pure, no DOM): style defaults, SVG paths — clean or
 * hand-drawn with rough.js, the same engine as Excalidraw — outline intersections for connections
 * that leave from a shape's border, and arrowheads.
 */
import rough from "roughjs";
import type { Arrowhead, EdgeStyle, Shape } from "@/domain/plan";

const gen = rough.generator();

export type ShapeType = Shape["type"];
export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

/** What new shapes and arrows are drawn with (the editor keeps the last choice). */
export type DrawStyle = {
  stroke?: string;
  fill?: string;
  fillStyle: NonNullable<Shape["fillStyle"]>;
  strokeWidth: number;
  strokeStyle: NonNullable<Shape["strokeStyle"]>;
  roughness: number;
  round: boolean;
  opacity: number;
  font: NonNullable<Shape["font"]>;
  fontSize: number;
  align: NonNullable<Shape["align"]>;
  start: Arrowhead;
  end: Arrowhead;
  routing: NonNullable<EdgeStyle["routing"]>;
};

export const DEFAULT_STYLE: DrawStyle = {
  stroke: undefined,
  fill: undefined,
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 0,
  round: true,
  opacity: 1,
  font: "sans",
  fontSize: 20,
  align: "center",
  start: "none",
  end: "arrow",
  routing: "straight",
};

/** Stroke colors offered (theme ink first, stored as no color). Same hues as Excalidraw's palette. */
export const STROKE_COLORS: { value: string | undefined; name: string }[] = [
  { value: undefined, name: "Tinta (segue o tema)" },
  { value: "#E03131", name: "Vermelho" },
  { value: "#2F9E44", name: "Verde" },
  { value: "#1971C2", name: "Azul" },
  { value: "#F08C00", name: "Laranja" },
  { value: "#6741D9", name: "Roxo" },
  { value: "#868E96", name: "Cinza" },
];

/** Background colors: none, then light tints that read with dark text on both themes. */
export const FILL_COLORS: { value: string | undefined; name: string }[] = [
  { value: undefined, name: "Sem fundo" },
  { value: "#FFC9C9", name: "Vermelho claro" },
  { value: "#B2F2BB", name: "Verde claro" },
  { value: "#A5D8FF", name: "Azul claro" },
  { value: "#FFEC99", name: "Amarelo claro" },
  { value: "#D0BFFF", name: "Roxo claro" },
  { value: "#E9ECEF", name: "Cinza claro" },
];

export const FONT_STACK: Record<DrawStyle["font"], string> = {
  hand: '"Bradley Hand", "Segoe Print", "Chalkboard SE", "Comic Sans MS", cursive',
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
};

/** A stable number per element id, so the hand-drawn wobble doesn't change between renders. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 2 ** 31;
}

/** A shape's effective style: its own values, the layer's sketch setting, then the defaults. */
export function resolveShape(shape: Shape, sketch = false) {
  return {
    type: shape.type,
    stroke: shape.stroke,
    fill: shape.fill,
    fillStyle: shape.fillStyle ?? DEFAULT_STYLE.fillStyle,
    strokeWidth: shape.strokeWidth ?? DEFAULT_STYLE.strokeWidth,
    strokeStyle: shape.strokeStyle ?? DEFAULT_STYLE.strokeStyle,
    roughness: shape.roughness ?? (sketch ? 1 : 0),
    round: shape.round ?? DEFAULT_STYLE.round,
    opacity: shape.opacity ?? 1,
    font: shape.font ?? (sketch ? "hand" : DEFAULT_STYLE.font),
    fontSize: shape.fontSize ?? DEFAULT_STYLE.fontSize,
    align: shape.align ?? DEFAULT_STYLE.align,
  };
}

/** One drawn piece: a path stroked and/or filled. Colors are CSS values (theme variables allowed). */
export type DrawPath = { d: string; stroke?: string; fill?: string; strokeWidth?: number; dash?: string };

const f = (n: number) => (Math.round(n * 10) / 10).toString();

export function dashFor(style: DrawStyle["strokeStyle"], width: number): string | undefined {
  if (style === "dashed") return `${f(width * 4)} ${f(width * 3)}`;
  if (style === "dotted") return `${f(width * 0.6)} ${f(width * 2.6)}`;
  return undefined;
}

/** Clean outline of a shape inside `x,y,w,h`. */
function cleanOutline(type: "rect" | "diamond" | "ellipse", x: number, y: number, w: number, h: number, round: boolean): string {
  if (type === "ellipse") {
    const rx = w / 2;
    const ry = h / 2;
    return `M${f(x)} ${f(y + ry)} a${f(rx)} ${f(ry)} 0 1 0 ${f(w)} 0 a${f(rx)} ${f(ry)} 0 1 0 ${f(-w)} 0 Z`;
  }
  if (type === "diamond") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (!round) return `M${f(cx)} ${f(y)} L${f(x + w)} ${f(cy)} L${f(cx)} ${f(y + h)} L${f(x)} ${f(cy)} Z`;
    // Corners cut back a little and joined with curves.
    const k = Math.min(w, h) * 0.08;
    const tx = (k * w) / Math.hypot(w, h);
    const ty = (k * h) / Math.hypot(w, h);
    return [
      `M${f(cx - tx)} ${f(y + ty)}`,
      `Q${f(cx)} ${f(y)} ${f(cx + tx)} ${f(y + ty)}`,
      `L${f(x + w - tx)} ${f(cy - ty)}`,
      `Q${f(x + w)} ${f(cy)} ${f(x + w - tx)} ${f(cy + ty)}`,
      `L${f(cx + tx)} ${f(y + h - ty)}`,
      `Q${f(cx)} ${f(y + h)} ${f(cx - tx)} ${f(y + h - ty)}`,
      `L${f(x + tx)} ${f(cy + ty)}`,
      `Q${f(x)} ${f(cy)} ${f(x + tx)} ${f(cy - ty)}`,
      "Z",
    ].join(" ");
  }
  const r = round ? Math.min(w, h) * 0.12 + 2 : 0;
  if (!r) return `M${f(x)} ${f(y)} H${f(x + w)} V${f(y + h)} H${f(x)} Z`;
  return `M${f(x + r)} ${f(y)} H${f(x + w - r)} Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} V${f(y + h - r)} Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} H${f(x + r)} Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} V${f(y + r)} Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`;
}

/**
 * Everything drawn for a shape of `w` × `h`: background (solid or pattern) and outline, clean or
 * hand-drawn. Text shapes draw nothing (only their text).
 */
export function shapePaths(shape: Shape, w: number, h: number, opts: { seed: number; sketch?: boolean; ink?: string }): DrawPath[] {
  const s = resolveShape(shape, opts.sketch);
  if (s.type === "text" || s.type === "icon") return [];
  const stroke = s.stroke ?? opts.ink ?? "currentColor";
  const sw = s.strokeWidth;
  const pad = sw / 2 + 1;
  const x = pad;
  const y = pad;
  const iw = Math.max(1, w - pad * 2);
  const ih = Math.max(1, h - pad * 2);
  const dash = dashFor(s.strokeStyle, sw);
  const out: DrawPath[] = [];
  const outline = cleanOutline(s.type, x, y, iw, ih, s.round);

  if (s.fill) {
    if (s.fillStyle === "solid" && s.roughness === 0) out.push({ d: outline, fill: s.fill });
    else {
      // rough.js draws solid fills and patterns (hachure, cross-hatch, dots) inside the outline.
      const opt = {
        seed: opts.seed,
        roughness: s.roughness,
        fill: s.fill,
        fillStyle: s.fillStyle === "cross-hatch" ? "cross-hatch" : s.fillStyle === "dots" ? "dots" : s.fillStyle,
        fillWeight: Math.max(0.5, sw / 2),
        hachureGap: Math.max(4, sw * 4),
        stroke: "none",
      };
      const shapeD =
        s.type === "ellipse" ? gen.ellipse(x + iw / 2, y + ih / 2, iw, ih, opt) : s.type === "diamond" ? gen.polygon(diamondPts(x, y, iw, ih), opt) : gen.path(outline, opt);
      for (const p of gen.toPaths(shapeD)) if (p.fill !== "none" || p.stroke !== "none") out.push({ d: p.d, fill: p.fill === "none" ? undefined : p.fill, stroke: p.stroke === "none" ? undefined : p.stroke, strokeWidth: p.strokeWidth });
    }
  }

  if (s.roughness === 0) out.push({ d: outline, stroke, strokeWidth: sw, dash });
  else {
    const opt = { seed: opts.seed + 1, roughness: s.roughness, stroke: "#000", strokeWidth: sw, disableMultiStroke: s.strokeStyle !== "solid", preserveVertices: true };
    const drawable = s.type === "ellipse" ? gen.ellipse(x + iw / 2, y + ih / 2, iw, ih, opt) : s.type === "diamond" ? gen.polygon(diamondPts(x, y, iw, ih), opt) : gen.path(outline, opt);
    for (const p of gen.toPaths(drawable)) out.push({ d: p.d, stroke, strokeWidth: sw, dash });
  }
  return out;
}

function diamondPts(x: number, y: number, w: number, h: number): [number, number][] {
  return [
    [x + w / 2, y],
    [x + w, y + h / 2],
    [x + w / 2, y + h],
    [x, y + h / 2],
  ];
}

// ------------------------------------------------------------------ connections

/**
 * Where a line from the box's center toward `to` crosses the box's outline (rectangle, diamond or
 * ellipse), pushed out by `gap`.
 */
export function outlinePoint(box: Box, type: "rect" | "diamond" | "ellipse", to: Pt, gap = 0): Pt {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = to.x - cx;
  const dy = to.y - cy;
  const hw = Math.max(1, box.w / 2);
  const hh = Math.max(1, box.h / 2);
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  let t: number;
  if (type === "ellipse") t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  else if (type === "diamond") t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  const len = Math.hypot(dx, dy);
  const extra = gap / len;
  return { x: cx + dx * (t + extra), y: cy + dy * (t + extra) };
}

/** Both ends of a connection between two boxes, each on its own outline. */
export function floatingEnds(a: Box & { type: "rect" | "diamond" | "ellipse" }, b: Box & { type: "rect" | "diamond" | "ellipse" }, gap = 4): { start: Pt; end: Pt } {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return { start: outlinePoint(a, a.type, cb, gap), end: outlinePoint(b, b.type, ca, gap) };
}

/** The control point of a gentle curve between two points (bends to the left of the direction). */
export function curveControl(a: Pt, b: Pt): Pt {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const k = 0.22;
  return { x: mx - dy * k, y: my + dx * k };
}

/** Path of a connection: straight or curved, clean or hand-drawn. */
export function linkPaths(a: Pt, b: Pt, opts: { curve?: boolean; roughness: number; seed: number; strokeWidth: number }): string[] {
  const c = curveControl(a, b);
  if (opts.roughness === 0) return [opts.curve ? `M${f(a.x)} ${f(a.y)} Q${f(c.x)} ${f(c.y)} ${f(b.x)} ${f(b.y)}` : `M${f(a.x)} ${f(a.y)} L${f(b.x)} ${f(b.y)}`];
  const o = { seed: opts.seed, roughness: opts.roughness, strokeWidth: opts.strokeWidth, stroke: "#000" };
  const d = opts.curve ? gen.curve([[a.x, a.y], [c.x, c.y], [b.x, b.y]], o) : gen.line(a.x, a.y, b.x, b.y, o);
  return gen.toPaths(d).map((p) => p.d);
}

/** Point and direction (radians, pointing out of the line) at an end of a connection. */
export function endTangent(a: Pt, b: Pt, curve: boolean, atEnd: boolean): { at: Pt; angle: number } {
  const from = curve ? curveControl(a, b) : atEnd ? a : b;
  const at = atEnd ? b : a;
  return { at, angle: Math.atan2(at.y - from.y, at.x - from.x) };
}

/** An arrowhead at `at`, pointing along `angle`. Open heads are strokes; triangles and dots are filled. */
export function arrowheadPath(kind: Arrowhead, at: Pt, angle: number, width: number): { d: string; filled: boolean } | null {
  if (kind === "none") return null;
  const len = Math.max(9, width * 4.2);
  const p = (dist: number, turn: number): Pt => ({ x: at.x - dist * Math.cos(angle + turn), y: at.y - dist * Math.sin(angle + turn) });
  if (kind === "arrow") {
    const l = p(len, 0.42);
    const r = p(len, -0.42);
    return { d: `M${f(l.x)} ${f(l.y)} L${f(at.x)} ${f(at.y)} L${f(r.x)} ${f(r.y)}`, filled: false };
  }
  if (kind === "triangle") {
    const l = p(len, 0.38);
    const r = p(len, -0.38);
    return { d: `M${f(at.x)} ${f(at.y)} L${f(l.x)} ${f(l.y)} L${f(r.x)} ${f(r.y)} Z`, filled: true };
  }
  if (kind === "dot") {
    const r = Math.max(3, width * 1.8);
    const c = p(r, 0);
    return { d: `M${f(c.x - r)} ${f(c.y)} a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0 a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0 Z`, filled: true };
  }
  const half = Math.max(6, width * 3);
  const a1 = { x: at.x + half * Math.cos(angle + Math.PI / 2), y: at.y + half * Math.sin(angle + Math.PI / 2) };
  const a2 = { x: at.x - half * Math.cos(angle + Math.PI / 2), y: at.y - half * Math.sin(angle + Math.PI / 2) };
  return { d: `M${f(a1.x)} ${f(a1.y)} L${f(a2.x)} ${f(a2.y)}`, filled: false };
}

/** How far the line should stop short of an arrowhead so the tip stays crisp. */
export function headInset(kind: Arrowhead, width: number): number {
  if (kind === "triangle") return Math.max(9, width * 4.2) * 0.8;
  if (kind === "dot") return Math.max(3, width * 1.8);
  return 0;
}

/** Size of a text element for its content (single or multiple lines), measured when a canvas exists. */
export function measureText(text: string, font: DrawStyle["font"], size: number): { width: number; height: number } {
  const lines = (text || " ").split("\n");
  let width = Math.max(...lines.map((l) => l.length)) * size * 0.56;
  if (typeof document !== "undefined") {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      const family = font === "hand" ? FONT_STACK.hand : font === "mono" ? "ui-monospace, Menlo, monospace" : "Geist, ui-sans-serif, system-ui, sans-serif";
      ctx.font = `500 ${size}px ${family}`;
      width = Math.max(...lines.map((l) => ctx.measureText(l).width));
    }
  }
  return { width: Math.ceil(Math.max(size, width) + 16), height: Math.ceil(lines.length * size * 1.3 + 12) };
}
