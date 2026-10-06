/**
 * Freehand strokes ("ink" nodes): turning pointer samples into a stored stroke and a stored
 * stroke into SVG paths. Pure (no DOM), shared by the editor, the canvas and tests.
 */
import { getStroke } from "perfect-freehand";
import type { Ink } from "@/domain/plan";

export type Point = [number, number];

export type InkMode = "pen" | "highlighter" | "arrow" | "rect" | "ellipse" | "text";

/** Modes drawn by dragging a box. */
export const isShapeMode = (m: InkMode): m is "rect" | "ellipse" => m === "rect" || m === "ellipse";

/** Handwritten-style annotation text: its type size for a stroke width (2 / 4 / 8 → 17 / 22 / 32). */
export const inkFontSize = (size: number) => Math.round(12 + size * 2.5);

/** Box for a text annotation (single line), measured when a canvas is available. */
export function textBox(text: string, size: number): { width: number; height: number } {
  const font = inkFontSize(size);
  let width = text.length * font * 0.55;
  if (typeof document !== "undefined") {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.font = `600 ${font}px ${INK_FONT}`;
      width = ctx.measureText(text).width;
    }
  }
  return { width: Math.max(24, Math.ceil(width + 14)), height: Math.ceil(font * 1.35 + 6) };
}

/** Font of text annotations (planner.css uses the same stack). */
export const INK_FONT = '"Bradley Hand", "Segoe Print", "Chalkboard SE", "Comic Sans MS", cursive';

/** Ink colors: theme-adaptive ink first (stored as no color), then fixed colors that read on both canvases. */
export const INK_COLORS: { value: string | undefined; name: string }[] = [
  { value: undefined, name: "Tinta (segue o tema)" },
  { value: "#E5484D", name: "Vermelho" },
  { value: "#F76B15", name: "Laranja" },
  { value: "#FFC53D", name: "Amarelo" },
  { value: "#30A46C", name: "Verde" },
  { value: "#0090FF", name: "Azul" },
  { value: "#8E4EC6", name: "Roxo" },
  { value: "#D6409F", name: "Rosa" },
];

/** Stroke widths offered in the toolbar (canvas units). */
export const INK_SIZES = [2, 4, 8] as const;

/** The highlighter is a wide, translucent marker. */
export const HIGHLIGHTER_SCALE = 4;
export const HIGHLIGHTER_COLOR = "#FFC53D";

const MAX_POINTS = 1500;
const round = (v: number) => Math.round(v * 10) / 10;

export function pairsOf(flat: number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

/** Drops samples closer than `minDist` and thins very long strokes. */
export function simplify(points: Point[], minDist: number): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [points[0]];
  for (const p of points.slice(1, -1)) {
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= minDist) out.push(p);
  }
  out.push(points[points.length - 1]);
  if (out.length <= MAX_POINTS) return out;
  const step = out.length / MAX_POINTS;
  return Array.from({ length: MAX_POINTS }, (_, i) => out[Math.min(out.length - 1, Math.round(i * step))]);
}

/**
 * A stroke drawn on the canvas (points in canvas coordinates) as an ink node box: position,
 * size and the points relative to it. Null for a stroke too small to keep.
 */
export function buildInk(points: Point[], opts: { size: number; mode: InkMode; zoom?: number }): { x: number; y: number; width: number; height: number; ink: Ink } | null {
  if (points.length === 0) return null;
  if (opts.mode === "text") return null;
  if (isShapeMode(opts.mode)) {
    const [a, b] = [points[0], points[points.length - 1]];
    const w = Math.abs(b[0] - a[0]);
    const h = Math.abs(b[1] - a[1]);
    if (Math.max(w, h) < Math.max(8, opts.size * 3) / (opts.zoom ?? 1)) return null;
    const pad = opts.size / 2 + 1;
    const x = Math.min(a[0], b[0]) - pad;
    const y = Math.min(a[1], b[1]) - pad;
    const width = Math.max(4, w + pad * 2);
    const height = Math.max(4, h + pad * 2);
    return {
      x: round(x),
      y: round(y),
      width: round(width),
      height: round(height),
      ink: { points: [round(pad), round(pad), round(width - pad), round(height - pad)], w: round(width), h: round(height), size: opts.size, shape: opts.mode },
    };
  }
  const arrow = opts.mode === "arrow";
  const highlighter = opts.mode === "highlighter";
  const size = highlighter ? opts.size * HIGHLIGHTER_SCALE : opts.size;
  let pts = arrow ? [points[0], points[points.length - 1]] : simplify(points, 0.75 / (opts.zoom ?? 1));
  if (pts.length === 1) pts = [pts[0], [pts[0][0] + 0.1, pts[0][1] + 0.1]];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  if (arrow && Math.hypot(maxX - minX, maxY - minY) < size * 2) return null;
  // Room for the stroke's own width (and the arrowhead).
  const pad = arrow ? size * 4 : size;
  const x = minX - pad;
  const y = minY - pad;
  const width = Math.max(4, maxX - minX + pad * 2);
  const height = Math.max(4, maxY - minY + pad * 2);
  const flat = pts.flatMap(([px, py]) => [round(px - x), round(py - y)]);
  const ink: Ink = { points: flat, w: round(width), h: round(height), size: round(size) };
  if (highlighter) ink.highlighter = true;
  if (arrow) ink.arrow = true;
  return { x: round(x), y: round(y), width: round(width), height: round(height), ink };
}

/** SVG path of a polygon outline (perfect-freehand's output). */
function pathOf(outline: number[][]): string {
  if (outline.length < 2) return "";
  const [first, ...rest] = outline;
  let d = `M${first[0].toFixed(1)} ${first[1].toFixed(1)} Q`;
  for (let i = 0; i < rest.length; i++) {
    const [x0, y0] = rest[i];
    const [x1, y1] = rest[(i + 1) % rest.length];
    d += ` ${x0.toFixed(1)} ${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`;
  }
  return `${d} Z`;
}

/** Filled outline of a freehand stroke. Pen strokes taper; the highlighter keeps an even width. */
export function strokeOutline(points: Point[], size: number, highlighter = false): string {
  return pathOf(
    getStroke(points, {
      size,
      thinning: highlighter ? 0 : 0.55,
      smoothing: 0.6,
      streamline: 0.45,
      simulatePressure: !highlighter,
      start: { cap: true },
      end: { cap: true },
      last: true,
    }),
  );
}

/** Center line (for hit testing and the arrow shaft). */
export function centerline(points: Point[]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

/** Closed triangle at the end of a straight arrow from `a` to `b`. */
export function arrowHead(a: Point, b: Point, size: number): string {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const len = Math.max(10, size * 3.2);
  const spread = Math.PI / 7;
  const p1: Point = [b[0] - len * Math.cos(angle - spread), b[1] - len * Math.sin(angle - spread)];
  const p2: Point = [b[0] - len * Math.cos(angle + spread), b[1] - len * Math.sin(angle + spread)];
  return `M${b[0].toFixed(1)} ${b[1].toFixed(1)} L${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)} Z`;
}

/** Everything the canvas draws for a stored stroke, in its own box (`ink.w` × `ink.h`). */
export function inkPaths(ink: Ink): { fill: string; line: string; head?: string } {
  const pts = pairsOf(ink.points);
  if (ink.arrow && pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    // Stop the shaft inside the head so the tip stays sharp.
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const back = Math.max(10, ink.size * 3.2) * 0.6;
    const end: Point = [b[0] - back * Math.cos(angle), b[1] - back * Math.sin(angle)];
    return { fill: "", line: centerline([a, end]), head: arrowHead(a, b, ink.size) };
  }
  return { fill: strokeOutline(pts, ink.size, ink.highlighter), line: centerline(pts) };
}

/** A text annotation at a point (canvas coordinates): the box starts small and grows with the text. */
export function buildTextInk(at: { x: number; y: number }, size: number): { x: number; y: number; width: number; height: number; ink: Ink } {
  const { width, height } = textBox("", size);
  const y = at.y - height / 2;
  return { x: round(at.x), y: round(y), width, height, ink: { points: [0, 0, width, height], w: width, h: height, size, shape: "text" } };
}

/** Outline of a drawn rectangle or ellipse inside a `width` × `height` box. */
export function shapePath(shape: "rect" | "ellipse", width: number, height: number, size: number): string {
  const p = size / 2 + 1;
  const w = Math.max(1, width - p * 2);
  const h = Math.max(1, height - p * 2);
  if (shape === "ellipse") {
    const rx = w / 2;
    const ry = h / 2;
    const cx = p + rx;
    return `M${(cx - rx).toFixed(1)} ${(p + ry).toFixed(1)} a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(rx * 2).toFixed(1)} 0 a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(-rx * 2).toFixed(1)} 0 Z`;
  }
  const r = Math.min(size * 2 + 4, w / 2, h / 2);
  return `M${(p + r).toFixed(1)} ${p.toFixed(1)} H${(p + w - r).toFixed(1)} Q${(p + w).toFixed(1)} ${p.toFixed(1)} ${(p + w).toFixed(1)} ${(p + r).toFixed(1)} V${(p + h - r).toFixed(1)} Q${(p + w).toFixed(1)} ${(p + h).toFixed(1)} ${(p + w - r).toFixed(1)} ${(p + h).toFixed(1)} H${(p + r).toFixed(1)} Q${p.toFixed(1)} ${(p + h).toFixed(1)} ${p.toFixed(1)} ${(p + h - r).toFixed(1)} V${(p + r).toFixed(1)} Q${p.toFixed(1)} ${p.toFixed(1)} ${(p + r).toFixed(1)} ${p.toFixed(1)} Z`;
}
