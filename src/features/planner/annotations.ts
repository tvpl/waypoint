/**
 * Annotations (pins, callouts, brackets, highlights): their look by category, default sizes,
 * numbering, and what is shown. Pure (no React).
 */
import type { Annotation, AnnotationCategory, AnnotationType, PlanNode } from "@/domain/plan";

export const CATEGORY_META: Record<AnnotationCategory, { label: string; color: string; soft: string }> = {
  note: { label: "Observação", color: "#2F6FEB", soft: "#E8F0FF" },
  question: { label: "Dúvida", color: "#7C4DDB", soft: "#F1EBFF" },
  risk: { label: "Risco", color: "#D9363E", soft: "#FDECEC" },
  decision: { label: "Decisão", color: "#2B8A3E", soft: "#E6F6EA" },
  todo: { label: "A fazer", color: "#D9730D", soft: "#FFF1E3" },
};

export const TYPE_META: Record<AnnotationType, { label: string; hint: string; size: [number, number] }> = {
  pin: { label: "Marcador", hint: "Um número no ponto; o texto vai para a legenda", size: [28, 28] },
  callout: { label: "Balão", hint: "Um balão com seta para o elemento", size: [240, 88] },
  bracket: { label: "Chave", hint: "Uma chave sobre uma parte do desenho", size: [260, 44] },
  highlight: { label: "Destaque", hint: "Uma área destacada", size: [300, 180] },
};

export const annotationOf = (n: { data: { annotation?: Annotation } }): Annotation => n.data.annotation ?? { type: "callout", category: "note" };

/** What the reader chose to see. */
export type AnnotationView = { show: boolean; categories: ReadonlySet<AnnotationCategory>; resolved: boolean };
export const ALL_ANNOTATIONS: AnnotationView = { show: true, categories: new Set(["note", "question", "risk", "decision", "todo"]), resolved: false };

export function annotationVisible(a: Annotation, view: AnnotationView): boolean {
  if (!view.show) return false;
  if (a.resolved && !view.resolved) return false;
  return view.categories.has(a.category);
}

/** Pins are numbered 1, 2, 3… in the order they were added (the legend uses the same numbers). */
export function pinNumbers(nodes: Pick<PlanNode, "id" | "kind" | "data">[]): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const node of nodes) if (node.kind === "annotation" && annotationOf(node).type === "pin") out.set(node.id, ++n);
  return out;
}

/** The legend: every annotation, pins first by number, then the others in reading order. */
export function legend<T extends Pick<PlanNode, "id" | "kind" | "data" | "x" | "y">>(nodes: T[]): { node: T; number?: number; annotation: Annotation }[] {
  const nums = pinNumbers(nodes);
  return nodes
    .filter((n) => n.kind === "annotation")
    .map((node) => ({ node, number: nums.get(node.id), annotation: annotationOf(node) }))
    .sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || a.node.y - b.node.y || a.node.x - b.node.x);
}
