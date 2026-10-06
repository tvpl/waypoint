/** Pure defaults for new planner elements (no React imports — shared by tests and ops). */
import type { NodeData, NodeKind, NodeStatus, PlanNode } from "@/domain/plan";
import { newId } from "@/lib/utils";

export const KIND_DEFAULTS: Record<NodeKind, { width: number; height: number; title: string; data?: Partial<NodeData> }> = {
  block: { width: 200, height: 72, title: "Novo bloco", data: { icon: "box" } },
  container: { width: 380, height: 240, title: "Container", data: { color: "#FFEADB", icon: "boxes" } },
  note: { width: 220, height: 104, title: "Nota", data: { color: "#FFF3C4", description: "" } },
  link: { width: 240, height: 72, title: "", data: { openIn: "new-tab" } },
  section: { width: 520, height: 340, title: "Seção" },
  image: { width: 260, height: 190, title: "" },
  text: { width: 240, height: 44, title: "Texto" },
  ink: { width: 40, height: 40, title: "" },
  shape: { width: 180, height: 100, title: "", data: { shape: { type: "rect" } } },
  frame: { width: 640, height: 420, title: "Quadro" },
  annotation: { width: 240, height: 88, title: "", data: { annotation: { type: "callout", category: "note" } } },
};

export const KIND_LABEL: Record<NodeKind, string> = {
  block: "Bloco",
  container: "Container",
  note: "Nota",
  link: "Cartão de link",
  section: "Seção",
  image: "Imagem",
  text: "Texto",
  ink: "Desenho",
  shape: "Forma",
  frame: "Quadro",
  annotation: "Anotação",
};

/** Kinds that can hold children (drop target / group). */
export const PARENT_KINDS: ReadonlySet<NodeKind> = new Set(["container", "section", "frame"]);

export function createNode(kind: NodeKind, pos: { x: number; y: number }, extra: Partial<NodeData> = {}, opts: { center?: boolean } = {}): PlanNode {
  const d = KIND_DEFAULTS[kind];
  const x = opts.center ? pos.x - d.width / 2 : pos.x;
  const y = opts.center ? pos.y - d.height / 2 : pos.y;
  return {
    id: newId(),
    kind,
    x: Math.round(x),
    y: Math.round(y),
    width: d.width,
    height: d.height,
    data: { title: d.title, ...d.data, ...extra },
  };
}

export const STATUS_META: Record<Exclude<NodeStatus, "none">, { label: string; dot: string; tone: "neutral" | "success" | "amber" | "accent" }> = {
  idea: { label: "Ideia", dot: "#8B6CF0", tone: "neutral" },
  planned: { label: "Planejado", dot: "#2F4FD8", tone: "accent" },
  "in-progress": { label: "Em andamento", dot: "#C98A00", tone: "amber" },
  production: { label: "Produção", dot: "#1F8A4C", tone: "success" },
  deprecated: { label: "Descontinuado", dot: "#9A9BA3", tone: "neutral" },
};

export function statusMeta(s: NodeStatus | undefined) {
  return s && s !== "none" ? STATUS_META[s] : null;
}
