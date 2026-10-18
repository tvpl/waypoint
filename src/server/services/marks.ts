import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { UserError, workspaceRole } from "./workspaces";
import { planAccess } from "./permissions";
import { collectionVisibleTo, favoriteVisibleTo } from "./links";

type Actor = { workspaceId: string; userId: string };
export type ImportantType = "task" | "plan" | "collection" | "favorite";
const key = z.string().min(1).max(64);

/** The entity must belong to the workspace and be visible to this person. */
function assertVisible(actor: Actor, type: ImportantType, id: string) {
  const db = getDb();
  const ok =
    type === "task"
      ? !!db.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.id, id), eq(schema.tasks.workspaceId, actor.workspaceId))).get()
      : type === "plan"
        ? (() => {
            const plan = db.select().from(schema.plans).where(and(eq(schema.plans.id, id), eq(schema.plans.workspaceId, actor.workspaceId), isNull(schema.plans.deletedAt))).get();
            return !!plan && !!planAccess(actor.userId, plan);
          })()
        : type === "collection"
          ? !!db.select({ id: schema.collections.id }).from(schema.collections).where(and(eq(schema.collections.id, id), eq(schema.collections.workspaceId, actor.workspaceId), collectionVisibleTo(actor.workspaceId, actor.userId))).get()
          : !!db.select({ id: schema.favorites.id }).from(schema.favorites).where(and(eq(schema.favorites.id, id), eq(schema.favorites.workspaceId, actor.workspaceId), favoriteVisibleTo(actor.workspaceId, actor.userId))).get();
  if (!ok) throw new UserError("Item não encontrado.");
}

/** Toggles the personal "Importante" star. Returns the new state. */
export function toggleImportant(actor: Actor, type: ImportantType, rawId: string) {
  if (!workspaceRole(actor.userId, actor.workspaceId)) throw new UserError("Você não tem permissão para esta ação.");
  const id = key.parse(rawId);
  assertVisible(actor, type, id);
  const db = getDb();
  const where = and(eq(schema.userMarks.userId, actor.userId), eq(schema.userMarks.entityType, type), eq(schema.userMarks.entityId, id), eq(schema.userMarks.mark, "star"));
  const exists = db.select().from(schema.userMarks).where(where).get();
  if (exists) db.delete(schema.userMarks).where(where).run();
  else db.insert(schema.userMarks).values({ userId: actor.userId, entityType: type, entityId: id, mark: "star" }).run();
  return !exists;
}

export function starredIds(userId: string, type: ImportantType): Set<string> {
  return new Set(
    getDb()
      .select({ id: schema.userMarks.entityId })
      .from(schema.userMarks)
      .where(and(eq(schema.userMarks.userId, userId), eq(schema.userMarks.entityType, type), eq(schema.userMarks.mark, "star")))
      .all()
      .map((r) => r.id),
  );
}

export type ImportantItem =
  | { type: "task"; id: string; title: string; status: string; dueDate: string | null; projectName: string | null; projectColor: string | null; markedAt: number }
  | { type: "plan"; id: string; title: string; markedAt: number }
  | { type: "collection"; id: string; title: string; icon: string | null; color: string | null; markedAt: number };

/** Starred tasks (open ones), plans and collections of the workspace, most recently marked first. */
export function importantItems(actor: Actor, limit = 24): ImportantItem[] {
  const db = getDb();
  const marks = db
    .select()
    .from(schema.userMarks)
    .where(and(eq(schema.userMarks.userId, actor.userId), eq(schema.userMarks.mark, "star"), inArray(schema.userMarks.entityType, ["task", "plan", "collection"])))
    .orderBy(desc(schema.userMarks.createdAt))
    .all();
  const ids = (type: string) => marks.filter((m) => m.entityType === type).map((m) => m.entityId);
  const markedAt = new Map(marks.map((m) => [`${m.entityType}:${m.entityId}`, m.createdAt.valueOf()]));
  const items: ImportantItem[] = [];
  const taskIds = ids("task");
  if (taskIds.length) {
    const rows = db
      .select({ task: schema.tasks, project: schema.taskProjects })
      .from(schema.tasks)
      .leftJoin(schema.taskProjects, eq(schema.taskProjects.id, schema.tasks.projectId))
      .where(and(inArray(schema.tasks.id, taskIds), eq(schema.tasks.workspaceId, actor.workspaceId), isNull(schema.tasks.archivedAt)))
      .all();
    for (const { task, project } of rows)
      if (task.status !== "done")
        items.push({
          type: "task",
          id: task.id,
          title: task.title,
          status: task.status,
          dueDate: task.dueDate,
          projectName: project?.name ?? null,
          projectColor: project?.color ?? null,
          markedAt: markedAt.get(`task:${task.id}`)!,
        });
  }
  const planIds = ids("plan");
  if (planIds.length)
    for (const p of db.select().from(schema.plans).where(and(inArray(schema.plans.id, planIds), eq(schema.plans.workspaceId, actor.workspaceId), isNull(schema.plans.archivedAt), isNull(schema.plans.deletedAt))).all())
      if (planAccess(actor.userId, p)) items.push({ type: "plan", id: p.id, title: p.title, markedAt: markedAt.get(`plan:${p.id}`)! });
  const collectionIds = ids("collection");
  if (collectionIds.length)
    for (const c of db
      .select()
      .from(schema.collections)
      .where(and(inArray(schema.collections.id, collectionIds), eq(schema.collections.workspaceId, actor.workspaceId), collectionVisibleTo(actor.workspaceId, actor.userId), isNull(schema.collections.archivedAt)))
      .all())
      items.push({ type: "collection", id: c.id, title: c.name, icon: c.icon, color: c.color, markedAt: markedAt.get(`collection:${c.id}`)! });
  return items.sort((a, b) => b.markedAt - a.markedAt).slice(0, limit);
}
