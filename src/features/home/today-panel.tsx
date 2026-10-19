"use client";
import * as React from "react";
import Link from "next/link";
import { Check, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { saveTaskAction } from "@/app/(app)/tasks/actions";
import type { TodayTask } from "@/server/services/dashboard";
import { dateLabel } from "@/domain/tasks";
import { cn } from "@/lib/utils";

const REASON = {
  overdue: { label: "Atrasada", cls: "bg-danger-soft text-danger" },
  today: { label: "Hoje", cls: "bg-accent-soft text-accent-ink" },
  followup: { label: "Retorno", cls: "bg-amber-bg text-amber-ink" },
} as const;

/** "Para hoje": open tasks due today or overdue, and follow-ups; check them off right here. */
export function TodayPanel({ items: initial, total, canEdit }: { items: TodayTask[]; total: number; canEdit: boolean }) {
  const [items, setItems] = React.useState(initial);
  const [done, setDone] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setItems(initial), [initial]);
  const complete = (t: TodayTask) => {
    setDone((s) => new Set(s).add(t.id));
    saveTaskAction({ status: "done" }, t.id, t.version)
      .then((r) => {
        if (!r.ok) {
          toast.error(r.error);
          setDone((s) => {
            const n = new Set(s);
            n.delete(t.id);
            return n;
          });
          return;
        }
        toast.success("Tarefa concluída. Bom trabalho!");
        setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), 500);
      })
      .catch(() => toast.error("Não foi possível conectar."));
  };
  if (!items.length)
    return (
      <p className="flex flex-1 items-center gap-2 px-4 py-6 text-body text-muted">
        <PartyPopper className="size-4 shrink-0 text-success-ink" /> Nada pendente para hoje. Aproveite para adiantar algo!
      </p>
    );
  return (
    <ul className="flex flex-col py-1">
      {items.map((t) => {
        const checked = done.has(t.id);
        return (
          <li key={t.id} className={cn("flex items-center gap-3 px-4 py-2 transition-opacity duration-500", checked && "opacity-50")}>
            <button
              type="button"
              disabled={!canEdit || checked}
              onClick={() => complete(t)}
              aria-label={`Concluir ${t.title}`}
              className={cn(
                "flex size-[18px] shrink-0 items-center justify-center rounded-md border transition-colors",
                checked ? "border-transparent bg-success-ink text-white" : "border-line-2 hover:border-success-ink hover:bg-success-bg",
              )}
            >
              {checked && <Check className="size-3" />}
            </button>
            <Link href={`/tasks?open=${t.id}`} className="flex min-w-0 flex-1 flex-col hover:underline-offset-2">
              <span className={cn("truncate text-body font-medium", checked && "line-through")}>{t.title}</span>
              <span className="truncate text-caption text-muted">
                {[t.projectName, t.reason === "followup" ? t.followUpDate && `retorno ${dateLabel(t.followUpDate)}` : t.dueDate && dateLabel(t.dueDate)].filter(Boolean).join(" · ")}
              </span>
            </Link>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold", REASON[t.reason].cls)}>{REASON[t.reason].label}</span>
          </li>
        );
      })}
      {total > items.length && <li className="px-4 py-1.5 text-caption text-muted">e mais {total - items.length}…</li>}
    </ul>
  );
}
