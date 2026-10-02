import type { Metadata } from "next";
import { canEditWorkspace, requireWorkspace } from "@/server/services/workspaces";
import { listPlans } from "@/server/services/plans";
import { ImportPlanButton, NewPlanButton, PlansList, type PlanCardData, type PlanFilter } from "@/features/planner/plans-list";

export const metadata: Metadata = { title: "Plans" };

const FILTERS: PlanFilter[] = ["mine", "shared", "templates", "archived"];

export default async function PlansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const raw = Array.isArray(sp.f) ? sp.f[0] : sp.f;
  const filter: PlanFilter = raw && (FILTERS as string[]).includes(raw) ? (raw as PlanFilter) : "mine";
  const canCreate = canEditWorkspace(ctx.role);

  const plans: PlanCardData[] = listPlans(ctx.user.id, ctx.workspace.id, filter).map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    updatedAt: p.updatedAt.getTime(),
    publishedVersion: p.publishedVersion,
    access: p.access ?? "viewer",
    isTemplate: p.isTemplate,
    archived: p.archivedAt != null,
    thumbnail: p.thumbnail,
    tags: p.tags,
  }));

  return (
    <main className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-6 pb-16 pt-12 sm:px-12 sm:pt-14">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-2.5">
            <h1 className="font-display font-normal text-display-sm leading-[1.05] tracking-[-0.01em] sm:text-display">
              Plans<span className="text-accent">.</span>
            </h1>
            <p className="text-lead text-muted">Mapas, arquiteturas e roadmaps de {ctx.workspace.name} — cada bloco ligado ao que importa.</p>
          </div>
          {canCreate && (
            <div className="flex flex-wrap gap-2">
              <ImportPlanButton />
              <NewPlanButton variant="primary" />
            </div>
          )}
        </header>
        <PlansList filter={filter} plans={plans} canCreate={canCreate} />
      </div>
    </main>
  );
}
