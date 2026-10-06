/**
 * Excalidraw interop: plans to Excalidraw scenes and back. Pure (no DOM).
 *
 * Shapes, drawn connections, freehand strokes, texts, frames and images map to their Excalidraw
 * twins. Waypoint-only elements (blocks, notes, containers…) become rectangles with their title,
 * and every element carries what Excalidraw can't hold (kind, layer, resource, status…) in its
 * `customData`, so exporting, editing in Excalidraw and importing again keeps layers and kinds.
 */
import { EDGE_APPEARANCE } from "@/domain/canvas-adapter";
import { BASE_LAYER_ID, layersOf } from "@/domain/layers";
import {
  planLayerSchema,
  planNodeSchema,
  planViewSchema,
  type Arrowhead,
  type EdgeStyle,
  type NodeData,
  type PlanDocument,
  type PlanEdge,
  type PlanLayer,
  type PlanNode,
  type PlanView,
  type Shape,
} from "@/domain/plan";
import { readableText } from "@/lib/color";
import { HIGHLIGHTER_COLOR, inkFontSize, pairsOf } from "./ink-geometry";
import { curveControl, floatingEnds, measureText, seedOf, type Box, type Pt } from "./shape-geometry";

// ------------------------------------------------------------------ the Excalidraw format (the parts we use)

export type ExBinding = { elementId: string; focus?: number; gap?: number; fixedPoint?: [number, number] | null };

export type ExElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  frameId?: string | null;
  roundness?: { type: number; value?: number } | null;
  seed?: number;
  isDeleted?: boolean;
  boundElements?: { id: string; type: string }[] | null;
  link?: string | null;
  locked?: boolean;
  text?: string;
  originalText?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  containerId?: string | null;
  points?: [number, number][];
  startBinding?: ExBinding | null;
  endBinding?: ExBinding | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  elbowed?: boolean;
  fileId?: string | null;
  name?: string | null;
  customData?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ExFile = { id: string; mimeType: string; dataURL: string; created?: number };

export type ExScene = {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: ExElement[];
  appState: Record<string, unknown>;
  files: Record<string, ExFile>;
  /** Not read by Excalidraw: what a Waypoint import restores when the file comes back untouched. */
  waypoint?: { title?: string; views?: PlanView[] };
};

export const EXCALIDRAW_MIME = "application/vnd.excalidraw+json";
export const CLIPBOARD_TYPE = "excalidraw/clipboard";

/** What Waypoint keeps on each Excalidraw element. */
type WpCustom = {
  kind?: PlanNode["kind"];
  data?: Partial<NodeData>;
  parentId?: string;
  layer?: PlanLayer & { order?: number };
  edge?: Pick<PlanEdge, "kind" | "label" | "description" | "step"> & { styled?: boolean };
  highlighter?: boolean;
};

const INK = "#1e1e1e";
const SOURCE = "https://waypoint.app";

const FONT_ID = { hand: 5, sans: 2, mono: 3 } as const;
const fontOf = (id: number | undefined): NonNullable<Shape["font"]> => (id === 3 || id === 8 ? "mono" : id === 1 || id === 5 || id === 7 ? "hand" : "sans");

const HEAD_OUT: Record<Arrowhead, string | null> = { none: null, arrow: "arrow", triangle: "triangle", dot: "dot", bar: "bar" };
function headIn(h: string | null | undefined): Arrowhead {
  if (!h) return "none";
  if (h === "arrow") return "arrow";
  if (h === "bar") return "bar";
  if (h.startsWith("triangle") || h.startsWith("diamond")) return "triangle";
  if (h === "dot" || h.startsWith("circle")) return "dot";
  return "arrow";
}

const FILL_OUT: Record<NonNullable<Shape["fillStyle"]>, string> = { solid: "solid", hachure: "hachure", "cross-hatch": "cross-hatch", dots: "cross-hatch" };
function fillIn(f: string | undefined): Shape["fillStyle"] {
  return f === "hachure" || f === "zigzag" || f === "zigzag-line" ? "hachure" : f === "cross-hatch" ? "cross-hatch" : undefined;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A CSS color from Excalidraw as #RRGGBB (transparent, named or rgba colors are dropped). */
export function hexOf(c: string | undefined): string | undefined {
  if (!c) return undefined;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c.trim());
  if (!m) return undefined;
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  return `#${h.toUpperCase()}`;
}

/** Excalidraw's default ink reads as "no color" (the theme's ink) in Waypoint. */
const strokeIn = (c: string | undefined) => {
  const h = hexOf(c);
  return h && h !== "#1E1E1E" && h !== "#000000" ? h : undefined;
};

// ------------------------------------------------------------------ export

type ExportOpts = {
  /** Which layers go in (default: the visible ones). */
  visible?: (layerId: string) => boolean;
  /** Image files by the node's image URL (the caller fetches them). */
  images?: Record<string, ExFile>;
  title?: string;
  /** `updated` stamp of the elements. */
  now?: number;
};

/** The image URLs a plan uses (to fetch before exporting). */
export function imageUrls(doc: Pick<PlanDocument, "nodes">): string[] {
  return [...new Set(doc.nodes.filter((n) => n.kind === "image" && n.data.image).map((n) => n.data.image!))];
}

function absolutePositions(nodes: PlanNode[]): Map<string, Pt> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, Pt>();
  const at = (n: PlanNode, depth = 0): Pt => {
    const known = out.get(n.id);
    if (known) return known;
    const p = n.parentId && byId.get(n.parentId) && depth < 50 ? at(byId.get(n.parentId)!, depth + 1) : { x: 0, y: 0 };
    const pos = { x: p.x + n.x, y: p.y + n.y };
    out.set(n.id, pos);
    return pos;
  };
  for (const n of nodes) at(n);
  return out;
}

/** Splits text into lines that fit `maxWidth` (an estimate; Excalidraw rewraps when edited). */
function wrap(text: string, fontSize: number, maxWidth: number): string {
  const per = Math.max(4, Math.floor(maxWidth / (fontSize * 0.55)));
  return text
    .split("\n")
    .flatMap((line) => {
      const out: string[] = [];
      let cur = "";
      for (const word of line.split(" ")) {
        const next = cur ? `${cur} ${word}` : word;
        if (next.length > per && cur) {
          out.push(cur);
          cur = word;
        } else cur = next;
      }
      out.push(cur);
      return out;
    })
    .join("\n");
}

const textSize = (text: string, fontSize: number) => {
  const lines = text.split("\n");
  return { width: Math.max(...lines.map((l) => l.length), 1) * fontSize * 0.55, height: lines.length * fontSize * 1.25 };
};

/** Converts a plan (its visible layers by default) into an Excalidraw scene. */
export function toExcalidraw(doc: PlanDocument, opts: ExportOpts = {}): ExScene {
  const now = opts.now ?? Date.now();
  const layers = layersOf(doc);
  const layerById = new Map(layers.map((l, i) => [l.id, { ...l, order: i }]));
  const shown = opts.visible ?? ((id: string) => layerById.get(id)?.visible !== false);
  const nodes = doc.nodes.filter((n) => shown(n.layer ?? BASE_LAYER_ID));
  const ids = new Set(nodes.map((n) => n.id));
  const abs = absolutePositions(doc.nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, PlanNode[]>();
  for (const n of nodes) if (n.parentId && ids.has(n.parentId)) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  const sketchOf = (layer: string | undefined) => !!layerById.get(layer ?? BASE_LAYER_ID)?.sketch;
  /** The frame a node sits in (Excalidraw has one level of frames). */
  const frameOf = (n: PlanNode): string | null => {
    for (let p = n.parentId ? byId.get(n.parentId) : undefined, i = 0; p && i < 50; p = p.parentId ? byId.get(p.parentId) : undefined, i++) if (p.kind === "frame") return p.id;
    return null;
  };
  const layerCustom = (layer: string | undefined): Pick<WpCustom, "layer"> => {
    const l = layer && layer !== BASE_LAYER_ID ? layerById.get(layer) : undefined;
    return l ? { layer: l } : {};
  };

  const files: Record<string, ExFile> = {};
  const out: ExElement[] = [];
  const els = new Map<string, ExElement>();

  const base = (id: string, type: string, box: Box, extra: Partial<ExElement> = {}): ExElement => {
    const seed = seedOf(id);
    return {
      id,
      type,
      x: r1(box.x),
      y: r1(box.y),
      width: r1(Math.max(1, box.w)),
      height: r1(Math.max(1, box.h)),
      angle: 0,
      strokeColor: INK,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed,
      version: 1,
      versionNonce: (seed * 2654435761) % 2 ** 31,
      isDeleted: false,
      boundElements: null,
      updated: now,
      link: null,
      locked: false,
      ...extra,
    };
  };

  const bindTo = (container: ExElement, el: { id: string; type: string }) => {
    container.boundElements = [...(container.boundElements ?? []), el];
  };

  const label = (container: ExElement, text: string, o: { fontSize: number; font: NonNullable<Shape["font"]>; align?: string; valign?: "top" | "middle"; color?: string; at?: Pt }) => {
    if (!text.trim()) return;
    const pad = 5;
    const inner = container.type === "ellipse" ? container.width * 0.7 : container.type === "diamond" ? container.width * 0.5 : container.width - pad * 2;
    const t = o.at ? text : wrap(text, o.fontSize, Math.max(20, inner));
    const size = textSize(t, o.fontSize);
    const align = o.align ?? "center";
    const cx = o.at ? o.at.x : container.x + container.width / 2;
    const cy = o.at ? o.at.y : container.y + container.height / 2;
    const x = align === "left" && !o.at ? container.x + pad : align === "right" && !o.at ? container.x + container.width - pad - size.width : cx - size.width / 2;
    const y = o.valign === "top" && !o.at ? container.y + pad : cy - size.height / 2;
    const el = base(`${container.id}:t`, "text", { x, y, w: size.width, h: size.height }, {
      strokeColor: o.color ?? container.strokeColor,
      text: t,
      originalText: text,
      fontSize: o.fontSize,
      fontFamily: FONT_ID[o.font],
      textAlign: align,
      verticalAlign: o.valign ?? "middle",
      containerId: container.id,
      autoResize: true,
      lineHeight: 1.25,
      frameId: container.frameId,
    });
    bindTo(container, { id: el.id, type: "text" });
    out.push(el);
  };

  const custom = (n: PlanNode, extra: WpCustom = {}): Record<string, unknown> => {
    const { title: _t, shape: _s, ink: _i, ...data } = n.data;
    const wp: WpCustom = { kind: n.kind, ...layerCustom(n.layer), ...extra };
    if (Object.keys(data).length) wp.data = data;
    if (n.parentId && ids.has(n.parentId)) wp.parentId = n.parentId;
    return { waypoint: wp };
  };

  const emitNode = (n: PlanNode) => {
    const p = abs.get(n.id)!;
    const box = { x: p.x, y: p.y, w: n.width, h: n.height };
    const frameId = frameOf(n);
    const common = { frameId, customData: custom(n) };
    const url = n.data.resource?.type === "url" ? n.data.resource.url : null;
    const sketch = sketchOf(n.layer);

    if (n.kind === "shape" && n.data.shape) {
      const s = n.data.shape;
      const stroke = s.stroke ?? INK;
      const style = {
        strokeColor: stroke,
        strokeWidth: s.strokeWidth ?? 2,
        strokeStyle: s.strokeStyle ?? "solid",
        roughness: clamp(Math.round(s.roughness ?? (sketch ? 1 : 0)), 0, 2),
        opacity: Math.round((s.opacity ?? 1) * 100),
        link: url,
        ...common,
      };
      if (s.type === "text") {
        const fontSize = s.fontSize ?? 20;
        const text = n.data.title;
        const size = textSize(text || " ", fontSize);
        const el = base(n.id, "text", { ...box, w: Math.max(box.w - 16, size.width), h: size.height }, {
          ...style,
          x: r1(box.x + 8),
          y: r1(box.y + 6),
          text,
          originalText: text,
          fontSize,
          fontFamily: FONT_ID[s.font ?? "sans"],
          textAlign: s.align ?? "left",
          verticalAlign: "top",
          containerId: null,
          autoResize: true,
          lineHeight: 1.25,
        });
        out.push(el);
        els.set(n.id, el);
        return;
      }
      const el = base(n.id, s.type === "rect" ? "rectangle" : s.type, box, {
        ...style,
        backgroundColor: s.fill ?? "transparent",
        fillStyle: FILL_OUT[s.fillStyle ?? "solid"],
        roundness: s.round === false || s.type === "ellipse" ? null : { type: s.type === "rect" ? 3 : 2 },
        seed: s.seed ?? seedOf(n.id),
      });
      out.push(el);
      els.set(n.id, el);
      label(el, n.data.title, { fontSize: s.fontSize ?? 20, font: s.font ?? "sans", align: s.align, color: stroke });
      return;
    }

    if (n.kind === "ink" && n.data.ink) {
      const ink = n.data.ink;
      const color = n.data.color ?? (ink.highlighter ? HIGHLIGHTER_COLOR : INK);
      const sx = n.width / ink.w;
      const sy = n.height / ink.h;
      if (ink.shape === "text") {
        const fontSize = inkFontSize(ink.size);
        const el = base(n.id, "text", box, { strokeColor: color, text: n.data.title, originalText: n.data.title, fontSize, fontFamily: FONT_ID.hand, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25, ...common });
        out.push(el);
        els.set(n.id, el);
        return;
      }
      if (ink.shape === "rect" || ink.shape === "ellipse") {
        const el = base(n.id, ink.shape === "rect" ? "rectangle" : "ellipse", box, { strokeColor: color, strokeWidth: clamp(ink.size / 2, 1, 8), roughness: 1, roundness: ink.shape === "rect" ? { type: 3 } : null, ...common });
        out.push(el);
        els.set(n.id, el);
        return;
      }
      const pts = pairsOf(ink.points).map(([x, y]) => [x * sx, y * sy] as [number, number]);
      const [x0, y0] = pts[0];
      const rel = pts.map(([x, y]) => [r1(x - x0), r1(y - y0)] as [number, number]);
      const xs = rel.map((q) => q[0]);
      const ys = rel.map((q) => q[1]);
      const geo = { x: p.x + x0, y: p.y + y0, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      if (ink.arrow || ink.line) {
        const el = base(n.id, ink.arrow ? "arrow" : "line", geo, {
          strokeColor: color,
          strokeWidth: clamp(ink.size / 2, 1, 8),
          roughness: 1,
          points: rel,
          lastCommittedPoint: null,
          startBinding: null,
          endBinding: null,
          startArrowhead: null,
          endArrowhead: ink.arrow ? "arrow" : null,
          ...common,
        });
        out.push(el);
        els.set(n.id, el);
        return;
      }
      const el = base(n.id, "freedraw", geo, {
        strokeColor: color,
        strokeWidth: r1(clamp(ink.size / 4.25, 0.5, 20)),
        opacity: ink.highlighter ? 50 : 100,
        points: rel,
        pressures: [],
        simulatePressure: true,
        lastCommittedPoint: null,
        ...common,
        customData: custom(n, ink.highlighter ? { highlighter: true } : {}),
      });
      out.push(el);
      els.set(n.id, el);
      return;
    }

    if (n.kind === "frame") {
      const el = base(n.id, "frame", box, { name: n.data.title || null, strokeWidth: 2, ...common, frameId: null });
      els.set(n.id, el);
      // Excalidraw keeps a frame above its children.
      for (const c of children.get(n.id) ?? []) emitTree(c);
      out.push(el);
      return;
    }

    if (n.kind === "image" && n.data.image && opts.images?.[n.data.image]) {
      const f = opts.images[n.data.image];
      files[f.id] = { ...f, created: f.created ?? now };
      const el = base(n.id, "image", box, { fileId: f.id, status: "saved", scale: [1, 1], crop: null, link: url, ...common });
      out.push(el);
      els.set(n.id, el);
      return;
    }

    if (n.kind === "text") {
      const el = base(n.id, "text", box, { text: n.data.title, originalText: n.data.title, fontSize: 20, fontFamily: FONT_ID.sans, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25, link: url, ...common });
      out.push(el);
      els.set(n.id, el);
      return;
    }

    // Blocks, notes, link cards, containers, sections and images without a file: a box with the title.
    const area = n.kind === "container" || n.kind === "section";
    const bg = n.data.color ?? (n.kind === "section" ? undefined : n.kind === "note" ? "#FFF3C4" : area ? undefined : "#FFFFFF");
    const ink = bg ? readableText(bg) : null;
    const el = base(n.id, "rectangle", box, {
      backgroundColor: bg ?? "transparent",
      strokeColor: n.kind === "section" ? "#868E96" : INK,
      strokeWidth: area ? 1 : 1.5,
      strokeStyle: n.kind === "section" ? "dashed" : "solid",
      roughness: sketch ? 1 : 0,
      roundness: { type: 3 },
      link: url ?? (n.kind === "image" ? n.data.image ?? null : null),
      ...common,
    });
    out.push(el);
    els.set(n.id, el);
    const text = n.kind === "note" && n.data.description ? `${n.data.title}\n\n${n.data.description}` : n.data.title || (n.kind === "link" && url ? url : "");
    label(el, text, { fontSize: area ? 18 : 16, font: "sans", align: area || n.kind === "note" ? "left" : "center", valign: area || n.kind === "note" ? "top" : "middle", color: ink?.fg ?? INK });
    for (const c of children.get(n.id) ?? []) emitTree(c);
  };

  const emitTree = (n: PlanNode) => emitNode(n);
  for (const n of nodes) if (!n.parentId || !ids.has(n.parentId)) emitTree(n);

  // Connections: arrows bound to both ends, on top of the shapes.
  const BINDABLE = new Set(["rectangle", "diamond", "ellipse", "text", "image", "frame"]);
  const typeOf = (n: PlanNode): "rect" | "diamond" | "ellipse" => (n.kind === "shape" && (n.data.shape?.type === "diamond" || n.data.shape?.type === "ellipse") ? n.data.shape.type : "rect");
  for (const e of doc.edges) {
    if (!shown(e.layer ?? BASE_LAYER_ID)) continue;
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    const pa = abs.get(a.id)!;
    const pb = abs.get(b.id)!;
    const { start, end } = floatingEnds({ x: pa.x, y: pa.y, w: a.width, h: a.height, type: typeOf(a) }, { x: pb.x, y: pb.y, w: b.width, h: b.height, type: typeOf(b) }, 4);
    const st: EdgeStyle | undefined = e.style;
    const app = EDGE_APPEARANCE[e.kind];
    const routing = st?.routing ?? (st ? "straight" : "elbow");
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let points: [number, number][] = [
      [0, 0],
      [dx, dy],
    ];
    let roundness: ExElement["roundness"] = null;
    if (routing === "curve") {
      const c = curveControl(start, end);
      // Excalidraw's curve passes through its middle point: the quadratic's midpoint.
      points = [[0, 0], [(c.x - start.x) / 2 + dx / 4, (c.y - start.y) / 2 + dy / 4], [dx, dy]];
      roundness = { type: 2 };
    } else if (routing === "elbow" && Math.abs(dx) > 8 && Math.abs(dy) > 8) {
      points = Math.abs(dx) >= Math.abs(dy) ? [[0, 0], [dx / 2, 0], [dx / 2, dy], [dx, dy]] : [[0, 0], [0, dy / 2], [dx, dy / 2], [dx, dy]];
    }
    const xs = points.map((q) => q[0]);
    const ys = points.map((q) => q[1]);
    const ea = els.get(a.id);
    const eb = els.get(b.id);
    const bindA = ea && BINDABLE.has(ea.type);
    const bindB = eb && BINDABLE.has(eb.type);
    const head = (h: Arrowhead | undefined, fallback: Arrowhead) => HEAD_OUT[h ?? fallback];
    const el = base(e.id, "arrow", { x: start.x, y: start.y, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, {
      strokeColor: st?.stroke ?? INK,
      strokeWidth: st?.strokeWidth ?? (e.kind === "strong" ? 4 : app.strokeWidth),
      strokeStyle: st?.strokeStyle ?? (e.kind === "dependency" ? "dashed" : "solid"),
      roughness: clamp(Math.round(st?.roughness ?? (sketchOf(e.layer) ? 1 : 0)), 0, 2),
      seed: st?.seed ?? seedOf(e.id),
      roundness,
      points: points.map(([x, y]) => [r1(x), r1(y)] as [number, number]),
      lastCommittedPoint: null,
      startBinding: bindA ? { elementId: a.id, focus: 0, gap: 4 } : null,
      endBinding: bindB ? { elementId: b.id, focus: 0, gap: 4 } : null,
      startArrowhead: st ? head(st.start, "none") : null,
      endArrowhead: st ? head(st.end, "arrow") : app.arrow ? "arrow" : null,
      elbowed: false,
      customData: {
        waypoint: {
          ...layerCustom(e.layer),
          edge: { kind: e.kind, label: e.label, description: e.description, step: e.step, styled: !!st },
        } satisfies WpCustom,
      },
    });
    if (bindA) bindTo(ea, { id: el.id, type: "arrow" });
    if (bindB) bindTo(eb, { id: el.id, type: "arrow" });
    out.push(el);
    const text = [e.step ? `${e.step}.` : "", e.label ?? ""].filter(Boolean).join(" ");
    const mid = routing === "curve" ? { x: start.x + points[1][0], y: start.y + points[1][1] } : { x: start.x + dx / 2, y: start.y + dy / 2 };
    label(el, text, { fontSize: 16, font: "sans", at: mid, color: st?.stroke ?? INK });
  }

  return {
    type: "excalidraw",
    version: 2,
    source: SOURCE,
    elements: out,
    appState: { viewBackgroundColor: "#ffffff", gridSize: 20, ...(opts.title ? { name: opts.title } : {}) },
    files,
    waypoint: { title: opts.title, ...(doc.views?.length ? { views: doc.views } : {}) },
  };
}

/** What Excalidraw's own copy puts on the clipboard (paste it into excalidraw.com). */
export function toClipboard(scene: ExScene): string {
  return JSON.stringify({ type: CLIPBOARD_TYPE, elements: scene.elements, files: scene.files });
}

// ------------------------------------------------------------------ import

export type Imported = {
  nodes: PlanNode[];
  edges: PlanEdge[];
  /** Layers restored from a Waypoint export (empty for plain Excalidraw files). */
  layers: PlanLayer[];
  views: PlanView[];
  /** Image nodes waiting for their file to be uploaded (the node's `data.image` is set after). */
  images: { nodeId: string; file: ExFile }[];
  title?: string;
};

/** Reads an Excalidraw scene or clipboard payload; null when it isn't one. */
export function parseScene(json: unknown): Pick<ExScene, "elements" | "files" | "waypoint" | "appState"> | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Partial<ExScene> & { type?: string };
  if ((o.type !== "excalidraw" && o.type !== CLIPBOARD_TYPE && o.type !== "excalidrawlib") || !Array.isArray(o.elements)) return null;
  const elements = o.elements.filter((e): e is ExElement => !!e && typeof e === "object" && typeof e.id === "string" && typeof e.type === "string" && Number.isFinite(e.x) && Number.isFinite(e.y));
  return { elements, files: o.files && typeof o.files === "object" ? o.files : {}, waypoint: o.waypoint, appState: o.appState ?? {} };
}

const wpOf = (el: ExElement): WpCustom => {
  const c = el.customData?.waypoint;
  return c && typeof c === "object" ? (c as WpCustom) : {};
};

const linkOf = (el: ExElement): NodeData["resource"] => (typeof el.link === "string" && /^https?:\/\/\S+$/i.test(el.link) && el.link.length <= 2048 ? { type: "url", url: el.link } : undefined);

/**
 * Converts an Excalidraw scene into plan nodes and connections. `newId` renames everything (to
 * insert into a plan that may already hold these ids).
 */
export function fromExcalidraw(scene: Pick<ExScene, "elements" | "files" | "waypoint" | "appState">, opts: { newId?: () => string } = {}): Imported {
  const live = scene.elements.filter((e) => !e.isDeleted);
  const byId = new Map(live.map((e) => [e.id, e]));
  const rename = new Map<string, string>();
  const idOf = (id: string) => {
    if (!opts.newId) return id.slice(0, 64);
    let v = rename.get(id);
    if (!v) rename.set(id, (v = opts.newId()));
    return v;
  };
  // Text inside a shape or on an arrow belongs to it.
  const boundText = new Map<string, ExElement>();
  for (const e of live) if (e.type === "text" && e.containerId && byId.has(e.containerId)) boundText.set(e.containerId, e);
  const textOf = (e: ExElement) => {
    const t = boundText.get(e.id);
    return t ? (t.originalText ?? t.text ?? "") : "";
  };

  const nodes: PlanNode[] = [];
  const edges: PlanEdge[] = [];
  const images: Imported["images"] = [];
  const layers = new Map<string, PlanLayer & { order?: number }>();
  const absOf = new Map<string, Pt>();
  const parentOf = new Map<string, string>();
  const made = new Set<string>();

  const push = (el: ExElement, node: Omit<PlanNode, "id" | "x" | "y" | "width" | "height"> & Partial<Pick<PlanNode, "width" | "height">>, box?: Box) => {
    const wp = wpOf(el);
    const b = box ?? { x: el.x, y: el.y, w: el.width, h: el.height };
    const parsed = planLayerSchema.safeParse(wp.layer);
    if (parsed.success && parsed.data.id !== BASE_LAYER_ID) {
      if (!layers.has(parsed.data.id)) layers.set(parsed.data.id, { ...parsed.data, order: wp.layer?.order });
      node = { ...node, layer: parsed.data.id };
    }
    const raw = { ...node, id: idOf(el.id), x: Math.round(b.x), y: Math.round(b.y), width: Math.max(4, Math.round(node.width ?? b.w)), height: Math.max(4, Math.round(node.height ?? b.h)) };
    const ok = planNodeSchema.safeParse(raw);
    // Waypoint data that no longer validates is dropped, keeping the drawing.
    const n = ok.success ? ok.data : planNodeSchema.safeParse({ ...raw, data: { title: String(raw.data.title ?? "").slice(0, 300) } }).data;
    if (!n) return;
    nodes.push(n);
    made.add(el.id);
    absOf.set(n.id, { x: n.x, y: n.y });
    const parent = wp.parentId && byId.has(wp.parentId) ? wp.parentId : el.frameId && byId.has(el.frameId) ? el.frameId : undefined;
    if (parent) parentOf.set(n.id, idOf(parent));
  };

  const title = (t: string) => t.slice(0, 300);
  const dataOf = (el: ExElement, extra: Partial<NodeData>): NodeData => {
    const wp = wpOf(el);
    const resource = linkOf(el);
    return { ...(wp.data ?? {}), ...(resource && !wp.data?.resource ? { resource } : {}), title: "", ...extra } as NodeData;
  };

  const shapeStyle = (el: ExElement, type: Shape["type"]): Shape => {
    const t = boundText.get(el.id) ?? (type === "text" ? el : undefined);
    const s: Shape = { type };
    const stroke = strokeIn(type === "text" ? el.strokeColor : el.strokeColor);
    if (stroke) s.stroke = stroke;
    const fill = type === "text" ? undefined : hexOf(el.backgroundColor);
    if (fill && el.backgroundColor !== "transparent") s.fill = fill;
    const fs = fillIn(el.fillStyle);
    if (fs && s.fill) s.fillStyle = fs;
    if (el.strokeWidth !== undefined && el.strokeWidth !== 2) s.strokeWidth = clamp(el.strokeWidth, 0.5, 16);
    if (el.strokeStyle === "dashed" || el.strokeStyle === "dotted") s.strokeStyle = el.strokeStyle;
    if (el.roughness) s.roughness = clamp(el.roughness, 0, 3);
    else if (type !== "text") s.roughness = 0;
    if (!el.roundness && type !== "ellipse" && type !== "text") s.round = false;
    if (el.opacity !== undefined && el.opacity < 100) s.opacity = clamp(el.opacity / 100, 0.1, 1);
    if (t) {
      const font = fontOf(t.fontFamily);
      if (font !== "sans") s.font = font;
      if (t.fontSize && t.fontSize !== 20) s.fontSize = clamp(Math.round(t.fontSize), 8, 160);
      const align = t.textAlign === "left" || t.textAlign === "right" ? t.textAlign : "center";
      if (type === "text" ? align !== "left" : align !== "center") s.align = align;
    } else if (type === "text") delete s.align;
    if (Number.isInteger(el.seed) && el.seed! >= 0 && el.seed! <= 2 ** 31) s.seed = el.seed;
    return s;
  };

  for (const el of live) {
    const wp = wpOf(el);
    if (el.type === "text" && el.containerId && byId.has(el.containerId)) continue;
    switch (el.type) {
      case "rectangle":
      case "diamond":
      case "ellipse": {
        // A Waypoint element exported as a box comes back as itself.
        if (wp.kind && wp.kind !== "shape" && wp.kind !== "ink") {
          const t = textOf(el);
          const isNote = wp.kind === "note";
          const [first, ...rest] = isNote ? t.split("\n") : [t];
          const extra: Partial<NodeData> = { title: title(first ?? "") };
          if (isNote) extra.description = rest.join("\n").trim().slice(0, 5000);
          if (wp.kind === "link" && !wp.data?.title && first === (wp.data?.resource as { url?: string } | undefined)?.url) extra.title = "";
          push(el, { kind: wp.kind, data: dataOf(el, extra) });
          break;
        }
        const type = el.type === "rectangle" ? "rect" : el.type;
        push(el, { kind: "shape", data: dataOf(el, { title: title(textOf(el)), shape: shapeStyle(el, type) }) });
        break;
      }
      case "text": {
        const text = el.originalText ?? el.text ?? "";
        if (!text.trim()) break;
        if (wp.kind === "text") {
          push(el, { kind: "text", data: dataOf(el, { title: title(text) }) });
          break;
        }
        const shape = shapeStyle(el, "text");
        const box = measureText(text, shape.font ?? "sans", shape.fontSize ?? 20);
        push(el, { kind: "shape", data: dataOf(el, { title: title(text), shape }), width: Math.max(box.width, el.width + 16), height: Math.max(box.height, el.height + 12) }, { x: el.x - 8, y: el.y - 6, w: el.width, h: el.height });
        break;
      }
      case "frame":
      case "magicframe":
        push(el, { kind: "frame", data: dataOf(el, { title: title(el.name ?? "Quadro") }) });
        break;
      case "image": {
        const file = el.fileId ? scene.files[el.fileId] : undefined;
        if (file?.dataURL?.startsWith("data:image/")) {
          push(el, { kind: "image", data: dataOf(el, { title: "" }) });
          if (made.has(el.id)) images.push({ nodeId: idOf(el.id), file });
        }
        break;
      }
      case "embeddable":
      case "iframe": {
        const resource = linkOf(el);
        if (resource) push(el, { kind: "link", data: { title: "", resource, openIn: "new-tab" } as NodeData });
        break;
      }
      case "freedraw": {
        const pts = el.points ?? [];
        if (pts.length < 1) break;
        const size = clamp((el.strokeWidth ?? 1) * 4.25, 0.5, 80);
        push(el, inkNode(el, pts, size, { highlighter: wp.highlighter }), inkBox(el, pts, size));
        break;
      }
      case "arrow":
      case "line":
        // Bound arrows become connections once every shape exists (below).
        break;
    }
  }

  // Arrows and lines: a connection when both ends are bound to imported elements, else a stroke.
  for (const el of live) {
    if (el.type !== "arrow" && el.type !== "line") continue;
    const wp = wpOf(el);
    const pts = el.points ?? [];
    if (pts.length < 2) continue;
    const a = el.startBinding?.elementId;
    const b = el.endBinding?.elementId;
    const label = textOf(el);
    if (el.type === "arrow" && a && b && a !== b && made.has(a) && made.has(b)) {
      const id = idOf(el.id);
      const layer = planLayerSchema.safeParse(wp.layer);
      if (layer.success && layer.data.id !== BASE_LAYER_ID && !layers.has(layer.data.id)) layers.set(layer.data.id, { ...layer.data, order: wp.layer?.order });
      const info = wp.edge;
      const edge: PlanEdge = { id, source: idOf(a), target: idOf(b), kind: info?.kind ?? "flow" };
      if (layer.success && layer.data.id !== BASE_LAYER_ID) edge.layer = layer.data.id;
      // A numbered step comes back as the badge, not as part of the label.
      const stepped = info?.step && label.startsWith(`${info.step}.`) ? label.slice(`${info.step}.`.length).trim() : label;
      if (stepped) edge.label = stepped.slice(0, 200);
      if (info?.step) edge.step = info.step;
      if (info?.description) edge.description = info.description;
      if (!info || info.styled) {
        const style: EdgeStyle = {};
        const stroke = strokeIn(el.strokeColor);
        if (stroke) style.stroke = stroke;
        if (el.strokeWidth !== undefined && el.strokeWidth !== 2) style.strokeWidth = clamp(el.strokeWidth, 0.5, 16);
        if (el.strokeStyle === "dashed" || el.strokeStyle === "dotted") style.strokeStyle = el.strokeStyle;
        if (el.roughness) style.roughness = clamp(el.roughness, 0, 3);
        const start = headIn(el.startArrowhead);
        if (start !== "none") style.start = start;
        style.end = headIn(el.endArrowhead);
        style.routing = pts.length > 2 ? (el.roundness && !el.elbowed ? "curve" : "elbow") : "straight";
        if (Number.isInteger(el.seed) && el.seed! >= 0 && el.seed! <= 2 ** 31) style.seed = el.seed;
        edge.style = style;
      }
      edges.push(edge);
      continue;
    }
    const size = clamp((el.strokeWidth ?? 2) * 2, 0.5, 80);
    const arrow = el.type === "arrow" && !!el.endArrowhead;
    push(el, inkNode(el, pts, size, { arrow, line: !arrow }), inkBox(el, pts, size, arrow ? size * 4 : size));
    if (label.trim()) {
      const box = measureText(label, "sans", 16);
      const mid = pts[Math.floor(pts.length / 2)];
      push({ ...el, id: `${el.id}:label`, customData: undefined }, { kind: "shape", data: { title: title(label), shape: { type: "text", fontSize: 16, align: "center" } } as NodeData, width: box.width, height: box.height }, { x: el.x + mid[0] - box.width / 2, y: el.y + mid[1] - box.height / 2, w: box.width, h: box.height });
    }
  }

  // Children are stored relative to their parent (frames, and containers from a Waypoint export).
  const known = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    const p = parentOf.get(n.id);
    if (!p || !known.has(p) || p === n.id) continue;
    const pa = absOf.get(p)!;
    n.parentId = p;
    n.x = Math.round(absOf.get(n.id)!.x - pa.x);
    n.y = Math.round(absOf.get(n.id)!.y - pa.y);
  }

  // Parents first (React Flow needs them before their children), keeping the stacking otherwise.
  const depth = (n: PlanNode) => {
    let d = 0;
    for (let p = n.parentId; p && d < 50; p = nodes.find((x) => x.id === p)?.parentId) d++;
    return d;
  };
  const ordered = nodes.map((n, i) => ({ n, i, d: depth(n) })).sort((x, y) => x.d - y.d || x.i - y.i).map((x) => x.n);
  const layerList = [...layers.values()].sort((x, y) => (x.order ?? 0) - (y.order ?? 0)).map(({ order: _o, ...l }) => l);
  const layerIds = new Set(layerList.map((l) => l.id));
  const views = (scene.waypoint?.views ?? []).map((v) => planViewSchema.safeParse(v)).flatMap((r) => (r.success ? [{ ...r.data, layers: r.data.layers.filter((id) => id === BASE_LAYER_ID || layerIds.has(id)) }] : []));
  const sceneTitle = typeof scene.waypoint?.title === "string" ? scene.waypoint.title : typeof scene.appState?.name === "string" ? (scene.appState.name as string) : undefined;
  return { nodes: ordered, edges, layers: layerList, views, images, title: sceneTitle?.slice(0, 200) };
}

/** Box of a stroke's points (with room for its width). */
function inkBox(el: ExElement, pts: [number, number][], size: number, pad = size): Box {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: el.x + minX - pad, y: el.y + minY - pad, w: Math.max(...xs) - minX + pad * 2, h: Math.max(...ys) - minY + pad * 2 };
}

function inkNode(el: ExElement, pts: [number, number][], size: number, flags: { arrow?: boolean; line?: boolean; highlighter?: boolean }) {
  const pad = flags.arrow ? size * 4 : size;
  const box = inkBox(el, pts, size, pad);
  const minX = el.x + Math.min(...pts.map((p) => p[0])) - pad;
  const minY = el.y + Math.min(...pts.map((p) => p[1])) - pad;
  let list = pts.length === 1 ? [pts[0], [pts[0][0] + 0.1, pts[0][1] + 0.1] as [number, number]] : pts;
  if (list.length > 2000) list = list.filter((_, i) => i % Math.ceil(list.length / 2000) === 0 || i === list.length - 1);
  const w = Math.max(4, Math.round(box.w));
  const h = Math.max(4, Math.round(box.h));
  const ink: NonNullable<NodeData["ink"]> = { points: list.flatMap(([x, y]) => [r1(el.x + x - minX), r1(el.y + y - minY)]), w, h, size: r1(size) };
  if (flags.arrow) ink.arrow = true;
  if (flags.line) ink.line = true;
  if (flags.highlighter) ink.highlighter = true;
  const color = strokeIn(el.strokeColor);
  const wp = wpOf(el);
  return { kind: "ink" as const, data: { ...(wp.kind === "ink" ? (wp.data ?? {}) : {}), title: "", ink, ...(color ? { color } : {}) } as NodeData, width: w, height: h };
}

/** Places imported nodes so their bounds center on `at` (top-level ones move; children follow). */
export function centerOn(nodes: PlanNode[], at: Pt): PlanNode[] {
  const top = nodes.filter((n) => !n.parentId);
  if (!top.length) return nodes;
  const minX = Math.min(...top.map((n) => n.x));
  const minY = Math.min(...top.map((n) => n.y));
  const maxX = Math.max(...top.map((n) => n.x + n.width));
  const maxY = Math.max(...top.map((n) => n.y + n.height));
  const dx = Math.round(at.x - (minX + maxX) / 2);
  const dy = Math.round(at.y - (minY + maxY) / 2);
  return nodes.map((n) => (n.parentId ? n : { ...n, x: n.x + dx, y: n.y + dy }));
}

/** The given elements with everything inside them, and the connections among them (to copy a selection). */
export function subsetDoc(doc: PlanDocument, nodeIds: Iterable<string>, edgeIds: Iterable<string> = []): PlanDocument {
  const keep = new Set(nodeIds);
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of doc.nodes) if (n.parentId && keep.has(n.parentId) && !keep.has(n.id)) grew = !!keep.add(n.id);
  }
  const edges = new Set(edgeIds);
  const abs = absolutePositions(doc.nodes);
  return {
    ...doc,
    // An element copied without its parent keeps its place on the canvas.
    nodes: doc.nodes.filter((n) => keep.has(n.id)).map((n) => (n.parentId && !keep.has(n.parentId) ? { ...n, parentId: undefined, ...abs.get(n.id)! } : n)),
    edges: doc.edges.filter((e) => edges.has(e.id) || (keep.has(e.source) && keep.has(e.target))),
  };
}
