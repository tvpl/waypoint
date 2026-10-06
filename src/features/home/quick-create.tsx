"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Loader2, Plus } from "lucide-react";
import { PlanThumb } from "@/components/plan-thumb";
import { createPlanAction } from "@/app/(app)/plans/actions";
import { planThumb } from "@/domain/plan-thumb";
import { NewPlanDialog } from "@/features/planner/new-plan-dialog";
import { STARTER_TEMPLATES } from "@/features/planner/starter-templates";
import { cn } from "@/lib/utils";

const PICKS = ["blank", "architecture", "roadmap", "decision", "kanban"];

const tile =
  "group flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface text-left transition-[box-shadow,transform,border-color] hover:-translate-y-px hover:border-line-2 hover:shadow-raise focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

/** "Criar": a new plan from a starting point in one click, or a link. */
export function QuickCreate({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [more, setMore] = React.useState(false);
  const templates = React.useMemo(() => PICKS.map((id) => STARTER_TEMPLATES.find((t) => t.id === id)!).filter(Boolean), []);
  const thumbs = React.useMemo(() => Object.fromEntries(templates.filter((t) => t.id !== "blank").map((t) => [t.id, planThumb(t.build())])), [templates]);

  const create = async (starter: string) => {
    if (busy) return;
    setBusy(starter);
    try {
      const id = await createPlanAction({ starter });
      router.push(`/plans/${id}/edit`);
    } catch {
      toast.error("Não foi possível criar o plan.");
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Criar">
      <div className="flex items-center justify-between">
        <h2 className="text-body font-semibold text-ink-2">Criar</h2>
        {canCreate && (
          <button type="button" className="text-body text-accent-ink hover:underline" onClick={() => setMore(true)}>
            Todos os modelos
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {canCreate &&
          templates.map((t) => (
            <button key={t.id} type="button" className={tile} onClick={() => void create(t.id)} disabled={!!busy} aria-label={t.id === "blank" ? "Novo diagrama em branco" : `Novo plan: ${t.title}`}>
              <div className={cn("relative h-[72px] border-b border-line", t.id === "blank" ? "dot-grid flex items-center justify-center" : "bg-surface-2")}>
                {t.id === "blank" ? <Plus className="size-5 text-muted transition-colors group-hover:text-accent-ink" aria-hidden /> : <PlanThumb thumb={thumbs[t.id]} height={72} />}
                {busy === t.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
                    <Loader2 className="size-4 animate-spin text-muted" aria-label="Criando" />
                  </span>
                )}
              </div>
              <span className="truncate px-3 py-2.5 text-body font-medium">{t.id === "blank" ? "Em branco" : t.title}</span>
            </button>
          ))}
        <Link href="/links?add=1" className={tile}>
          <div className="flex h-[72px] items-center justify-center border-b border-line bg-accent-soft/50">
            <Link2 className="size-5 text-accent-ink" aria-hidden />
          </div>
          <span className="truncate px-3 py-2.5 text-body font-medium">Salvar link</span>
        </Link>
      </div>
      <NewPlanDialog open={more} onClose={() => setMore(false)} />
    </section>
  );
}
