import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { newId } from "@/lib/utils";
import {
  taskInputSchema,
  taskBulkChangeSchema,
  projectInputSchema,
  parseTasksMarkdown,
  TASK_STATUSES,
  PENDING_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  COLOR_LABELS,
  type Task,
  type TaskInput,
  type TaskProject,
  type TaskStatus,
} from "@/domain/tasks";
import type {
  MarkdownFieldChange,
  MarkdownReview,
} from "@/domain/task-markdown-review";
import { canEditWorkspace, UserError, workspaceRole } from "./workspaces";
import { indexEntity, removeEntity } from "./search";
import {
  boardInputSchema,
  boardsForProject,
  columnDestination,
  taskPlacement,
  type TaskBoard,
  type TaskDestination,
} from "@/domain/task-board";

type Actor = { workspaceId: string; userId: string };
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Conn = ReturnType<typeof getDb> | Tx;
const key = z.string().min(1).max(64);
function access(actor: Actor, edit = false) {
  const role = workspaceRole(actor.userId, actor.workspaceId);
  if (!role || (edit && !canEditWorkspace(role)))
    throw new UserError("Você não tem permissão para esta ação.");
}
function rowFor(actor: Actor, id: string, conn: Conn = getDb()) {
  const row = conn
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.id, key.parse(id)),
        eq(schema.tasks.workspaceId, actor.workspaceId),
      ),
    )
    .get();
  if (!row) throw new UserError("Tarefa não encontrada.");
  return row;
}
function present(row: typeof schema.tasks.$inferSelect): Task {
  return {
    ...taskInputSchema.parse({
      ...row,
      tags: JSON.parse(row.tagsJson),
      people: JSON.parse(row.peopleJson),
      subtasks: JSON.parse(row.subtasksJson),
      dependsOn: JSON.parse(row.dependsOnJson),
    }),
    id: row.id,
    version: row.version,
    sortOrder: row.sortOrder,
    completedAt: row.completedAt?.valueOf() ?? null,
    archivedAt: row.archivedAt?.valueOf() ?? null,
    updatedAt: row.updatedAt.valueOf(),
  };
}
function fields(input: TaskInput) {
  const { tags, people, subtasks, dependsOn, ...rest } = input;
  return {
    ...rest,
    tagsJson: JSON.stringify([...new Set(tags)]),
    peopleJson: JSON.stringify([...new Set(people)]),
    subtasksJson: JSON.stringify(subtasks),
    dependsOnJson: JSON.stringify(dependsOn),
  };
}
function dependencyGraph(actor: Actor, conn: Conn) {
  return new Map(
    conn
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.workspaceId, actor.workspaceId))
      .all()
      .map((row) => [row.id, JSON.parse(row.dependsOnJson) as string[]]),
  );
}
function validateDependencyGraph(graph: Map<string, string[]>) {
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const walk = (id: string) => {
    if (!graph.has(id))
      throw new UserError(
        "Uma dependência não está disponível neste workspace.",
      );
    if (visiting.has(id))
      throw new UserError(
        "As dependências formariam um ciclo. Revise os vínculos.",
      );
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id)!) walk(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) walk(id);
}
function assertDependencies(
  actor: Actor,
  id: string,
  dependencies: string[],
  conn: Conn,
) {
  const graph = dependencyGraph(actor, conn);
  graph.set(id, dependencies);
  validateDependencyGraph(graph);
}
function assertProject(actor: Actor, projectId: string | null, conn: Conn) {
  if (
    projectId &&
    !conn
      .select()
      .from(schema.taskProjects)
      .where(
        and(
          eq(schema.taskProjects.id, projectId),
          eq(schema.taskProjects.workspaceId, actor.workspaceId),
        ),
      )
      .get()
  )
    throw new UserError("Projeto não encontrado neste workspace.");
}
function presentBoard(row: typeof schema.taskBoards.$inferSelect): TaskBoard {
  return {
    ...boardInputSchema.parse({ ...row, columns: JSON.parse(row.columnsJson) }),
    id: row.id,
    version: row.version,
    sortOrder: row.sortOrder,
  };
}
function boardRows(actor: Actor, conn: Conn): TaskBoard[] {
  return conn
    .select()
    .from(schema.taskBoards)
    .where(eq(schema.taskBoards.workspaceId, actor.workspaceId))
    .orderBy(asc(schema.taskBoards.sortOrder), asc(schema.taskBoards.createdAt))
    .all()
    .map(presentBoard);
}
export function listTaskBoards(actor: Actor) {
  access(actor);
  return boardRows(actor, getDb());
}
function placeTask(actor: Actor, input: TaskInput, conn: Conn): TaskInput {
  if (!input.blockId) {
    if (input.columnId) throw new UserError("Selecione o bloco da coluna.");
    return input;
  }
  const board = boardRows(actor, conn).find((b) => b.id === input.blockId);
  if (!board || board.projectId !== input.projectId)
    throw new UserError("Bloco não encontrado neste projeto.");
  const column = board.columns.find((c) => c.id === input.columnId);
  if (!column) throw new UserError("Coluna não encontrada neste bloco.");
  return { ...input, status: column.status };
}
function placementPatch(
  actor: Actor,
  current: Task,
  patch: Partial<TaskInput>,
  conn: Conn,
) {
  if (
    Object.hasOwn(patch, "projectId") &&
    patch.projectId !== current.projectId &&
    !Object.hasOwn(patch, "blockId")
  )
    patch = { ...patch, blockId: null, columnId: null };
  if (
    Object.hasOwn(patch, "status") &&
    patch.status !== current.status &&
    !Object.hasOwn(patch, "columnId")
  ) {
    const board = boardRows(actor, conn).find(
      (b) =>
        b.id === current.blockId &&
        b.projectId === (patch.projectId ?? current.projectId),
    );
    const column = board?.columns.find((c) => c.status === patch.status);
    patch = {
      ...patch,
      blockId: column ? board!.id : null,
      columnId: column?.id ?? null,
    };
  }
  return patch;
}
export function saveTaskBoard(
  actor: Actor,
  raw: unknown,
  id?: string,
  version = 0,
) {
  access(actor, true);
  const input = boardInputSchema.parse(raw);
  return getDb().transaction((tx) => {
    assertProject(actor, input.projectId, tx);
    const boards = boardRows(actor, tx);
    const current = id ? boards.find((b) => b.id === key.parse(id)) : null;
    if (id && !current) throw new UserError("Bloco não encontrado.");
    if (
      current &&
      (current.version !== version ||
        current.projectId !== input.projectId ||
        current.isDefault !== input.isDefault)
    )
      throw new UserError(
        "Este bloco mudou. Atualize a página antes de editar.",
      );
    if (
      !current &&
      input.isDefault &&
      boards.some((b) => b.isDefault && b.projectId === input.projectId)
    )
      throw new UserError(
        "O bloco principal mudou. Atualize a página antes de editar.",
      );
    if (
      !current &&
      boards.filter((b) => b.projectId === input.projectId).length >= 12
    )
      throw new UserError("Use até 12 blocos por projeto.");
    const rows = tx
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.workspaceId, actor.workspaceId))
      .all()
      .filter(
        (t) =>
          t.blockId === current?.id ||
          (input.isDefault && !t.blockId && t.projectId === input.projectId),
      );
    for (const row of rows) {
      const oldColumn =
        current?.columns.find((c) => c.id === row.columnId) ??
        (input.isDefault
          ? (
              current?.columns ??
              boardsForProject([], input.projectId)[0].columns
            ).find((c) => c.status === row.status)
          : undefined);
      const nextColumn = input.columns.find((c) => c.id === oldColumn?.id);
      if (oldColumn && (!nextColumn || nextColumn.status !== row.status))
        throw new UserError(
          "Mova as tarefas antes de remover uma coluna ou alterar sua etapa.",
        );
    }
    const boardId = current?.id ?? newId();
    const values = {
      name: input.name,
      projectId: input.projectId,
      isDefault: input.isDefault,
      columnsJson: JSON.stringify(input.columns),
    };
    if (current)
      tx.update(schema.taskBoards)
        .set({ ...values, version: current.version + 1 })
        .where(eq(schema.taskBoards.id, current.id))
        .run();
    else
      tx.insert(schema.taskBoards)
        .values({
          ...values,
          id: boardId,
          workspaceId: actor.workspaceId,
          sortOrder: Math.max(-1, ...boards.map((b) => b.sortOrder)) + 1,
        })
        .run();
    rows.forEach((row) => reindex(row.id, tx));
    return boardId;
  });
}
// FTS helpers use the same singleton SQLite connection and join the active transaction.
function reindex(id: string, conn: Conn) {
  const row = conn
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, id))
    .get()!;
  if (row.archivedAt || row.status === "done" || row.status === "doing") {
    conn
      .update(schema.taskReminders)
      .set({
        state: "dismissed",
        claimToken: null,
        leaseUntil: null,
        version: sql`${schema.taskReminders.version} + 1`,
      })
      .where(
        and(
          eq(schema.taskReminders.taskId, id),
          ...(row.archivedAt || row.status === "done"
            ? []
            : [eq(schema.taskReminders.kind, "start")]),
        ),
      )
      .run();
  }
  if (row.archivedAt) return removeEntity("task", id);
  const task = present(row);
  const project = task.projectId
    ? conn
        .select()
        .from(schema.taskProjects)
        .where(eq(schema.taskProjects.id, task.projectId))
        .get()?.name
    : "";
  const placement = taskPlacement(
    task,
    boardRows({ workspaceId: row.workspaceId, userId: "" }, conn),
  );
  indexEntity({
    workspaceId: row.workspaceId,
    type: "task",
    id,
    title: task.title,
    body: [
      task.description,
      task.pendingNote,
      task.pendingNote ? PENDING_LABELS[task.pendingKind] : "",
      placement.board.name,
      placement.column?.name,
      ...task.subtasks.map((s) => s.title),
      ...task.people,
      project,
    ].join(" "),
    tags: task.tags.join(" "),
  });
}
export function listTasks(actor: Actor): Task[] {
  access(actor);
  return getDb()
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.workspaceId, actor.workspaceId))
    .orderBy(
      asc(schema.tasks.sortOrder),
      asc(schema.tasks.createdAt),
      asc(schema.tasks.id),
    )
    .all()
    .map(present);
}
export function listTaskProjects(actor: Actor): TaskProject[] {
  access(actor);
  return getDb()
    .select()
    .from(schema.taskProjects)
    .where(eq(schema.taskProjects.workspaceId, actor.workspaceId))
    .orderBy(asc(schema.taskProjects.name))
    .all()
    .map((p) => ({ id: p.id, ...projectInputSchema.parse(p) }));
}
function insertTask(actor: Actor, input: TaskInput, conn: Conn) {
  assertProject(actor, input.projectId, conn);
  input = placeTask(actor, input, conn);
  const id = newId();
  assertDependencies(actor, id, input.dependsOn, conn);
  const max = conn
    .select({ n: sql<number>`coalesce(max(${schema.tasks.sortOrder}), -1)` })
    .from(schema.tasks)
    .where(eq(schema.tasks.workspaceId, actor.workspaceId))
    .get()!.n;
  conn
    .insert(schema.tasks)
    .values({
      ...fields(input),
      id,
      workspaceId: actor.workspaceId,
      createdBy: actor.userId,
      sortOrder: max + 1,
      completedAt: input.status === "done" ? new Date() : null,
    })
    .run();
  reindex(id, conn);
  return present(rowFor(actor, id, conn));
}
export function createTask(actor: Actor, raw: unknown) {
  access(actor, true);
  const input = taskInputSchema.parse(raw);
  return getDb().transaction((tx) => insertTask(actor, input, tx));
}
/** Version checks prevent an open editor from overwriting a collaborator's changes. */
export function updateTask(
  actor: Actor,
  id: string,
  version: number,
  raw: unknown,
) {
  access(actor, true);
  const validated = z.object(taskInputSchema.shape).partial().parse(raw);
  // Zod defaults may populate absent optional fields; only apply supplied keys.
  const patch = Object.fromEntries(
    Object.entries(validated).filter(([key]) =>
      Object.hasOwn(raw as object, key),
    ),
  );
  return getDb().transaction((tx) => {
    const row = rowFor(actor, id, tx);
    if (row.version !== version)
      throw new UserError(
        "Esta tarefa mudou. Feche e abra novamente para ver a versão atual antes de editar.",
      );
    const current = present(row);
    const input = placeTask(
      actor,
      taskInputSchema.parse({
        ...current,
        ...placementPatch(actor, current, patch, tx),
      }),
      tx,
    );
    assertProject(actor, input.projectId, tx);
    assertDependencies(actor, id, input.dependsOn, tx);
    tx.update(schema.tasks)
      .set({
        ...fields(input),
        version: row.version + 1,
        updatedAt: new Date(),
        completedAt:
          input.status === "done" ? (row.completedAt ?? new Date()) : null,
      })
      .where(eq(schema.tasks.id, id))
      .run();
    reindex(id, tx);
    return present(rowFor(actor, id, tx));
  });
}
export function archiveTask(
  actor: Actor,
  id: string,
  version: number,
  archived: boolean,
) {
  access(actor, true);
  return getDb().transaction((tx) => {
    const row = rowFor(actor, id, tx);
    if (row.version !== version)
      throw new UserError(
        "Esta tarefa mudou. Atualize a página e tente novamente.",
      );
    tx.update(schema.tasks)
      .set({
        archivedAt: archived ? new Date() : null,
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, id))
      .run();
    reindex(id, tx);
  });
}
export function moveTask(
  actor: Actor,
  id: string,
  version: number,
  status: TaskStatus,
  beforeId: string | null,
  destination?: TaskDestination,
) {
  access(actor, true);
  z.enum(TASK_STATUSES).parse(status);
  return getDb().transaction((tx) => {
    const row = rowFor(actor, id, tx);
    if (row.version !== version || row.archivedAt)
      throw new UserError(
        "Esta tarefa mudou. Atualize a página e tente novamente.",
      );
    const current = present(row);
    const aggregate =
      destination?.aggregate === undefined
        ? false
        : z.boolean().parse(destination.aggregate);
    const main = aggregate
      ? boardsForProject(boardRows(actor, tx), current.projectId).find(
          (b) => b.isDefault,
        )!
      : null;
    const patch = main
      ? columnDestination(main, main.columns.find((c) => c.status === status)!)
      : (destination ?? placementPatch(actor, current, { status }, tx));
    const input = placeTask(
      actor,
      taskInputSchema.parse({ ...current, ...patch }),
      tx,
    );
    assertProject(actor, input.projectId, tx);
    const boards = boardRows(actor, tx);
    const destinationPlacement = taskPlacement(input, boards);
    const sameLane = (other: Task) => {
      const p = taskPlacement(other, boards);
      return aggregate
        ? p.board.isDefault && other.status === input.status
        : other.projectId === input.projectId &&
            p.board.id === destinationPlacement.board.id &&
            p.column?.id === destinationPlacement.column?.id;
    };
    const target = beforeId ? present(rowFor(actor, beforeId, tx)) : null;
    if (target && (target.archivedAt || target.id === id || !sameLane(target)))
      throw new UserError("Destino inválido.");
    const rows = tx
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.workspaceId, actor.workspaceId),
          isNull(schema.tasks.archivedAt),
        ),
      )
      .orderBy(
        asc(schema.tasks.sortOrder),
        asc(schema.tasks.createdAt),
        asc(schema.tasks.id),
      )
      .all()
      .map(present)
      .filter((t) => t.id !== id && sameLane(t));
    const position = target
      ? rows.findIndex((t) => t.id === target.id)
      : rows.length;
    rows.splice(position, 0, current);
    rows.forEach((t, i) => {
      tx.update(schema.tasks)
        .set(
          t.id === id
            ? {
                sortOrder: i,
                status: input.status,
                projectId: input.projectId,
                blockId: input.blockId,
                columnId: input.columnId,
                version: row.version + 1,
                updatedAt: new Date(),
                completedAt:
                  input.status === "done"
                    ? (row.completedAt ?? new Date())
                    : null,
              }
            : { sortOrder: i },
        )
        .where(eq(schema.tasks.id, t.id))
        .run();
    });
    reindex(id, tx);
  });
}
export function saveTaskProject(actor: Actor, raw: unknown, id?: string) {
  access(actor, true);
  const input = projectInputSchema.parse(raw);
  return getDb().transaction((tx) => {
    const duplicate = tx
      .select()
      .from(schema.taskProjects)
      .where(
        and(
          eq(schema.taskProjects.workspaceId, actor.workspaceId),
          eq(schema.taskProjects.name, input.name),
        ),
      )
      .get();
    if (duplicate && duplicate.id !== id)
      throw new UserError("Já existe um projeto com esse nome.");
    const projectId = id ? key.parse(id) : newId();
    if (id) {
      assertProject(actor, id, tx);
      tx.update(schema.taskProjects)
        .set(input)
        .where(eq(schema.taskProjects.id, id))
        .run();
      tx.select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(eq(schema.tasks.projectId, id))
        .all()
        .forEach((t) => reindex(t.id, tx));
    } else
      tx.insert(schema.taskProjects)
        .values({ ...input, id: projectId, workspaceId: actor.workspaceId })
        .run();
    return projectId;
  });
}
export function deleteTaskProject(actor: Actor, id: string) {
  access(actor, true);
  return getDb().transaction((tx) => {
    assertProject(actor, key.parse(id), tx);
    const rows = tx
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, id))
      .all();
    for (const task of rows) {
      tx.update(schema.tasks)
        .set({
          projectId: null,
          blockId: null,
          columnId: null,
          version: task.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.tasks.id, task.id))
        .run();
    }
    tx.delete(schema.taskProjects).where(eq(schema.taskProjects.id, id)).run();
    for (const task of rows) reindex(task.id, tx);
  });
}
export function importTasks(actor: Actor, markdown: string) {
  access(actor, true);
  let inputs: ReturnType<typeof parseTasksMarkdown>;
  try {
    inputs = parseTasksMarkdown(markdown);
  } catch (e) {
    if (e instanceof z.ZodError) throw e;
    throw new UserError(e instanceof Error ? e.message : "Markdown inválido.");
  }
  return getDb().transaction((tx) => {
    const projects = tx
      .select()
      .from(schema.taskProjects)
      .where(eq(schema.taskProjects.workspaceId, actor.workspaceId))
      .all();
    const map = new Map(projects.map((p) => [p.name, p.id]));
    const copied = new Map<string, string>();
    const pendingLinks: { id: string; dependencies: string[] }[] = [];
    for (const input of inputs) {
      let projectId: string | null = null;
      if (input.projectName) {
        const name = projectInputSchema.parse({ name: input.projectName }).name;
        projectId = map.get(name) ?? newId();
        if (!map.has(name)) {
          tx.insert(schema.taskProjects)
            .values({
              id: projectId,
              workspaceId: actor.workspaceId,
              name,
              color: input.projectColor ?? "lavender",
            })
            .run();
          map.set(name, projectId);
        }
      }
      let blockId: string | null = null,
        columnId: string | null = null;
      if (input.blockName) {
        let board = boardRows(actor, tx).find(
          (b) => b.projectId === projectId && b.name === input.blockName,
        );
        if (!board) {
          const id = saveTaskBoard(actor, {
            name: input.blockName,
            projectId,
            columns: [
              {
                id: newId(),
                name: input.columnName ?? "A fazer",
                status: input.status,
              },
            ],
          });
          board = boardRows(actor, tx).find((b) => b.id === id)!;
        }
        let column =
          board.columns.find(
            (c) => c.name === input.columnName && c.status === input.status,
          ) ??
          (!input.columnName
            ? board.columns.find((c) => c.status === input.status)
            : undefined);
        if (!column) {
          column = {
            id: newId(),
            name: input.columnName ?? input.status,
            status: input.status,
            limit: null,
          };
          saveTaskBoard(
            actor,
            { ...board, columns: [...board.columns, column] },
            board.id,
            board.version,
          );
        }
        blockId = board.id;
        columnId = column.id;
      }
      const task = insertTask(
        actor,
        taskInputSchema.parse({
          ...input,
          projectId,
          blockId,
          columnId,
          dependsOn: [],
        }),
        tx,
      );
      if (input.reference) {
        if (copied.has(input.reference.id))
          throw new UserError(
            "Há referências de tarefa duplicadas no arquivo.",
          );
        copied.set(input.reference.id, task.id);
      }
      pendingLinks.push({ id: task.id, dependencies: input.dependsOn });
    }
    for (const link of pendingLinks) {
      const dependencies = link.dependencies.map((id) => copied.get(id) ?? id);
      if (dependencies.length)
        updateTask(actor, link.id, 1, { dependsOn: dependencies });
    }
    return inputs.length;
  });
}

/** Validate the whole selection before writing; stale or foreign rows roll back the batch. */
export function changeTasks(
  actor: Actor,
  rawTargets: unknown,
  rawChange: unknown,
) {
  access(actor, true);
  const targets = z
    .array(z.object({ id: key, version: z.number().int().positive() }))
    .min(1)
    .max(200)
    .parse(rawTargets);
  if (new Set(targets.map((t) => t.id)).size !== targets.length)
    throw new UserError("A seleção contém tarefas duplicadas.");
  const change = taskBulkChangeSchema.parse(rawChange);
  return getDb().transaction((tx) => {
    for (const target of targets) {
      const row = rowFor(actor, target.id, tx);
      if (row.version !== target.version)
        throw new UserError(
          "Uma tarefa da seleção mudou. Atualize a página e selecione novamente.",
        );
    }
    if (change.type === "project") assertProject(actor, change.value, tx);
    for (const { id, version } of targets) {
      if (change.type === "archive")
        archiveTask(actor, id, version, change.value);
      else
        updateTask(
          actor,
          id,
          version,
          change.type === "status"
            ? { status: change.value }
            : change.type === "project"
              ? { projectId: change.value }
              : { dueDate: change.value },
        );
    }
    return targets.length;
  });
}

function resolveMarkdownUpdate(
  actor: Actor,
  input: ReturnType<typeof parseTasksMarkdown>[number],
  current: Task,
  conn: Conn,
): TaskInput {
  const projects = conn
    .select()
    .from(schema.taskProjects)
    .where(eq(schema.taskProjects.workspaceId, actor.workspaceId))
    .all();
  const project = input.projectName
    ? projects.find((p) => p.name === input.projectName)
    : null;
  if (input.projectName && !project)
    throw new UserError(
      "Crie o projeto indicado antes de atualizar esta tarefa.",
    );
  const scoped = boardsForProject(boardRows(actor, conn), project?.id ?? null);
  const previous = taskPlacement(current, boardRows(actor, conn));
  const matchingBoards = scoped.filter((b) => b.name === input.blockName);
  let board = input.blockName
    ? previous.board.projectId === (project?.id ?? null) &&
      previous.board.name === input.blockName
      ? scoped.find((b) => b.id === previous.board.id)
      : matchingBoards.length === 1
        ? matchingBoards[0]
        : undefined
    : scoped.find((b) => b.isDefault);
  if (!board)
    throw new UserError("O bloco indicado não está disponível neste projeto.");
  const namedColumns = board.columns.filter(
    (c) => c.name === input.columnName && c.status === input.status,
  );
  if (
    namedColumns.length > 1 &&
    !(
      previous.board.id === board.id &&
      namedColumns.some((c) => c.id === previous.column?.id)
    )
  )
    throw new UserError(
      "Há colunas com o mesmo nome. Diferencie os nomes antes de atualizar.",
    );
  let column = input.columnName
    ? ((previous.board.id === board.id
        ? namedColumns.find((c) => c.id === previous.column?.id)
        : undefined) ?? namedColumns[0])
    : board.columns.find((c) => c.status === input.status);
  if (
    !column &&
    input.columnName &&
    !board.columns.some((c) => c.name === input.columnName)
  )
    throw new UserError("A coluna indicada não está disponível neste bloco.");
  if (!column) column = board.columns.find((c) => c.status === input.status);
  if (!column) {
    board = scoped.find((b) => b.isDefault)!;
    column = board.columns.find((c) => c.status === input.status)!;
  }
  const usedIds = new Set<string>();
  const subtasks = input.subtasks.map((s, i) => {
    const existing =
      current.subtasks.find((old) => old.id === s.id && !usedIds.has(old.id)) ??
      current.subtasks.find(
        (old) => old.title === s.title && !usedIds.has(old.id),
      ) ??
      (!usedIds.has(current.subtasks[i]?.id) ? current.subtasks[i] : undefined);
    const baseId = `md-${createHash("sha256")
      .update(JSON.stringify([current.id, i, s.title]))
      .digest("hex")
      .slice(0, 24)}`;
    let id = existing?.id ?? baseId;
    for (
      let suffix = 1;
      !existing &&
      (usedIds.has(id) || current.subtasks.some((old) => old.id === id));
      suffix++
    )
      id = `${baseId}-${suffix}`;
    usedIds.add(id);
    return { ...s, id };
  });
  return placeTask(
    actor,
    taskInputSchema.parse({
      ...input,
      ...columnDestination(board, column),
      subtasks,
    }),
    conn,
  );
}
function markdownChanges(
  before: TaskInput,
  after: TaskInput,
  all: Task[],
  boards: TaskBoard[],
  projects: TaskProject[],
): MarkdownFieldChange[] {
  const names = new Map(all.map((t) => [t.id, t.title]));
  const labels: Partial<Record<keyof TaskInput, string>> = {
    title: "Título",
    description: "Contexto",
    pendingNote: "Observação pendente",
    pendingKind: "Tipo de pendência",
    projectId: "Projeto",
    status: "Etapa",
    priority: "Prioridade",
    color: "Cor",
    dueDate: "Meta de conclusão",
    followUpDate: "Acompanhar em",
    tags: "Marcadores",
    people: "Pessoas de apoio",
    subtasks: "Subtarefas",
    dependsOn: "Depende de",
  };
  const value = (task: TaskInput, field: keyof TaskInput): string => {
    if (field === "projectId")
      return (
        projects.find((p) => p.id === task.projectId)?.name ?? "Sem projeto"
      );
    if (field === "status") return STATUS_LABELS[task.status];
    if (field === "priority") return PRIORITY_LABELS[task.priority];
    if (field === "color") return COLOR_LABELS[task.color];
    if (field === "pendingKind") return PENDING_LABELS[task.pendingKind];
    if (field === "subtasks")
      return task.subtasks
        .map((s) => `- [${s.done ? "x" : " "}] ${s.title}`)
        .join("\n");
    if (field === "dependsOn")
      return task.dependsOn
        .map((id) => {
          const title = names.get(id);
          return title
            ? `${title}${all.filter((t) => t.title === title).length > 1 ? ` · ${id.slice(0, 6)}` : ""}`
            : "Referência indisponível";
        })
        .join("\n");
    const v = task[field];
    return Array.isArray(v) ? v.join("\n") : String(v ?? "");
  };
  const result: MarkdownFieldChange[] = [];
  for (const field of Object.keys(labels) as (keyof TaskInput)[]) {
    const a = value(before, field),
      b = value(after, field);
    const semantic = (task: TaskInput) =>
      field === "subtasks"
        ? task.subtasks.map(({ title, done }) => ({ title, done }))
        : task[field];
    if (JSON.stringify(semantic(before)) !== JSON.stringify(semantic(after)))
      result.push({ field: labels[field]!, before: a, after: b });
  }
  const location = (task: TaskInput) => {
    const p = taskPlacement(task, boards);
    return `${p.board.name} / ${p.column?.name ?? ""}`;
  };
  if (location(before) !== location(after))
    result.push({
      field: "Bloco e coluna",
      before: location(before),
      after: location(after),
    });
  return result;
}
function buildMarkdownReview(actor: Actor, text: string, conn: Conn) {
  let inputs: ReturnType<typeof parseTasksMarkdown>;
  try {
    inputs = parseTasksMarkdown(text);
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    throw new UserError(
      error instanceof Error ? error.message : "Markdown inválido.",
    );
  }
  const references = inputs.flatMap((input) =>
    input.reference ? [input.reference.id] : [],
  );
  if (new Set(references).size !== references.length)
    throw new UserError("Há referências de tarefa duplicadas no arquivo.");
  const all = conn
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.workspaceId, actor.workspaceId))
    .all()
    .map(present);
  const boards = boardRows(actor, conn),
    projects = listTaskProjects(actor);
  const updates = new Map<number, { current: Task; input: TaskInput }>();
  const rows: MarkdownReview["rows"] = inputs.map((input, index) => {
    const conflict = (message: string): MarkdownReview["rows"][number] => ({
      index,
      title: input.title,
      kind: "conflict",
      message,
      changes: [],
    });
    if (!input.reference)
      return conflict(
        "Sem referência Waypoint. Use Importar Markdown para criar uma nova tarefa.",
      );
    const current = all.find((t) => t.id === input.reference!.id);
    if (!current)
      return conflict("A referência não está disponível neste workspace.");
    if (current.archivedAt)
      return conflict(
        "Esta tarefa está arquivada. Restaure-a antes de atualizar.",
      );
    if (current.version !== input.reference.version)
      return conflict(
        "Esta tarefa mudou desde a exportação. Exporte a versão atual e revise novamente.",
      );
    try {
      const next = resolveMarkdownUpdate(actor, input, current, conn);
      if (
        next.dependsOn.includes(current.id) ||
        next.dependsOn.some((id) => !all.some((t) => t.id === id))
      )
        throw new UserError(
          "Revise as referências das dependências desta tarefa.",
        );
      const changes = markdownChanges(current, next, all, boards, projects);
      if (changes.length) updates.set(index, { current, input: next });
      return {
        index,
        title: input.title,
        kind: changes.length ? "update" : "unchanged",
        message: null,
        changes,
      };
    } catch (error) {
      return conflict(
        error instanceof UserError
          ? error.message
          : "Revise os campos desta tarefa.",
      );
    }
  });
  const token = createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: actor.workspaceId,
        text,
        rows,
        updates: [...updates].map(([index, { current, input }]) => ({
          index,
          id: current.id,
          version: current.version,
          input,
        })),
      }),
    )
    .digest("hex");
  return { review: { token, rows }, updates };
}
export function previewTaskUpdates(actor: Actor, text: string): MarkdownReview {
  access(actor, true);
  return buildMarkdownReview(actor, z.string().max(250000).parse(text), getDb())
    .review;
}
export function applyTaskUpdates(
  actor: Actor,
  text: string,
  token: string,
  rawSelection: unknown,
) {
  access(actor, true);
  const selection = z
    .array(z.number().int().min(0).max(199))
    .min(1)
    .max(200)
    .parse(rawSelection);
  if (new Set(selection).size !== selection.length)
    throw new UserError("A seleção contém tarefas duplicadas.");
  return getDb().transaction((tx) => {
    const { review, updates } = buildMarkdownReview(
      actor,
      z.string().max(250000).parse(text),
      tx,
    );
    if (review.token !== z.string().length(64).parse(token))
      throw new UserError("A prévia mudou. Revise novamente antes de aplicar.");
    const chosen = selection.map((i) => {
      const update = updates.get(i);
      if (!update)
        throw new UserError("Selecione apenas tarefas com alterações válidas.");
      return update;
    });
    const graph = dependencyGraph(actor, tx);
    chosen.forEach(({ current, input }) =>
      graph.set(current.id, input.dependsOn),
    );
    validateDependencyGraph(graph);
    for (const { current, input } of chosen) {
      tx.update(schema.tasks)
        .set({
          ...fields(input),
          version: current.version + 1,
          updatedAt: new Date(),
          completedAt:
            input.status === "done"
              ? current.completedAt
                ? new Date(current.completedAt)
                : new Date()
              : null,
        })
        .where(eq(schema.tasks.id, current.id))
        .run();
      reindex(current.id, tx);
    }
    return chosen.length;
  });
}
