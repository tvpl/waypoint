import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { canEditWorkspace, UserError, workspaceRole } from "./workspaces";
import { boardsForProject } from "@/domain/task-board";
import { taskTemplateSchema, type TaskTemplate } from "@/domain/task-template";
import { projectInputSchema } from "@/domain/tasks";
import {
  listTaskBoards,
  listTaskProjects,
  saveTaskBoard,
  saveTaskProject,
} from "./tasks";
import { newId } from "@/lib/utils";
type Actor = { workspaceId: string; userId: string };
const key = z.string().min(1).max(64);
function access(actor: Actor, edit = false) {
  const role = workspaceRole(actor.userId, actor.workspaceId);
  if (!role || (edit && !canEditWorkspace(role)))
    throw new UserError("Você não tem permissão para esta ação.");
}
function present(row: typeof schema.taskTemplates.$inferSelect): TaskTemplate {
  return {
    ...taskTemplateSchema.parse({ ...row, boards: JSON.parse(row.boardsJson) }),
    id: row.id,
    version: row.version,
  };
}
function findTemplate(actor: Actor, id: string) {
  const row = getDb()
    .select()
    .from(schema.taskTemplates)
    .where(
      and(
        eq(schema.taskTemplates.id, key.parse(id)),
        eq(schema.taskTemplates.workspaceId, actor.workspaceId),
      ),
    )
    .get();
  if (!row) throw new UserError("Modelo não encontrado neste workspace.");
  return present(row);
}
export function listTaskTemplates(actor: Actor) {
  access(actor);
  return getDb()
    .select()
    .from(schema.taskTemplates)
    .where(eq(schema.taskTemplates.workspaceId, actor.workspaceId))
    .orderBy(asc(schema.taskTemplates.name))
    .all()
    .map(present);
}
export function saveProjectTemplate(
  actor: Actor,
  projectId: string | null,
  name: string,
) {
  access(actor, true);
  const project = projectId
    ? listTaskProjects(actor).find((p) => p.id === key.parse(projectId))
    : null;
  if (projectId && !project)
    throw new UserError("Projeto não encontrado neste workspace.");
  const input = taskTemplateSchema.parse({
    name,
    color: project?.color ?? "lavender",
    boards: boardsForProject(listTaskBoards(actor), projectId).map(
      ({ name, isDefault, columns }) => ({
        name,
        isDefault,
        columns,
        projectId: null,
      }),
    ),
  });
  const db = getDb();
  return db.transaction((tx) => {
    if (
      tx
        .select()
        .from(schema.taskTemplates)
        .where(
          and(
            eq(schema.taskTemplates.workspaceId, actor.workspaceId),
            eq(schema.taskTemplates.name, input.name),
          ),
        )
        .get()
    )
      throw new UserError("Já existe um modelo com esse nome.");
    const id = newId();
    tx.insert(schema.taskTemplates)
      .values({
        id,
        workspaceId: actor.workspaceId,
        name: input.name,
        color: input.color,
        boardsJson: JSON.stringify(input.boards),
      })
      .run();
    return id;
  });
}
export function createProjectFromTemplate(
  actor: Actor,
  raw: unknown,
  templateId: string,
) {
  access(actor, true);
  const input = projectInputSchema.parse(raw),
    template = findTemplate(actor, templateId);
  return getDb().transaction(() => {
    const projectId = saveTaskProject(actor, input);
    for (const board of template.boards)
      saveTaskBoard(actor, {
        ...board,
        projectId,
        columns: board.columns.map((c) => ({ ...c, id: newId() })),
      });
    return projectId;
  });
}
export function deleteTaskTemplate(actor: Actor, id: string, version: number) {
  access(actor, true);
  const template = findTemplate(actor, id);
  if (template.version !== version)
    throw new UserError("O modelo mudou. Atualize a página.");
  getDb()
    .delete(schema.taskTemplates)
    .where(
      and(
        eq(schema.taskTemplates.id, id),
        eq(schema.taskTemplates.workspaceId, actor.workspaceId),
      ),
    )
    .run();
}
