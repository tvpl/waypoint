import { z } from "zod";
import { STATUS_LABELS, TASK_STATUSES, type Task } from "./tasks";

const name = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Informe um nome.")
    .max(max)
    .refine((s) => !/[\r\n]/.test(s), "Use apenas uma linha.");
export const taskColumnSchema = z.object({
  id: z.string().min(1).max(64),
  name: name(60),
  status: z.enum(TASK_STATUSES),
  limit: z.number().int().min(1).max(99).nullable().default(null),
});
export const boardInputSchema = z
  .object({
    name: name(100),
    projectId: z.string().min(1).max(64).nullable(),
    isDefault: z.boolean().default(false),
    columns: z.array(taskColumnSchema).min(1).max(16),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.columns.map((c) => c.id)).size !== v.columns.length)
      ctx.addIssue({
        code: "custom",
        message: "As colunas precisam ter identificadores únicos.",
      });
    if (
      v.isDefault &&
      TASK_STATUSES.some((s) => !v.columns.some((c) => c.status === s))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "O bloco principal precisa manter uma coluna para cada etapa: a fazer, em andamento, aguardando e concluído.",
      });
  });
export type TaskColumn = z.infer<typeof taskColumnSchema>;
export type BoardInput = z.infer<typeof boardInputSchema>;
export type TaskBoard = BoardInput & {
  id: string;
  version: number;
  sortOrder: number;
};
export const defaultColumns = (): TaskColumn[] =>
  TASK_STATUSES.map((status) => ({
    id: status,
    name: STATUS_LABELS[status],
    status,
    limit: null,
  }));
export function defaultBoard(projectId: string | null): TaskBoard {
  return {
    id: `default:${projectId ?? "none"}`,
    name: "Demandas",
    projectId,
    isDefault: true,
    columns: defaultColumns(),
    version: 0,
    sortOrder: -1,
  };
}
export function boardsForProject(
  boards: TaskBoard[],
  projectId: string | null,
) {
  const scoped = boards
    .filter((b) => b.projectId === projectId)
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder,
    );
  return scoped.some((b) => b.isDefault)
    ? scoped
    : [defaultBoard(projectId), ...scoped];
}
export function taskPlacement(
  task: Pick<Task, "blockId" | "columnId" | "status" | "projectId">,
  boards: TaskBoard[],
) {
  const scoped = boardsForProject(boards, task.projectId);
  const board =
    scoped.find((b) => b.id === task.blockId) ??
    scoped.find((b) => b.isDefault)!;
  const column =
    board.columns.find(
      (c) => c.id === task.columnId && c.status === task.status,
    ) ?? board.columns.find((c) => c.status === task.status);
  return { board, column };
}
export const columnDestination = (board: TaskBoard, column: TaskColumn) => ({
  blockId: board.version ? board.id : null,
  columnId: board.version ? column.id : null,
  status: column.status,
  projectId: board.projectId,
});
export type TaskDestination = ReturnType<typeof columnDestination> & {
  aggregate?: boolean;
};
