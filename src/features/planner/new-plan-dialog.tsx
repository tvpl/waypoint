"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PlanThumb } from "@/components/plan-thumb";
import { createPlanAction } from "@/app/(app)/plans/actions";
import { planThumb } from "@/domain/plan-thumb";
import { cn } from "@/lib/utils";
import { STARTER_TEMPLATES } from "./starter-templates";

/** "Novo plan": pick a starting point (blank or a ready-made structure) and a name. */
export function NewPlanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pick, setPick] = React.useState("blank");
  const [title, setTitle] = React.useState("");
  const [pending, start] = React.useTransition();
  const thumbs = React.useMemo(() => Object.fromEntries(STARTER_TEMPLATES.map((t) => [t.id, planThumb(t.build())])), []);

  React.useEffect(() => {
    if (open) {
      setPick("blank");
      setTitle("");
    }
  }, [open]);

  const create = (starter = pick) =>
    start(async () => {
      try {
        const id = await createPlanAction({ starter, title });
        router.push(`/plans/${id}/edit`);
      } catch {
        toast.error("Não foi possível criar o plan.");
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent title="Novo plan" description="Comece em branco ou a partir de uma estrutura pronta — tudo continua editável." className="max-w-[860px]">
        <DialogBody className="gap-5">
          <div role="radiogroup" aria-label="Ponto de partida" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {STARTER_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={pick === t.id}
                onClick={() => setPick(t.id)}
                onDoubleClick={() => create(t.id)}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-card border bg-surface text-left transition-[box-shadow,transform,border-color] hover:-translate-y-px hover:shadow-raise",
                  pick === t.id ? "border-accent ring-2 ring-accent/25" : "border-line",
                )}
              >
                {t.id === "blank" ? (
                  <div className="dot-grid flex h-[96px] items-center justify-center border-b border-line">
                    <Plus className="size-6 text-muted" aria-hidden />
                  </div>
                ) : (
                  <PlanThumb thumb={thumbs[t.id]} height={96} />
                )}
                <span className="flex flex-col gap-0.5 px-3.5 py-3">
                  <span className="text-body font-semibold">{t.title}</span>
                  <span className="line-clamp-2 text-caption leading-4 text-muted">{t.description}</span>
                </span>
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-body font-medium">Nome</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={pick === "blank" ? "Plan sem título" : STARTER_TEMPLATES.find((t) => t.id === pick)?.title}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
          </label>
        </DialogBody>
        <DialogFooter className="justify-between">
          <span className="text-caption text-muted">Dica: clique duas vezes num modelo para criar direto.</span>
          <Button variant="primary" disabled={pending} onClick={() => create()}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Criar plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Opens the "Novo plan" dialog. */
export function NewPlanButton({ disabled, variant }: { disabled?: boolean; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        <Plus /> Novo plan
      </Button>
      <NewPlanDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
