import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import { normalizeTag } from "@/lib/utils";
import { ensureTags } from "./tags";
import { reindexTasks } from "./tasks";

/** Open (non-archived) task count per normalized tag name. */
export function taskTagCounts(workspaceId: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of getDb()
    .select({ tags: schema.tasks.tagsJson })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.workspaceId, workspaceId), isNull(schema.tasks.archivedAt)))
    .all())
    for (const name of new Set((JSON.parse(r.tags) as string[]).map(normalizeTag).filter(Boolean))) counts.set(name, (counts.get(name) ?? 0) + 1);
  return counts;
}

/** Task markers become workspace tags, so the Tags page and #tag pages see them too. */
export function syncTaskTags(workspaceId: string) {
  const names = [...taskTagCounts(workspaceId).keys()];
  if (names.length) ensureTags(getDb(), workspaceId, names);
}

/** Tasks carrying a tag (matched by normalized name). */
export function tasksWithTag(workspaceId: string, name: string) {
  const tag = normalizeTag(name);
  return getDb()
    .select({ task: schema.tasks, project: schema.taskProjects.name })
    .from(schema.tasks)
    .leftJoin(schema.taskProjects, eq(schema.taskProjects.id, schema.tasks.projectId))
    .where(and(eq(schema.tasks.workspaceId, workspaceId), isNull(schema.tasks.archivedAt)))
    .all()
    .filter(({ task }) => (JSON.parse(task.tagsJson) as string[]).some((t) => normalizeTag(t) === tag))
    .map(({ task, project }) => ({ id: task.id, title: task.title, status: task.status, dueDate: task.dueDate, projectName: project }));
}

/** Keeps task markers in step with a tag rename or deletion on the Tags page. */
export function retagTasks(workspaceId: string, from: string, to: string | null) {
  const old = normalizeTag(from);
  const db = getDb();
  const changed: string[] = [];
  db.transaction((tx) => {
    for (const row of tx.select().from(schema.tasks).where(eq(schema.tasks.workspaceId, workspaceId)).all()) {
      const tags = JSON.parse(row.tagsJson) as string[];
      if (!tags.some((t) => normalizeTag(t) === old)) continue;
      const next = [...new Set(tags.flatMap((t) => (normalizeTag(t) === old ? (to ? [to] : []) : [t])))];
      tx.update(schema.tasks)
        .set({ tagsJson: JSON.stringify(next), version: row.version + 1, updatedAt: new Date() })
        .where(eq(schema.tasks.id, row.id))
        .run();
      changed.push(row.id);
    }
  });
  reindexTasks(changed);
  return changed.length;
}
