import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, FileBarChart2 } from "lucide-react";
import type { WeeklyReview } from "@/server/services/dashboard";
import { cn } from "@/lib/utils";

/** "Sua semana": completions per day (one series, so no legend), versus last week and per project. */
export function WeekReview({ review }: { review: WeeklyReview }) {
  const max = Math.max(1, ...review.days.map((d) => d.completed));
  const delta = review.completed - review.lastWeek;
  const top = Math.max(1, ...review.projects.map((p) => p.completed));
  return (
    <section className="grid gap-5 rounded-card border border-line bg-surface p-5 shadow-rest md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" aria-label="Sua semana" data-tour="home-week">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-body font-semibold text-ink-2">Sua semana</h2>
            <p className="flex items-baseline gap-2">
              <span className="text-display-sm font-semibold tabular-nums leading-none tracking-tight">{review.completed}</span>
              <span className="text-body text-muted">{review.completed === 1 ? "tarefa concluída" : "tarefas concluídas"}</span>
            </p>
            <p className={cn("inline-flex items-center gap-1 text-caption", delta > 0 ? "text-success-ink" : delta < 0 ? "text-muted" : "text-muted")}>
              {delta > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : delta < 0 ? <ArrowDownRight className="size-3.5" aria-hidden /> : null}
              {delta === 0 ? `Igual à semana passada (${review.lastWeek})` : `${Math.abs(delta)} ${delta > 0 ? "a mais" : "a menos"} que na semana passada (${review.lastWeek})`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5 text-right text-caption text-muted">
            <span>
              <b className="font-semibold tabular-nums text-ink">{review.created}</b> criadas
            </span>
            <span>
              <b className="font-semibold tabular-nums text-ink">{review.open}</b> em aberto
            </span>
          </div>
        </div>
        <ol className="flex h-24 items-end gap-[2px]" aria-label="Concluídas por dia">
          {review.days.map((d) => (
            <li key={d.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${d.completed} concluída(s)`}>
              <span className="text-[10px] tabular-nums text-muted opacity-0 transition-opacity group-hover:opacity-100">{d.completed}</span>
              <span
                aria-label={`${d.label}: ${d.completed}`}
                className={cn("w-full max-w-9 rounded-t-[4px] transition-[height] duration-500", d.future ? "bg-subtle" : d.completed ? "bg-accent" : "bg-line-2")}
                style={{ height: d.completed ? `${Math.max(8, (d.completed / max) * 72)}px` : "3px" }}
              />
              <span className="text-[10px] uppercase tracking-wide text-muted">{d.label}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-3 md:border-l md:border-line md:pl-5">
        <h3 className="text-caption font-medium uppercase tracking-[.06em] text-muted">Por projeto</h3>
        {review.projects.length ? (
          <ul className="flex flex-col gap-2.5">
            {review.projects.map((p) => (
              <li key={p.name} className="flex flex-col gap-1">
                <span className="flex items-center justify-between gap-2 text-body">
                  <span className="flex min-w-0 items-center gap-2">
                    <span data-color={p.color ?? undefined} className="wp-task-color size-2 shrink-0 rounded-full border-0" />
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="tabular-nums text-muted">{p.completed}</span>
                </span>
                <span className="h-1 overflow-hidden rounded-full bg-subtle">
                  <span className="block h-full rounded-full bg-accent/70" style={{ width: `${(p.completed / top) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body leading-5 text-muted">Nada concluído ainda esta semana. Que tal começar pelo que está em Para hoje?</p>
        )}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1 text-caption">
          <Link href="/tasks?report=1&period=this-week" className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
            <FileBarChart2 className="size-3.5" /> Relatório da semana
          </Link>
          <Link href="/tasks?report=1&period=last-week" className="inline-flex items-center gap-1 text-accent-ink hover:underline">
            Semana passada <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}
