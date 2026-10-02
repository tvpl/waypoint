import { canEditWorkspace, requireWorkspace } from "@/server/services/workspaces";
import { listTags } from "@/server/services/tags";
import { TagGrid } from "@/features/tags/tag-grid";

export const metadata = { title: "Tags" };

export default async function TagsPage() {
  const ctx = await requireWorkspace();
  const tags = listTags(ctx.workspace.id).filter((t) => t.links + t.plans > 0 || canEditWorkspace(ctx.role));
  return (
    <main className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-6 pb-16 pt-10 sm:px-10">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[44px] leading-none">Tags</h1>
          <p className="text-[15px] text-muted">Temas compartilhados entre Planner e Links — uma ponte natural entre os dois.</p>
        </div>
        <TagGrid tags={tags} canEdit={canEditWorkspace(ctx.role)} />
      </div>
    </main>
  );
}
