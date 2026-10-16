import type { Metadata } from "next";
import {
  canEditWorkspace,
  listMembers,
  requireWorkspace,
} from "@/server/services/workspaces";
import {
  listTaskBoards,
  listTaskProjects,
  listTasks,
} from "@/server/services/tasks";
import { TaskWorkspace } from "@/features/tasks/task-workspace";
import { listTaskTemplates } from "@/server/services/task-templates";
import { listTaskReminders } from "@/server/services/task-reminders";

export const metadata: Metadata = { title: "Tarefas" };
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireWorkspace();
  const params = await searchParams;
  const actor = { workspaceId: ctx.workspace.id, userId: ctx.user.id };
  return (
    <TaskWorkspace
      key={ctx.workspace.id}
      tasks={listTasks(actor)}
      projects={listTaskProjects(actor)}
      boards={listTaskBoards(actor)}
      templates={listTaskTemplates(actor)}
      reminders={listTaskReminders(actor)}
      preferenceKey={`wp-tasks:${ctx.workspace.id}:${ctx.user.id}`}
      members={listMembers(ctx.workspace.id).map((m) => m.name)}
      canEdit={canEditWorkspace(ctx.role)}
      workspaceName={ctx.workspace.name}
      openId={typeof params.open === "string" ? params.open : null}
    />
  );
}
