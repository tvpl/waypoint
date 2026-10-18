"use client";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localDate, type Task, type TaskProject } from "@/domain/tasks";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const at = (iso: string) => new Date(`${iso}T12:00:00`);
const addDays = (iso: string, n: number) => {
  const d = at(iso);
  d.setDate(d.getDate() + n);
  return localDate(d);
};

function Chip({ task, project, onOpen, draggable }: { task: Task; project?: TaskProject; onOpen: () => void; draggable: boolean }) {
  const done = task.status === "done";
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-wp-task", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      data-color={task.color === "neutral" ? (project?.color ?? "neutral") : task.color}
      title={`${task.title}${project ? ` · ${project.name}` : ""}`}
      className={cn(
        "wp-task-color flex w-full min-w-0 items-center gap-1 rounded-md border-0 px-1.5 py-0.5 text-left text-[11px] font-medium leading-4 transition-[filter] hover:brightness-95",
        done && "opacity-60 line-through",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", `wp-task-status-${task.status}`)} />
      <span className="truncate">{task.title}</span>
      {task.recurrence && <Repeat className="ml-auto size-2.5 shrink-0 opacity-70" />}
    </button>
  );
}

/** Month grid by due date: drag a task to another day (or from "Sem data") to change its date. */
export function TaskCalendar({
  tasks,
  projects,
  today,
  canEdit,
  onOpen,
  onMove,
  onCreate,
}: {
  tasks: Task[];
  projects: Map<string, TaskProject>;
  today: string;
  canEdit: boolean;
  onOpen: (task: Task) => void;
  onMove: (task: Task, dueDate: string | null) => void;
  onCreate: (dueDate: string) => void;
}) {
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [over, setOver] = useState<string | null>(null);
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) if (t.dueDate) map.set(t.dueDate, [...(map.get(t.dueDate) ?? []), t]);
    return map;
  }, [tasks]);
  const undated = tasks.filter((t) => !t.dueDate && t.status !== "done");
  const first = at(`${month}-01`);
  const start = addDays(`${month}-01`, -((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = days[35].slice(0, 7) === month ? 6 : 5;
  const shift = (n: number) => {
    const d = at(`${month}-01`);
    d.setMonth(d.getMonth() + n);
    setMonth(localDate(d).slice(0, 7));
  };
  const drop = (e: React.DragEvent, date: string | null) => {
    e.preventDefault();
    setOver(null);
    const task = tasks.find((t) => t.id === e.dataTransfer.getData("text/x-wp-task"));
    if (task && task.dueDate !== date) onMove(task, date);
  };
  const dropTarget = (key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!canEdit || !e.dataTransfer.types.includes("text/x-wp-task")) return;
      e.preventDefault();
      if (over !== key) setOver(key);
    },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
  });

  return (
    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start">
      <section className="min-w-0 flex-1 overflow-hidden rounded-card border border-line bg-surface shadow-rest" aria-label="Calendário de tarefas">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2">
          <h2 className="text-body font-semibold capitalize">{monthFmt.format(first)}</h2>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setMonth(today.slice(0, 7))}>
              Hoje
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Mês anterior" onClick={() => shift(-1)}>
              <ChevronLeft />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Próximo mês" onClick={() => shift(1)}>
              <ChevronRight />
            </Button>
          </div>
        </header>
        <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted">
          {WEEKDAYS.map((d) => (
            <span key={d} className="py-1.5">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.slice(0, weeks * 7).map((day) => {
            const list = byDay.get(day) ?? [];
            const outside = day.slice(0, 7) !== month;
            const isToday = day === today;
            return (
              <div
                key={day}
                role="gridcell"
                aria-label={`${dayFmt.format(at(day))}: ${list.length} tarefa(s)`}
                {...dropTarget(day)}
                onDrop={(e) => drop(e, day)}
                onDoubleClick={() => canEdit && onCreate(day)}
                className={cn(
                  "group/day relative flex min-h-[104px] min-w-0 flex-col gap-0.5 border-b border-r border-line p-1 transition-colors [&:nth-child(7n)]:border-r-0",
                  outside && "bg-surface-2/60",
                  over === day && "bg-accent-soft",
                )}
              >
                <div className="flex items-center justify-between px-0.5">
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-[11px] tabular-nums",
                      isToday ? "bg-accent font-semibold text-white" : outside ? "text-muted/70" : "text-ink-2",
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`Nova tarefa em ${dayFmt.format(at(day))}`}
                      onClick={() => onCreate(day)}
                      className="rounded p-0.5 text-muted opacity-0 transition-opacity hover:bg-hover hover:text-ink focus-visible:opacity-100 group-hover/day:opacity-100"
                    >
                      <Plus className="size-3" />
                    </button>
                  )}
                </div>
                {list.slice(0, 4).map((t) => (
                  <Chip key={t.id} task={t} project={t.projectId ? projects.get(t.projectId) : undefined} onOpen={() => onOpen(t)} draggable={canEdit} />
                ))}
                {list.length > 4 && <span className="px-1 text-[10px] text-muted">+{list.length - 4} mais</span>}
              </div>
            );
          })}
        </div>
      </section>
      <aside
        {...dropTarget("none")}
        onDrop={(e) => drop(e, null)}
        className={cn("flex w-full shrink-0 flex-col gap-1.5 rounded-card border border-line bg-surface p-3 shadow-rest transition-colors lg:w-56", over === "none" && "bg-accent-soft")}
        aria-label="Tarefas sem data"
      >
        <p className="text-caption font-semibold text-ink-2">Sem data · {undated.length}</p>
        <p className="text-[11px] leading-4 text-muted">Arraste para um dia para dar um prazo; arraste de volta para tirar.</p>
        <div className="scrollbar-thin flex max-h-[420px] flex-col gap-1 overflow-y-auto">
          {undated.map((t) => (
            <Chip key={t.id} task={t} project={t.projectId ? projects.get(t.projectId) : undefined} onOpen={() => onOpen(t)} draggable={canEdit} />
          ))}
        </div>
      </aside>
    </div>
  );
}

type Group = { key: string; title: string; tone?: "danger" | "accent"; tasks: Task[] };

/** "Agenda": a timeline of what's due — overdue, today, tomorrow, the coming days, later and undated. */
export function TaskAgenda({ tasks, today, renderCard }: { tasks: Task[]; today: string; renderCard: (task: Task) => ReactNode }) {
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  const groups: Group[] = [];
  const push = (key: string, title: string, task: Task, tone?: Group["tone"]) => {
    const g = groups.find((x) => x.key === key);
    if (g) g.tasks.push(task);
    else groups.push({ key, title, tone, tasks: [task] });
  };
  const sorted = [...tasks].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.sortOrder - b.sortOrder);
  for (const t of sorted) {
    const d = t.dueDate;
    if (!d) push("none", "Sem data", t);
    else if (d < today && t.status !== "done") push("late", "Atrasadas", t, "danger");
    else if (d < today) push(`past`, "Anteriores", t);
    else if (d === today) push("today", "Hoje", t, "accent");
    else if (d === tomorrow) push("tomorrow", "Amanhã", t);
    else if (d < weekEnd) push(d, dayFmt.format(at(d)), t);
    else push(`m:${d.slice(0, 7)}`, `Mais adiante · ${monthFmt.format(at(d))}`, t);
  }
  const order = (g: Group) => (g.key === "late" ? 0 : g.key === "past" ? 1 : g.key === "none" ? 9 : 2);
  groups.sort((a, b) => order(a) - order(b) || 0);
  return (
    <div className="flex flex-col gap-5" aria-label="Agenda de tarefas">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2 animate-in">
          <h2 className="sticky top-0 z-[1] flex items-center gap-2 bg-bg/95 py-1 text-caption font-semibold uppercase tracking-[.06em] backdrop-blur">
            <span className={cn("size-1.5 rounded-full", g.tone === "danger" ? "bg-danger" : g.tone === "accent" ? "bg-accent" : "bg-line-2")} />
            <span className={cn("first-letter:uppercase", g.tone === "danger" ? "text-danger" : g.tone === "accent" ? "text-accent-ink" : "text-muted")}>{g.title}</span>
            <span className="font-normal text-muted">{g.tasks.length}</span>
          </h2>
          <div className="space-y-2">{g.tasks.map(renderCard)}</div>
        </section>
      ))}
    </div>
  );
}
