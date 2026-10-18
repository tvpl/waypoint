import { canEditWorkspace, requireWorkspace } from "@/server/services/workspaces";
import { listTrash } from "@/server/services/trash";
import { TrashView } from "@/features/trash/trash-view";
import { TRASH_RETENTION_DAYS } from "@/features/trash/types";

export const metadata = { title: "Lixeira" };

export default async function TrashPage() {
  const ctx = await requireWorkspace();
  // listTrash only returns what this person may restore (plans they own; library items for editors).
  const items = listTrash({ workspaceId: ctx.workspace.id, userId: ctx.user.id });
  return (
    <main className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-8 px-6 pb-16 pt-10 sm:px-10">
        <div className="flex flex-col gap-2">
          <h1 className="font-display font-semibold text-display-sm leading-[1.05] tracking-[-0.025em] sm:text-display">Lixeira</h1>
          <p className="text-lead text-muted">
            Plans, coleções e links excluídos ficam aqui por {TRASH_RETENTION_DAYS} dias. Depois disso, são apagados de vez.
          </p>
        </div>
        <TrashView initial={items} canEditLibrary={canEditWorkspace(ctx.role)} />
      </div>
    </main>
  );
}
