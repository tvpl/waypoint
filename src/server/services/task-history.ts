import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { newId } from "@/lib/utils";
import { canEditWorkspace, UserError, workspaceRole } from "./workspaces";
import { changedTaskFields, completedSubtasks, joinLabels, taskNoteSchema, type TaskEvent } from "@/domain/task-history";
import type { Task, TaskInput, TaskStatus } from "@/domain/tasks";

type Actor = { workspaceId: string; userId: string };
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Conn = ReturnType<typeof getDb> | Tx;
const key = z.string().min(1).max(64);

function insertEvent(
  conn: Conn,
  actor: Actor,
  taskId: string,
  event: { kind: TaskEvent["kind"]; fromStatus?: TaskStatus | null; toStatus?: TaskStatus | null; body?: string },
) {
  conn
    .insert(schema.taskEvents)
    .values({
      id: newId(),
      taskId,
      workspaceId: actor.workspaceId,
      // Imports and restores may run for people who left; the event survives without an author.
      userId: actor.userId || null,
      kind: event.kind,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus ?? null,
      body: event.body ?? "",
      createdAt: new Date(),
    })
    .run();
}

/** A task was created (or imported, or brought back from a backup). */
export function recordTaskCreated(conn: Conn, actor: Actor, task: Pick<Task, "id" | "status">, kind: "created" | "imported" = "created") {
  insertEvent(conn, actor, task.id, { kind, toStatus: task.status });
}

/** Diffs two versions of a task and records the stage change and the edited fields. */
export function recordTaskChange(conn: Conn, actor: Actor, id: string, before: TaskInput, after: TaskInput) {
  if (before.status !== after.status) insertEvent(conn, actor, id, { kind: "status", fromStatus: before.status, toStatus: after.status });
  const fields = changedTaskFields(before, after);
  const checked = completedSubtasks(before, after);
  // Columns follow the stage when only the stage changed.
  const meaningful = before.status !== after.status ? fields.filter((f) => f !== "coluna" && f !== "bloco") : fields;
  if (meaningful.length) {
    const progress = checked.length === 1 ? `; concluiu a subtarefa “${checked[0]}”` : checked.length > 1 ? `; concluiu ${checked.length} subtarefas` : "";
    insertEvent(conn, actor, id, { kind: "updated", body: `${joinLabels(meaningful)}${progress}` });
  }
}

export function recordTaskArchive(conn: Conn, actor: Actor, id: string, archived: boolean) {
  insertEvent(conn, actor, id, { kind: archived ? "archived" : "restored" });
}

function access(actor: Actor, edit = false) {
  const role = workspaceRole(actor.userId, actor.workspaceId);
  if (!role || (edit && !canEditWorkspace(role))) throw new UserError("Você não tem permissão para esta ação.");
  return role;
}

function assertTask(actor: Actor, taskId: string) {
  const row = getDb()
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, key.parse(taskId)), eq(schema.tasks.workspaceId, actor.workspaceId)))
    .get();
  if (!row) throw new UserError("Tarefa não encontrada.");
}

function present(rows: { event: typeof schema.taskEvents.$inferSelect; userName: string | null }[]): TaskEvent[] {
  return rows.map(({ event: e, userName }) => ({
    id: e.id,
    taskId: e.taskId,
    kind: e.kind,
    fromStatus: e.fromStatus as TaskStatus | null,
    toStatus: e.toStatus as TaskStatus | null,
    body: e.body,
    userId: e.userId,
    userName,
    createdAt: e.createdAt.valueOf(),
  }));
}

function select(where: ReturnType<typeof and>) {
  return getDb()
    .select({ event: schema.taskEvents, userName: schema.users.name })
    .from(schema.taskEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.taskEvents.userId))
    .where(where)
    // Insertion order breaks ties within the same millisecond.
    .orderBy(asc(schema.taskEvents.createdAt), asc(sql`${schema.taskEvents}.rowid`))
    .all();
}

/** Oldest first. */
export function listTaskHistory(actor: Actor, taskId: string): TaskEvent[] {
  access(actor);
  assertTask(actor, taskId);
  return present(select(and(eq(schema.taskEvents.taskId, taskId), eq(schema.taskEvents.workspaceId, actor.workspaceId))));
}

/** History of many tasks at once (reports), grouped by task. */
export function historyForTasks(actor: Actor, taskIds: string[]): Map<string, TaskEvent[]> {
  access(actor);
  const result = new Map<string, TaskEvent[]>();
  for (let i = 0; i < taskIds.length; i += 500) {
    const chunk = taskIds.slice(i, i + 500);
    if (!chunk.length) continue;
    for (const e of present(select(and(inArray(schema.taskEvents.taskId, chunk), eq(schema.taskEvents.workspaceId, actor.workspaceId))))) {
      const list = result.get(e.taskId) ?? [];
      list.push(e);
      result.set(e.taskId, list);
    }
  }
  return result;
}

export function addTaskNote(actor: Actor, taskId: string, rawBody: unknown): TaskEvent {
  access(actor, true);
  assertTask(actor, taskId);
  const body = taskNoteSchema.parse(rawBody);
  const count = getDb()
    .select({ id: schema.taskEvents.id })
    .from(schema.taskEvents)
    .where(and(eq(schema.taskEvents.taskId, taskId), eq(schema.taskEvents.kind, "note")))
    .all().length;
  if (count >= 500) throw new UserError("Esta tarefa já tem 500 observações.");
  const id = newId();
  getDb().insert(schema.taskEvents).values({ id, taskId, workspaceId: actor.workspaceId, userId: actor.userId, kind: "note", body, createdAt: new Date() }).run();
  return present(select(eq(schema.taskEvents.id, id)))[0];
}

/** Authors remove their own observations; owners can remove any. Lifecycle events are permanent. */
export function deleteTaskNote(actor: Actor, noteId: string) {
  const role = access(actor, true);
  const row = getDb()
    .select()
    .from(schema.taskEvents)
    .where(and(eq(schema.taskEvents.id, key.parse(noteId)), eq(schema.taskEvents.workspaceId, actor.workspaceId), eq(schema.taskEvents.kind, "note")))
    .get();
  if (!row) throw new UserError("Observação não encontrada.");
  if (row.userId !== actor.userId && role !== "owner") throw new UserError("Só quem escreveu pode excluir esta observação.");
  getDb().delete(schema.taskEvents).where(eq(schema.taskEvents.id, row.id)).run();
}
