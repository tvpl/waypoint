import { z } from "zod";

export const TASK_STATUSES = ["todo", "doing", "waiting", "done"] as const;
export const TASK_COLORS = [
  "neutral",
  "lavender",
  "mint",
  "peach",
  "sky",
  "rose",
  "sand",
] as const;
export const STATUS_LABELS = {
  todo: "A fazer",
  doing: "Em andamento",
  waiting: "Aguardando",
  done: "Concluído",
};
export const COLOR_LABELS = {
  neutral: "Neutro",
  lavender: "Lavanda",
  mint: "Menta",
  peach: "Pêssego",
  sky: "Céu",
  rose: "Rosa",
  sand: "Areia",
};
export const PRIORITY_LABELS = {
  none: "Sem prioridade",
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};
export const PENDING_LABELS = {
  note: "Pendência",
  waiting: "Aguardando retorno",
  blocked: "Bloqueado",
  decision: "Precisa de decisão",
} as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskColor = (typeof TASK_COLORS)[number];
const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use até ${max} caracteres.`)
    .refine((v) => !/[\r\n]/.test(v), "Use apenas uma linha.");
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
  }, "Data inválida.");
export const taskInputSchema = z
  .object({
    title: line(300).pipe(z.string().min(1, "Dê um nome à tarefa.")),
    description: z
      .string()
      .max(20000, "Use até 20 mil caracteres no contexto.")
      .default(""),
    pendingNote: z
      .string()
      .max(5000, "Use até 5 mil caracteres na pendência.")
      .default(""),
    pendingKind: z
      .enum(["note", "waiting", "blocked", "decision"])
      .default("note"),
    projectId: z.string().min(1).max(64).nullable().default(null),
    blockId: z.string().min(1).max(64).nullable().default(null),
    columnId: z.string().min(1).max(64).nullable().default(null),
    status: z.enum(TASK_STATUSES).default("todo"),
    priority: z.enum(["none", "low", "medium", "high"]).default("none"),
    color: z.enum(TASK_COLORS).default("neutral"),
    dueDate: dateSchema.nullable().default(null),
    followUpDate: dateSchema.nullable().default(null),
    recurrence: z
      .enum(["", "daily", "weekdays", "weekly", "monthly"])
      .default(""),
    dependsOn: z
      .array(z.string().min(1).max(64))
      .max(50, "Vincule até 50 dependências.")
      .default([]),
    tags: z
      .array(line(48).pipe(z.string().min(1)))
      .max(20, "Adicione até 20 marcadores.")
      .default([]),
    people: z
      .array(line(100).pipe(z.string().min(1)))
      .max(20, "Adicione até 20 pessoas de apoio.")
      .default([]),
    subtasks: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          title: line(300).pipe(z.string().min(1)),
          done: z.boolean(),
        }),
      )
      .max(100, "Adicione até 100 subtarefas.")
      .default([]),
  })
  .refine(
    (v) => new Set(v.subtasks.map((s) => s.id)).size === v.subtasks.length,
    "Subtarefas duplicadas.",
  )
  .refine(
    (v) => new Set(v.dependsOn).size === v.dependsOn.length,
    "Dependências duplicadas.",
  );
export type TaskInput = z.infer<typeof taskInputSchema>;
export type Task = TaskInput & {
  id: string;
  version: number;
  sortOrder: number;
  completedAt: number | null;
  archivedAt: number | null;
  updatedAt: number;
  createdAt: number;
};
export type TaskProject = { id: string; name: string; color: TaskColor };
export const projectInputSchema = z.object({
  name: line(100).pipe(z.string().min(1, "Informe o nome do projeto.")),
  color: z.enum(TASK_COLORS).default("lavender"),
});
export const emptyTask = (overrides: Partial<TaskInput> = {}): TaskInput =>
  taskInputSchema.parse({ title: "Nova tarefa", ...overrides });
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Portable checklists; optional metadata preserves fields across AI/editor round trips. */
export function exportTasksMarkdown(
  tasks: TaskInput[],
  projects: TaskProject[],
  boards: {
    id: string;
    name: string;
    projectId?: string | null;
    isDefault?: boolean;
    columns: { id: string; name: string; status?: TaskStatus }[];
  }[] = [],
  relatedTasks: Pick<Task, "id" | "title">[] = [],
) {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const taskNames = new Map(relatedTasks.map((t) => [t.id, t.title]));
  const referenceSchema = z.object({
    id: z.string().min(1).max(64),
    version: z.number().int().positive(),
  });
  return [
    "# Tarefas · Waypoint",
    "",
    ...tasks.flatMap((raw) => {
      const task = taskInputSchema.parse(raw);
      const {
        title,
        subtasks,
        projectId,
        blockId,
        columnId,
        dependsOn,
        description,
        ...rest
      } = task;
      const board =
        boards.find((b) => b.id === blockId) ??
        (!blockId
          ? boards.find((b) => b.isDefault && b.projectId === projectId)
          : undefined);
      const metadata = JSON.stringify({
        ...rest,
        ...(referenceSchema.safeParse(raw).success
          ? { ref: referenceSchema.parse(raw) }
          : {}),
        subtaskIds: subtasks.map((s) => s.id),
        dependencies: dependsOn.map((id) => ({
          id,
          ...(taskNames.has(id) ? { title: taskNames.get(id) } : {}),
        })),
        project: projectId ? (projectMap.get(projectId)?.name ?? null) : null,
        projectColor: projectId
          ? (projectMap.get(projectId)?.color ?? null)
          : null,
        ...(board
          ? {
              block: board.name,
              column: (
                board.columns.find((c) => c.id === columnId) ??
                board.columns.find((c) => c.status === task.status)
              )?.name,
            }
          : {}),
      })
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e");
      return [
        `- [${task.status === "done" ? "x" : " "}] ${title}`,
        `  <!-- waypoint ${metadata} -->`,
        ...description
          .split("\n")
          .filter((s, _i, a) => a.length > 1 || s)
          .map((s) => `  > ${s}`),
        ...subtasks.map((s) => `  - [${s.done ? "x" : " "}] ${s.title}`),
        "",
      ];
    }),
  ].join("\n");
}
export type ImportedTask = TaskInput & {
  projectName: string | null;
  projectColor: TaskColor | null;
  blockName: string | null;
  columnName: string | null;
  reference: { id: string; version: number } | null;
};
export function parseTasksMarkdown(markdown: string): ImportedTask[] {
  if (markdown.length > 250000)
    throw new Error("O Markdown deve ter até 250 mil caracteres.");
  const result: ImportedTask[] = [];
  let current: {
    title: string;
    done: boolean;
    metadata: Record<string, unknown>;
    notes: string[];
    subtasks: TaskInput["subtasks"];
    project: string | null;
  } | null = null;
  let project: string | null = null;
  const flush = () => {
    if (!current) return;
    const { metadata, notes, subtasks, title, done } = current;
    const subtaskIds =
      metadata.subtaskIds === undefined
        ? []
        : z
            .array(z.string().min(1).max(64))
            .max(100)
            .parse(metadata.subtaskIds);
    const dependencies =
      metadata.dependencies === undefined
        ? []
        : z
            .array(z.object({ id: z.string().min(1).max(64) }))
            .max(50)
            .parse(metadata.dependencies);
    const parsed = taskInputSchema.parse({
      ...metadata,
      title,
      projectId: null,
      blockId: null,
      columnId: null,
      dependsOn: dependencies.map((d) => d.id),
      description: notes.join("\n").trim(),
      subtasks: subtasks.map((s, i) => ({ ...s, id: subtaskIds[i] ?? s.id })),
      status: done
        ? "done"
        : metadata.status === "done"
          ? "todo"
          : (metadata.status ?? "todo"),
    });
    result.push({
      ...parsed,
      reference:
        metadata.ref === undefined
          ? null
          : z
              .object({
                id: z.string().min(1).max(64),
                version: z.number().int().positive(),
              })
              .parse(metadata.ref),
      projectName: (
        typeof metadata.project === "string"
          ? metadata.project
          : current.project
      )
        ? projectInputSchema.parse({
            name:
              typeof metadata.project === "string"
                ? metadata.project
                : current.project,
          }).name
        : null,
      projectColor: metadata.projectColor
        ? z.enum(TASK_COLORS).parse(metadata.projectColor)
        : null,
      blockName:
        typeof metadata.block === "string"
          ? line(100).parse(metadata.block) || null
          : null,
      columnName:
        typeof metadata.column === "string"
          ? line(60).parse(metadata.column) || null
          : null,
    });
  };
  let fenced = false;
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      if (current) current.notes.push(line.replace(/^  /, ""));
      continue;
    }
    if (!fenced) {
      const heading = /^##\s+(.+)/.exec(line);
      if (heading) {
        flush();
        current = null;
        project = heading[1].trim();
        continue;
      }
      const root = /^[-*]\s+\[([ xX])\]\s+(.+)/.exec(line);
      if (root) {
        flush();
        current = {
          title: root[2],
          done: root[1].toLowerCase() === "x",
          metadata: {},
          notes: [],
          subtasks: [],
          project,
        };
        continue;
      }
      if (current) {
        const meta = /^\s+<!-- waypoint (.*) -->\s*$/.exec(line);
        if (meta) {
          try {
            const value = JSON.parse(meta[1]);
            if (!value || typeof value !== "object" || Array.isArray(value))
              throw new Error();
            current.metadata = value;
          } catch {
            throw new Error("Metadados Waypoint inválidos no Markdown.");
          }
          continue;
        }
        const sub = /^\s+[-*]\s+\[([ xX])\]\s+(.+)/.exec(line);
        if (sub) {
          current.subtasks.push({
            id: `sub-${current.subtasks.length + 1}`,
            title: sub[2],
            done: sub[1].toLowerCase() === "x",
          });
          continue;
        }
      }
    }
    if (current && (fenced || /^\s/.test(line) || line === ""))
      current.notes.push(
        line.startsWith("  >")
          ? line.replace(/^  > ?/, "")
          : line.replace(/^  /, ""),
      );
  }
  flush();
  if (!result.length)
    throw new Error("Nenhuma tarefa encontrada. Use - [ ] seguido do título.");
  if (result.length > 200) throw new Error("Importe até 200 tarefas por vez.");
  return result;
}

export const taskBulkChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), value: z.enum(TASK_STATUSES) }),
  z.object({
    type: z.literal("project"),
    value: z.string().min(1).max(64).nullable(),
  }),
  z.object({ type: z.literal("due"), value: dateSchema.nullable() }),
  z.object({ type: z.literal("archive"), value: z.boolean() }),
]);
export type TaskBulkChange = z.infer<typeof taskBulkChangeSchema>;
