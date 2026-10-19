import { canEditWorkspace, requireWorkspace } from "@/server/services/workspaces";
import { listTags } from "@/server/services/tags";
import { syncTaskTags, taskTagCounts } from "@/server/services/task-tags";
import { TagGrid } from "@/features/tags/tag-grid";

export const metadata = { title: "Tags" };

export default async function TagsPage() {
  const ctx = await requireWorkspace();
  syncTaskTags(ctx.workspace.id);
  const taskCounts = taskTagCounts(ctx.workspace.id);
  const tags = listTags(ctx.workspace.id, ctx.user.id)
    .map((t) => ({ ...t, tasks: taskCounts.get(t.name) ?? 0 }))
    .filter((t) => t.links + t.plans + t.tasks > 0 || canEditWorkspace(ctx.role));
  return (
    <main className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-6 pb-16 pt-10 sm:px-10">
        <div data-tour="tags-header" className="flex flex-col gap-2">
          <h1 className="font-display font-semibold text-display-sm leading-[1.05] tracking-[-0.025em] sm:text-display">Tags</h1>
          <p className="text-lead text-muted">Temas compartilhados entre Planner, Links e Tarefas — uma ponte natural entre os três.</p>
        </div>
        <TagGrid tags={tags} canEdit={canEditWorkspace(ctx.role)} />
      </div>
    </main>
  );
}
