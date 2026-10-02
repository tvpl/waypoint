/**
 * Built-in starting points for a new plan. Pure: each build() returns a fresh document
 * (new ids every time), so the same template can be used again and again.
 */
import { EMPTY_DOCUMENT, PLAN_SCHEMA_VERSION, type EdgeKind, type NodeData, type NodeKind, type PlanDocument, type PlanNode } from "@/domain/plan";
import { newId } from "@/lib/utils";

export type StarterTemplate = {
  id: string;
  title: string;
  description: string;
  build: () => PlanDocument;
};

type Spec = { key: string; kind: NodeKind; x: number; y: number; w: number; h: number; parent?: string; data: Partial<NodeData> & { title: string } };
type EdgeSpec = [from: string, to: string, kind?: EdgeKind, label?: string];

function doc(nodes: Spec[], edges: EdgeSpec[] = []): PlanDocument {
  const ids = new Map(nodes.map((n) => [n.key, newId()]));
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    nodes: nodes.map(
      (n): PlanNode => ({
        id: ids.get(n.key)!,
        kind: n.kind,
        x: n.x,
        y: n.y,
        width: n.w,
        height: n.h,
        ...(n.parent ? { parentId: ids.get(n.parent)! } : {}),
        data: { ...n.data },
      }),
    ),
    edges: edges.map(([a, b, kind = "flow", label]) => ({ id: newId(), source: ids.get(a)!, target: ids.get(b)!, kind, ...(label ? { label } : {}) })),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

const block = (key: string, title: string, x: number, y: number, parent?: string, extra: Partial<NodeData> = {}): Spec => ({
  key,
  kind: "block",
  x,
  y,
  w: 220,
  h: 72,
  parent,
  data: { title, icon: "box", ...extra },
});
const note = (key: string, title: string, x: number, y: number, parent?: string, description = ""): Spec => ({
  key,
  kind: "note",
  x,
  y,
  w: 220,
  h: 104,
  parent,
  data: { title, description, color: "#FFF3C4" },
});
const section = (key: string, title: string, x: number, y: number, w: number, h: number, extra: Partial<NodeData> = {}): Spec => ({
  key,
  kind: "section",
  x,
  y,
  w,
  h,
  data: { title, ...extra },
});
const container = (key: string, title: string, x: number, y: number, w: number, h: number, color: string, icon: string): Spec => ({
  key,
  kind: "container",
  x,
  y,
  w,
  h,
  data: { title, color, icon },
});

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "blank",
    title: "Em branco",
    description: "Canvas vazio para começar do zero.",
    build: () => ({ ...EMPTY_DOCUMENT }),
  },
  {
    id: "roadmap",
    title: "Roadmap trimestral",
    description: "Quatro trimestres com iniciativas e dependências.",
    build: () =>
      doc(
        [
          ...["Q1", "Q2", "Q3", "Q4"].map((q, i) => section(q, q, i * 280, 0, 260, 380)),
          block("a", "Iniciativa principal", 20, 56, "Q1", { status: "in-progress" }),
          block("b", "Descoberta", 20, 148, "Q1", { status: "planned" }),
          block("c", "Lançamento beta", 20, 56, "Q2", { status: "planned" }),
          block("d", "Escala", 20, 56, "Q3", { status: "idea" }),
          note("n", "Riscos", 20, 56, "Q4", "O que pode atrasar o plano?"),
        ],
        [
          ["a", "c", "dependency"],
          ["c", "d", "flow"],
        ],
      ),
  },
  {
    id: "architecture",
    title: "Arquitetura de sistema",
    description: "Camadas de cliente, serviços e dados com os fluxos entre elas.",
    build: () =>
      doc(
        [
          container("client", "Cliente", 0, 0, 260, 260, "#E8EDFF", "monitor"),
          block("web", "Web app", 20, 56, "client", { icon: "globe" }),
          block("mobile", "App mobile", 20, 148, "client", { icon: "smartphone" }),
          container("svc", "Serviços", 320, 0, 260, 352, "#DDF4EE", "server"),
          block("api", "API Gateway", 20, 56, "svc", { icon: "network" }),
          block("auth", "Autenticação", 20, 148, "svc", { icon: "shield" }),
          block("core", "Serviço principal", 20, 240, "svc", { icon: "box" }),
          container("data", "Dados", 640, 0, 260, 260, "#FFEADB", "database"),
          block("db", "Banco de dados", 20, 56, "data", { icon: "database" }),
          block("queue", "Fila de eventos", 20, 148, "data", { icon: "layers" }),
        ],
        [
          ["web", "api"],
          ["mobile", "api"],
          ["api", "auth"],
          ["api", "core"],
          ["core", "db", "flow", "lê/grava"],
          ["core", "queue", "dependency", "publica"],
        ],
      ),
  },
  {
    id: "kanban",
    title: "Quadro de status",
    description: "A fazer, em andamento e feito — para acompanhar entregas.",
    build: () =>
      doc([
        section("todo", "A fazer", 0, 0, 260, 420),
        section("doing", "Em andamento", 280, 0, 260, 420),
        section("done", "Feito", 560, 0, 260, 420),
        block("t1", "Tarefa", 20, 56, "todo", { status: "planned" }),
        block("t2", "Outra tarefa", 20, 148, "todo", { status: "idea" }),
        block("d1", "Em execução", 20, 56, "doing", { status: "in-progress" }),
        block("f1", "Entregue", 20, 56, "done", { status: "production" }),
      ]),
  },
  {
    id: "decision",
    title: "Registro de decisão",
    description: "Contexto, opções avaliadas e a decisão tomada (estilo ADR).",
    build: () =>
      doc(
        [
          note("ctx", "Contexto", 0, 120, undefined, "Qual problema estamos resolvendo?"),
          block("o1", "Opção A", 320, 0, undefined, { description: "Prós e contras" }),
          block("o2", "Opção B", 320, 120, undefined, { description: "Prós e contras" }),
          block("o3", "Opção C", 320, 240, undefined, { description: "Prós e contras" }),
          block("dec", "Decisão", 640, 120, undefined, { color: "#2F4FD8", icon: "flag" }),
        ],
        [
          ["ctx", "o1", "relation"],
          ["ctx", "o2", "relation"],
          ["ctx", "o3", "relation"],
          ["o2", "dec", "strong", "escolhida"],
        ],
      ),
  },
  {
    id: "retro",
    title: "Retrospectiva",
    description: "O que foi bem, o que melhorar e as próximas ações.",
    build: () =>
      doc([
        section("good", "Foi bem", 0, 0, 260, 380, { color: "#E6F4DD" }),
        section("bad", "Melhorar", 280, 0, 260, 380, { color: "#FDE7F0" }),
        section("act", "Ações", 560, 0, 260, 380, { color: "#E8EDFF" }),
        note("g1", "Ponto positivo", 20, 56, "good"),
        note("b1", "Ponto a melhorar", 20, 56, "bad"),
        block("a1", "Ação com responsável", 20, 56, "act", { status: "planned" }),
      ]),
  },
];

export function starterTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id);
}
