/**
 * Drawn shapes and styled connections (pure, no DOM): style defaults, SVG paths — clean or
 * hand-drawn with rough.js, the same engine as Excalidraw — outline intersections for connections
 * that leave from a shape's border, and arrowheads.
 */
import rough from "roughjs";
import type { Arrowhead, EdgeStyle, OutlineType, Shape } from "@/domain/plan";

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

/** Joins points into a closed path. */
const poly = (pts: [number, number][]) => `M${pts.map(([px, py]) => `${f(px)} ${f(py)}`).join(" L")} Z`;

/** A path written in a 0–1 box (absolute commands, x y pairs), scaled to `x,y,w,h`. */
function unitPath(d: string, x: number, y: number, w: number, h: number): string {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (n) => f(i++ % 2 === 0 ? x + Number(n) * w : y + Number(n) * h));
}

const CLOUD = "M0.25 0.96 C0.07 0.96 -0.01 0.78 0.06 0.64 C-0.02 0.47 0.11 0.29 0.28 0.33 C0.32 0.11 0.56 0.04 0.68 0.2 C0.83 0.11 0.99 0.24 0.95 0.42 C1.03 0.56 1.0 0.86 0.79 0.96 Z";

/** Extra lines drawn over a shape (a cylinder's front rim). */
export function shapeDetail(type: OutlineType, x: number, y: number, w: number, h: number): string | null {
  if (type !== "cylinder") return null;
  const e = Math.min(h * 0.12, w * 0.25);
  return `M${f(x)} ${f(y + e)} A${f(w / 2)} ${f(e)} 0 0 0 ${f(x + w)} ${f(y + e)}`;
}

/** The outline of a shape type in a box (previews while drawing). */
export function outlinePath(type: OutlineType, x: number, y: number, w: number, h: number, round = true): string {
  return cleanOutline(type, x, y, w, h, round);
}

/** Clean outline of a shape inside `x,y,w,h`. */
function cleanOutline(type: OutlineType, x: number, y: number, w: number, h: number, round: boolean, radius?: number): string {
  if (type === "hexagon") {
    const k = Math.min(w * 0.25, h * 0.5);
    return poly([[x + k, y], [x + w - k, y], [x + w, y + h / 2], [x + w - k, y + h], [x + k, y + h], [x, y + h / 2]]);
  }
  if (type === "parallelogram") {
    const k = Math.min(w * 0.22, h);
    return poly([[x + k, y], [x + w, y], [x + w - k, y + h], [x, y + h]]);
  }
  if (type === "triangle") return poly([[x + w / 2, y], [x + w, y + h], [x, y + h]]);
  if (type === "star") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.42 : 1;
      pts.push([cx + Math.cos(a) * (w / 2) * r, cy + Math.sin(a) * (h / 2) * r + h * 0.05]);
    }
    return poly(pts);
  }
  if (type === "cylinder") {
    const e = Math.min(h * 0.12, w * 0.25);
    const rx = w / 2;
    return `M${f(x)} ${f(y + e)} A${f(rx)} ${f(e)} 0 0 1 ${f(x + w)} ${f(y + e)} V${f(y + h - e)} A${f(rx)} ${f(e)} 0 0 1 ${f(x)} ${f(y + h - e)} Z`;
  }
  if (type === "document") {
    const wv = h * 0.1;
    return `M${f(x)} ${f(y)} H${f(x + w)} V${f(y + h - wv)} C${f(x + w * 0.72)} ${f(y + h - wv * 2.8)} ${f(x + w * 0.3)} ${f(y + h + wv * 0.9)} ${f(x)} ${f(y + h - wv)} Z`;
  }
  if (type === "cloud") return unitPath(CLOUD, x, y, w, h);
  if (type === "speech") {
    const bh = h * 0.8;
    const r = Math.min(radius ?? Math.min(w, bh) * 0.16, w / 2, bh / 2);
    return [
      `M${f(x + r)} ${f(y)} H${f(x + w - r)} Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}`,
      `V${f(y + bh - r)} Q${f(x + w)} ${f(y + bh)} ${f(x + w - r)} ${f(y + bh)}`,
      `H${f(x + w * 0.36)} L${f(x + w * 0.16)} ${f(y + h)} L${f(x + w * 0.2)} ${f(y + bh)}`,
      `H${f(x + r)} Q${f(x)} ${f(y + bh)} ${f(x)} ${f(y + bh - r)} V${f(y + r)} Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`,
    ].join(" ");
  }
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
  const r = round ? Math.min(radius ?? Math.min(w, h) * 0.12 + 2, w / 2, h / 2) : 0;
  if (!r) return `M${f(x)} ${f(y)} H${f(x + w)} V${f(y + h)} H${f(x)} Z`;
  return `M${f(x + r)} ${f(y)} H${f(x + w - r)} Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} V${f(y + h - r)} Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} H${f(x + r)} Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} V${f(y + r)} Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`;
}

/**
 * The outline of a shape as a closed polyline (curves sampled), for formats that only know lines
 * (an Excalidraw export). The last point repeats the first.
 */
export function outlinePoints(type: OutlineType, x: number, y: number, w: number, h: number, opts: { round?: boolean; radius?: number } = {}): [number, number][] {
  if (type === "ellipse" || type === "cylinder") {
    const pts: [number, number][] = [];
    const n = 48;
    if (type === "ellipse") for (let i = 0; i <= n; i++) pts.push([x + w / 2 + (Math.cos((i / n) * 2 * Math.PI) * w) / 2, y + h / 2 + (Math.sin((i / n) * 2 * Math.PI) * h) / 2]);
    else {
      const e = Math.min(h * 0.12, w * 0.25);
      // Top rim (left to right, over the top), then down, bottom rim back, and up.
      for (let i = 0; i <= n / 2; i++) pts.push([x + w / 2 - (Math.cos((i / (n / 2)) * Math.PI) * w) / 2, y + e - Math.sin((i / (n / 2)) * Math.PI) * e]);
      for (let i = 0; i <= n / 2; i++) pts.push([x + w / 2 + (Math.cos((i / (n / 2)) * Math.PI) * w) / 2, y + h - e + Math.sin((i / (n / 2)) * Math.PI) * e]);
      pts.push(pts[0]);
    }
    return pts.map(([px, py]) => [r2(px), r2(py)]);
  }
  return samplePath(cleanOutline(type, x, y, w, h, opts.round ?? true, opts.radius));
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Points along a path of absolute M, L, H, V, Q, C and Z commands (what the outlines use besides arcs). */
function samplePath(d: string): [number, number][] {
  const out: [number, number][] = [];
  const tokens = d.match(/[MLHVQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(tokens[i++]);
  const steps = 10;
  while (i < tokens.length) {
    const c = tokens[i++];
    if (c === "M") {
      cx = sx = num();
      cy = sy = num();
      out.push([cx, cy]);
    } else if (c === "L") {
      cx = num();
      cy = num();
      out.push([cx, cy]);
    } else if (c === "H") out.push([(cx = num()), cy]);
    else if (c === "V") out.push([cx, (cy = num())]);
    else if (c === "Q") {
      const [qx, qy, ex, ey] = [num(), num(), num(), num()];
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const u = 1 - t;
        out.push([u * u * cx + 2 * u * t * qx + t * t * ex, u * u * cy + 2 * u * t * qy + t * t * ey]);
      }
      cx = ex;
      cy = ey;
    } else if (c === "C") {
      const [ax, ay, bx, by, ex, ey] = [num(), num(), num(), num(), num(), num()];
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const u = 1 - t;
        out.push([u * u * u * cx + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * ex, u * u * u * cy + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * ey]);
      }
      cx = ex;
      cy = ey;
    } else if (c === "Z" || c === "z") {
      if (cx !== sx || cy !== sy) out.push([sx, sy]);
      cx = sx;
      cy = sy;
    } // anything else (a stray number) is skipped
  }
  return out.map(([px, py]) => [r2(px), r2(py)]);
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
  const outline = cleanOutline(s.type, x, y, iw, ih, s.round, shape.radius);

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
  // A cylinder's front rim.
  const detail = shapeDetail(s.type, x, y, iw, ih);
  if (detail) {
    if (s.roughness === 0) out.push({ d: detail, stroke, strokeWidth: sw, dash });
    else for (const p of gen.toPaths(gen.path(detail, { seed: opts.seed + 2, roughness: s.roughness, stroke: "#000", strokeWidth: sw }))) out.push({ d: p.d, stroke, strokeWidth: sw, dash });
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

export const DEFAULT_BEND = 0.22;

/** The control point of a curve between two points (`bend` > 0 bows to the left of the direction). */
export function curveControl(a: Pt, b: Pt, bend = DEFAULT_BEND): Pt {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: mx - dy * bend, y: my + dx * bend };
}

/** The point halfway along the curve (where its bend handle sits). */
export function curveApex(a: Pt, b: Pt, bend = DEFAULT_BEND): Pt {
  const c = curveControl(a, b, bend);
  return { x: (a.x + b.x) / 4 + c.x / 2, y: (a.y + b.y) / 4 + c.y / 2 };
}

/** The bend that puts the curve's middle through `p` (its offset across the line). */
export function bendThrough(a: Pt, b: Pt, p: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const k = (2 * ((p.x - (a.x + b.x) / 2) * -dy + (p.y - (a.y + b.y) / 2) * dx)) / len2;
  return Math.max(-3, Math.min(3, Math.round(k * 1000) / 1000));
}

/** Path of a connection: straight or curved, clean or hand-drawn. */
export function linkPaths(a: Pt, b: Pt, opts: { curve?: boolean; bend?: number; roughness: number; seed: number; strokeWidth: number }): string[] {
  const c = curveControl(a, b, opts.bend);
  if (opts.roughness === 0) return [opts.curve ? `M${f(a.x)} ${f(a.y)} Q${f(c.x)} ${f(c.y)} ${f(b.x)} ${f(b.y)}` : `M${f(a.x)} ${f(a.y)} L${f(b.x)} ${f(b.y)}`];
  const o = { seed: opts.seed, roughness: opts.roughness, strokeWidth: opts.strokeWidth, stroke: "#000" };
  const d = opts.curve ? gen.curve([[a.x, a.y], [c.x, c.y], [b.x, b.y]], o) : gen.line(a.x, a.y, b.x, b.y, o);
  return gen.toPaths(d).map((p) => p.d);
}

/** Point and direction (radians, pointing out of the line) at an end of a connection. */
export function endTangent(a: Pt, b: Pt, curve: boolean, atEnd: boolean, bend?: number): { at: Pt; angle: number } {
  const from = curve ? curveControl(a, b, bend) : atEnd ? a : b;
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
