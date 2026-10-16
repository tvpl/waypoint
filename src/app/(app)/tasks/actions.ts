"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireWorkspace, UserError } from "@/server/services/workspaces";
import {
  archiveTask,
  changeTasks,
  createTask,
  deleteTaskProject,
  importTasks,
  moveTask,
  saveTaskProject,
  saveTaskBoard,
  updateTask,
  previewTaskUpdates,
  applyTaskUpdates,
} from "@/server/services/tasks";
import type { TaskStatus } from "@/domain/tasks";
import {
  scheduleTaskReminders,
  changeTaskReminder,
  changeTaskReminders,
  listTaskReminders,
} from "@/server/services/task-reminders";
import type { TaskDestination } from "@/domain/task-board";
import {
  createProjectFromTemplate,
  saveProjectTemplate,
  deleteTaskTemplate,
} from "@/server/services/task-templates";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
async function run<T>(
  fn: (actor: { workspaceId: string; userId: string }) => T,
  mutate = true,
): Promise<Result<T>> {
  try {
    const ctx = await requireWorkspace();
    const data = fn({ workspaceId: ctx.workspace.id, userId: ctx.user.id });
    if (mutate) revalidatePath("/tasks");
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError)
      return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos." };
    console.error("[tasks]", e);
    return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  }
}
export async function saveTaskAction(
  input: unknown,
  id?: string,
  version?: number,
) {
  return run((actor) =>
    id ? updateTask(actor, id, version ?? 0, input) : createTask(actor, input),
  );
}
export async function archiveTaskAction(
  id: string,
  version: number,
  archived: boolean,
) {
  return run((actor) =>
    archiveTask(actor, id, version, z.boolean().parse(archived)),
  );
}
export async function moveTaskAction(
  id: string,
  version: number,
  status: TaskStatus,
  beforeId: string | null,
  destination?: TaskDestination,
) {
  return run((actor) =>
    moveTask(actor, id, version, status, beforeId, destination),
  );
}
export async function saveBoardAction(
  input: unknown,
  id?: string,
  version?: number,
) {
  return run((actor) => saveTaskBoard(actor, input, id, version));
}
export async function saveProjectAction(
  input: unknown,
  id?: string,
  templateId?: string,
) {
  return run((actor) =>
    !id && templateId
      ? createProjectFromTemplate(actor, input, templateId)
      : saveTaskProject(actor, input, id),
  );
}
export async function saveTemplateAction(
  projectId: string | null,
  name: string,
) {
  return run((actor) => saveProjectTemplate(actor, projectId, name));
}
export async function deleteTemplateAction(id: string, version: number) {
  return run((actor) => deleteTaskTemplate(actor, id, version));
}
export async function previewTaskUpdatesAction(text: string) {
  return run((actor) => previewTaskUpdates(actor, text), false);
}
export async function applyTaskUpdatesAction(
  text: string,
  token: string,
  selection: unknown,
) {
  return run((actor) => applyTaskUpdates(actor, text, token, selection));
}
export async function deleteProjectAction(id: string) {
  return run((actor) => deleteTaskProject(actor, id));
}
export async function importTasksAction(markdown: string) {
  return run((actor) =>
    importTasks(actor, z.string().max(250000).parse(markdown)),
  );
}

export async function changeTasksAction(targets: unknown, change: unknown) {
  return run((actor) => changeTasks(actor, targets, change));
}

export async function scheduleRemindersAction(
  targets: unknown,
  input: unknown,
) {
  return run((actor) => scheduleTaskReminders(actor, targets, input));
}
export async function listRemindersAction() {
  return run((actor) => listTaskReminders(actor), false);
}
export async function changeRemindersAction(
  selection: unknown,
  action: "dismiss" | "snooze",
  until?: number,
  delayMinutes?: number,
) {
  return run((actor) =>
    changeTaskReminders(
      actor,
      selection,
      action,
      until,
      Date.now(),
      delayMinutes,
    ),
  );
}
export async function changeReminderAction(
  id: string,
  version: number,
  action: "dismiss" | "snooze",
  until?: number,
) {
  return run((actor) => changeTaskReminder(actor, id, version, action, until));
}
