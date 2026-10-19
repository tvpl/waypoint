import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { canEditWorkspace, UserError, workspaceRole } from "./workspaces";
import { resolveResource } from "./resources";
import type { ResolvedResource } from "@/features/planner/resource-types";

type Actor = { workspaceId: string; userId: string };
export const TASK_LINK_TYPES = ["plan", "favorite", "collection"] as const;
export type TaskLinkType = (typeof TASK_LINK_TYPES)[number];
export type TaskLinkRef = { type: TaskLinkType; id: string };
export type TaskLinkView = TaskLinkRef & { resource: ResolvedResource };
export const MAX_TASK_LINKS = 30;
const refSchema = z.object({ type: z.enum(TASK_LINK_TYPES), id: z.string().min(1).max(64) });

function role(actor: Actor, edit = false) {
  const r = workspaceRole(actor.userId, actor.workspaceId);
  if (!r || (edit && !canEditWorkspace(r))) throw new UserError("Você não tem permissão para esta ação.");
}
function assertTask(actor: Actor, taskId: string) {
  if (!getDb().select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.workspaceId, actor.workspaceId))).get())
    throw new UserError("Tarefa não encontrada.");
}
const view = (actor: Actor, ref: TaskLinkRef): TaskLinkView => ({ ...ref, resource: resolveResource(ref, actor.userId, actor.workspaceId) });

/** What a task points at, resolved with the viewer's access (restricted items show as such). */
export function listTaskLinks(actor: Actor, taskId: string): TaskLinkView[] {
  role(actor);
  assertTask(actor, z.string().max(64).parse(taskId));
  return getDb()
    .select()
    .from(schema.taskLinks)
    .where(eq(schema.taskLinks.taskId, taskId))
    .orderBy(schema.taskLinks.createdAt)
    .all()
    .map((r) => view(actor, { type: r.targetType, id: r.targetId }));
}

/** Replaces the task's references; every target must be in this workspace and visible to the person. */
export function setTaskLinks(actor: Actor, taskId: string, raw: unknown): TaskLinkView[] {
  role(actor, true);
  assertTask(actor, z.string().max(64).parse(taskId));
  const refs = z.array(refSchema).max(MAX_TASK_LINKS, `Vincule até ${MAX_TASK_LINKS} itens.`).parse(raw);
  const unique = [...new Map(refs.map((r) => [`${r.type}:${r.id}`, r])).values()];
  const db = getDb();
  for (const ref of unique) {
    const table = ref.type === "plan" ? schema.plans : ref.type === "favorite" ? schema.favorites : schema.collections;
    const row = db.select({ workspaceId: table.workspaceId }).from(table).where(eq(table.id, ref.id)).get();
    if (!row || row.workspaceId !== actor.workspaceId || !view(actor, ref).resource.href) throw new UserError("Um dos itens não está disponível neste workspace.");
  }
  db.transaction((tx) => {
    tx.delete(schema.taskLinks).where(eq(schema.taskLinks.taskId, taskId)).run();
    unique.forEach((ref, i) =>
      tx.insert(schema.taskLinks).values({ taskId, workspaceId: actor.workspaceId, targetType: ref.type, targetId: ref.id, createdAt: new Date(Date.now() + i) }).run(),
    );
  });
  return unique.map((r) => view(actor, r));
}

/** Number of references per task (card indicator). */
export function taskLinkCounts(actor: Actor): Record<string, number> {
  role(actor);
  const out: Record<string, number> = {};
  for (const r of getDb().select({ taskId: schema.taskLinks.taskId }).from(schema.taskLinks).where(eq(schema.taskLinks.workspaceId, actor.workspaceId)).all())
    out[r.taskId] = (out[r.taskId] ?? 0) + 1;
  return out;
}

export type TaskBacklink = { id: string; title: string; status: string; projectName: string | null; archived: boolean };

/** Tasks that point at a plan, link or collection. */
export function tasksLinkedTo(actor: Actor, type: TaskLinkType, id: string): TaskBacklink[] {
  role(actor);
  const links = getDb()
    .select({ taskId: schema.taskLinks.taskId })
    .from(schema.taskLinks)
    .where(and(eq(schema.taskLinks.workspaceId, actor.workspaceId), eq(schema.taskLinks.targetType, type), eq(schema.taskLinks.targetId, id)))
    .all()
    .map((r) => r.taskId);
  if (!links.length) return [];
  return getDb()
    .select({ task: schema.tasks, project: schema.taskProjects.name })
    .from(schema.tasks)
    .leftJoin(schema.taskProjects, eq(schema.taskProjects.id, schema.tasks.projectId))
    .where(and(inArray(schema.tasks.id, links), eq(schema.tasks.workspaceId, actor.workspaceId), isNull(schema.tasks.archivedAt)))
    .all()
    .map(({ task, project }) => ({ id: task.id, title: task.title, status: task.status, projectName: project, archived: !!task.archivedAt }))
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.title.localeCompare(b.title));
}
