/**
 * "Converter em…": turns blocks, notes, texts and drawn shapes into one another, keeping the
 * title, description, links and color. Pure: works on plan documents.
 */
import type { NodeData, OutlineType, PlanDocument, PlanNode, Shape } from "@/domain/plan";
import { DEFAULT_STYLE, measureText } from "./shape-geometry";

export type ConvertTarget = "block" | "note" | "text" | OutlineType;

export const CONVERT_TARGETS: { id: ConvertTarget; label: string }[] = [
  { id: "block", label: "Bloco" },
  { id: "note", label: "Nota" },
  { id: "rect", label: "Retângulo" },
  { id: "ellipse", label: "Elipse" },
  { id: "diamond", label: "Losango" },
  { id: "hexagon", label: "Hexágono" },
  { id: "parallelogram", label: "Paralelogramo" },
  { id: "cylinder", label: "Cilindro" },
  { id: "document", label: "Documento" },
  { id: "cloud", label: "Nuvem" },
  { id: "speech", label: "Balão de fala" },
  { id: "triangle", label: "Triângulo" },
  { id: "star", label: "Estrela" },
  { id: "text", label: "Texto" },
];

/** What a node is now, in the same terms (null: can't be converted, e.g. areas or icons). */
export function convertKind(n: Pick<PlanNode, "kind" | "data">): ConvertTarget | null {
  if (n.kind === "block" || n.kind === "note") return n.kind;
  if (n.kind === "text") return "text";
  if (n.kind === "shape" && n.data.shape && n.data.shape.type !== "icon") return n.data.shape.type;
  return null;
}

const NOTE_COLOR = "#FFF3C4";

function convertOne(n: PlanNode, to: ConvertTarget): PlanNode {
  const { shape, color, ...rest } = n.data;
  // The node's color: a block's fill, or a shape's background.
  const fill = color ?? shape?.fill;
  const data: NodeData = { ...rest };
  if (to === "block" || to === "note") {
    const c = to === "note" ? (fill ?? NOTE_COLOR) : fill;
    if (c) data.color = c;
    if (to === "block" && !data.icon) data.icon = "box";
    return { ...n, kind: to, width: Math.max(n.width, 160), height: Math.max(n.height, to === "note" ? 96 : 64), data };
  }
  const base: Shape = shape && shape.type !== "icon" ? { ...shape } : { type: "rect" };
  if (to === "text") {
    const s: Shape = { ...base, type: "text", align: base.align ?? "left" };
    delete s.fill;
    delete s.fillStyle;
    const box = measureText(data.title, s.font ?? DEFAULT_STYLE.font, s.fontSize ?? DEFAULT_STYLE.fontSize);
    return { ...n, kind: "shape", width: box.width, height: box.height, data: { ...data, shape: s } };
  }
  const s: Shape = { ...base, type: to };
  if (fill) s.fill = fill;
  if (to !== "rect" && s.round === false) delete s.round;
  return { ...n, kind: "shape", width: Math.max(n.width, 80), height: Math.max(n.height, 60), data: { ...data, shape: s } };
}

export function convertNodes<T extends Pick<PlanDocument, "nodes">>(doc: T, ids: Iterable<string>, to: ConvertTarget): T {
  const want = new Set(ids);
  let changed = false;
  const nodes = doc.nodes.map((n) => {
    if (!want.has(n.id)) return n;
    const now = convertKind(n);
    if (!now || now === to) return n;
    changed = true;
    return convertOne(n, to);
  });
  return changed ? { ...doc, nodes } : doc;
}
