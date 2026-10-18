import { z } from "zod";
import { STATUS_LABELS, type TaskInput, type TaskStatus } from "./tasks";

export const TASK_EVENT_KINDS = ["created", "imported", "status", "updated", "archived", "restored", "note"] as const;
export type TaskEventKind = (typeof TASK_EVENT_KINDS)[number];

export type TaskEvent = {
  id: string;
  taskId: string;
  kind: TaskEventKind;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  body: string;
  userId: string | null;
  userName: string | null;
  createdAt: number;
};

export const taskNoteSchema = z
  .string()
  .trim()
  .min(1, "Escreva a observação.")
  .max(5000, "Use até 5 mil caracteres na observação.");

/** Fields compared to describe an edit; order is the order shown in the history. */
const FIELD_LABELS: [keyof TaskInput, string][] = [
  ["title", "título"],
  ["description", "contexto"],
  ["projectId", "projeto"],
  ["blockId", "bloco"],
  ["columnId", "coluna"],
  ["priority", "prioridade"],
  ["dueDate", "prazo"],
  ["followUpDate", "acompanhamento"],
  ["pendingNote", "pendência"],
  ["pendingKind", "tipo de pendência"],
  ["tags", "marcadores"],
  ["people", "pessoas"],
  ["subtasks", "subtarefas"],
  ["dependsOn", "dependências"],
  ["color", "cor"],
];

/** Labels of the fields that differ between two versions of a task (status is reported apart). */
export function changedTaskFields(before: TaskInput, after: TaskInput): string[] {
  const changed = FIELD_LABELS.filter(([key]) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)).map(([, label]) => label);
  // A move between columns of the same block is not worth two entries.
  return changed.includes("bloco") ? changed.filter((l) => l !== "coluna") : changed;
}

/** Subtasks checked off between two versions (shown as progress in the history). */
export function completedSubtasks(before: TaskInput, after: TaskInput): string[] {
  const was = new Map(before.subtasks.map((s) => [s.id, s.done]));
  return after.subtasks.filter((s) => s.done && was.get(s.id) === false).map((s) => s.title);
}

/** One line describing an event ("Concluída", "Moveu de A fazer para Em andamento"…). */
export function eventSummary(e: Pick<TaskEvent, "kind" | "fromStatus" | "toStatus" | "body">): string {
  switch (e.kind) {
    case "created":
      return e.toStatus && e.toStatus !== "todo" ? `Criada · ${STATUS_LABELS[e.toStatus]}` : "Criada";
    case "imported":
      return "Importada via Markdown";
    case "status":
      if (e.toStatus === "done") return "Concluída";
      if (e.fromStatus === "done") return `Reaberta em ${STATUS_LABELS[e.toStatus ?? "todo"]}`;
      return `Moveu de ${STATUS_LABELS[e.fromStatus ?? "todo"]} para ${STATUS_LABELS[e.toStatus ?? "todo"]}`;
    case "updated":
      return e.body ? `Alterou ${e.body}` : "Editada";
    case "archived":
      return "Arquivada";
    case "restored":
      return "Restaurada";
    case "note":
      return "Observação";
  }
}

/** "a, b e c" */
export function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`;
}
