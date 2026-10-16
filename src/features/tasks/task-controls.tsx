"use client";
import { useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CalendarOff,
  CircleCheck,
  CircleDashed,
  Clock3,
  ListChecks,
  Loader2,
  Pause,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  dateLabel,
  localDate,
  STATUS_LABELS,
  type Task,
  type TaskStatus,
} from "@/domain/tasks";
import { cn } from "@/lib/utils";
import { parseQuickTask } from "@/domain/task-capture";

const STATUS_ICONS = {
  todo: CircleDashed,
  doing: Clock3,
  waiting: Pause,
  done: CircleCheck,
};
export function StatusMark({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  const Icon = STATUS_ICONS[status];
  return (
    <span
      data-stage={status}
      className={cn(
        "wp-task-stage inline-flex size-6 shrink-0 items-center justify-center rounded-lg",
        className,
      )}
    >
      <Icon className="size-3.5" />
    </span>
  );
}
export function PeopleAvatars({ people }: { people: string[] }) {
  return (
    <span
      className="flex items-center -space-x-1.5"
      aria-label={`Pessoas de apoio: ${people.join(", ")}`}
      title={people.join(", ")}
    >
      {people.slice(0, 2).map((person, i) => (
        <span
          key={person}
          data-color={i === 0 ? "lavender" : "mint"}
          className="wp-task-color flex size-5 items-center justify-center rounded-full border border-surface text-[10px] font-semibold"
        >
          {person
            .trim()
            .split(/\s+/)
            .map((s) => s[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </span>
      ))}
      {people.length > 2 && (
        <span className="flex size-6 items-center justify-center rounded-full border-2 border-surface bg-subtle text-[9px] text-muted">
          +{people.length - 2}
        </span>
      )}
    </span>
  );
}
export function TaskDate({
  date,
  today,
  complete,
  disabled,
  onChange,
  allowClear = false,
}: {
  allowClear?: boolean;
  date: string | null;
  today: string;
  complete?: boolean;
  disabled: boolean;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const overdue = !!date && !complete && date < today;
  const nextDate = (days: number) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + days);
    return localDate(d);
  };
  const choose = (value: string | null) => {
    onChange(value);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={date ? `Alterar data: ${date}` : "Definir data"}
          className={cn(
            "inline-flex min-h-7 items-center gap-1.5 rounded-md px-1.5 text-[11px] transition-colors hover:bg-surface/70",
            overdue
              ? "text-danger"
              : date === today && !complete
                ? "text-accent-ink"
                : "text-muted",
            !date && "wp-task-date-empty",
          )}
        >
          <CalendarDays className="size-3.5" />
          {date ? (
            date === today ? (
              "Hoje"
            ) : (
              dateLabel(date)
            )
          ) : (
            <span className={allowClear ? "" : "sr-only"}>Data</span>
          )}
          {overdue && <span className="size-1 rounded-full bg-current" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 p-3">
        <p className="px-1 text-xs font-semibold">
          Quando precisa ficar pronto?
        </p>
        <div className="space-y-0.5">
          {[
            { label: "Hoje", date: today },
            { label: "Amanhã", date: nextDate(1) },
            { label: "Daqui a uma semana", date: nextDate(7) },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => choose(item.date)}
              className="flex min-h-9 w-full items-center justify-between rounded-lg px-2 text-body hover:bg-hover"
            >
              <span>{item.label}</span>
              <span className="text-xs text-muted">{dateLabel(item.date)}</span>
            </button>
          ))}
        </div>
        <Input
          type="date"
          aria-label="Escolher data da tarefa"
          value={date ?? ""}
          onChange={(e) => choose(e.target.value || null)}
        />
        {(date || allowClear) && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted"
            onClick={() => choose(null)}
          >
            <CalendarOff />
            Remover data
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
export function CardSubtasks({
  task,
  disabled,
  onChange,
}: {
  task: Task;
  disabled: boolean;
  onChange: (subtasks: Task["subtasks"]) => void;
}) {
  const done = task.subtasks.filter((s) => s.done).length;
  const [newTitle, setNewTitle] = useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`Subtarefas de ${task.title}`}
          className={cn(
            "inline-flex min-h-7 items-center gap-1.5 rounded-md px-1.5 text-[11px] hover:bg-surface/70",
            done === task.subtasks.length ? "text-success-ink" : "text-muted",
          )}
        >
          <ListChecks className="size-3.5" />
          <span>
            {done}/{task.subtasks.length}
          </span>
          <span className="sr-only">
            <span
              className="block h-full rounded-full bg-current"
              style={{ width: `${(done / task.subtasks.length) * 100}%` }}
            />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(340px,calc(100vw-32px))] p-3"
      >
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-sm font-semibold">Próximos passos</p>
          <span className="text-xs tabular-nums text-muted">
            {done}/{task.subtasks.length}
          </span>
        </div>
        <div className="scrollbar-thin max-h-64 space-y-1 overflow-y-auto">
          {task.subtasks.map((s) => (
            <label
              key={s.id}
              className="flex min-h-10 cursor-pointer items-start gap-2.5 rounded-lg p-2 hover:bg-hover"
            >
              <input
                type="checkbox"
                disabled={disabled}
                className="mt-0.5 size-4 shrink-0 accent-accent"
                checked={s.done}
                aria-label={`Concluir ${s.title}`}
                onChange={(e) =>
                  onChange(
                    task.subtasks.map((item) =>
                      item.id === s.id
                        ? { ...item, done: e.target.checked }
                        : item,
                    ),
                  )
                }
              />
              <span
                className={cn(
                  "break-words text-body leading-5",
                  s.done && "text-muted line-through",
                )}
              >
                {s.title}
              </span>
            </label>
          ))}
        </div>
        {!disabled && task.subtasks.length < 100 && (
          <form
            className="mt-2 flex gap-1 border-t border-line pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTitle.trim()) return;
              onChange([
                ...task.subtasks,
                {
                  id: crypto.randomUUID(),
                  title: newTitle.trim(),
                  done: false,
                },
              ]);
              setNewTitle("");
            }}
          >
            <Input
              aria-label="Adicionar passo no card"
              placeholder="Mais um pequeno passo…"
              value={newTitle}
              maxLength={300}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-8 text-body"
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              aria-label="Adicionar passo"
              disabled={!newTitle.trim()}
            >
              <Plus />
            </Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}
export function QuickTask({
  status,
  busy,
  onCreate,
  onExpand,
  onClose,
}: {
  status: TaskStatus;
  busy: boolean;
  onCreate: (title: string) => Promise<boolean>;
  onExpand: (title: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  let parsed: ReturnType<typeof parseQuickTask> | null = null;
  try {
    parsed = parseQuickTask(title);
  } catch {}
  return (
    <form
      aria-label={`Criação rápida em ${STATUS_LABELS[status]}`}
      className="wp-task-quick rounded-card border border-accent-line bg-surface p-3 shadow-float"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || busy) return;
        if (await onCreate(title.trim())) {
          setTitle("");
          requestAnimationFrame(() => input.current?.focus());
        }
      }}
    >
      <Textarea
        ref={input}
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={20000}
        rows={2}
        aria-label="Nome da tarefa rápida"
        placeholder="Revisar proposta #cliente @Ana amanhã !alta"
        disabled={busy}
        className="min-h-16 resize-y border-0 bg-transparent px-1 text-xs focus:ring-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      {parsed &&
        (parsed.tags.length > 0 ||
          parsed.people.length > 0 ||
          parsed.dueDate ||
          parsed.priority !== "none" ||
          parsed.subtasks.length > 0) && (
          <div
            className="mt-1 flex flex-wrap gap-1 text-[11px] text-accent-ink"
            aria-live="polite"
          >
            {parsed.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
            {parsed.people.map((person) => (
              <span key={person}>@{person}</span>
            ))}
            {parsed.dueDate && <span>· {dateLabel(parsed.dueDate)}</span>}
            {parsed.priority !== "none" && (
              <span>
                · Prioridade{" "}
                {parsed.priority === "high"
                  ? "alta"
                  : parsed.priority === "medium"
                    ? "média"
                    : "baixa"}
              </span>
            )}
            {parsed.subtasks.length > 0 && (
              <span>· {parsed.subtasks.length} subtarefas</span>
            )}
          </div>
        )}
      <p className="mt-2 text-[10px] leading-4 text-muted">
        Enter adiciona · Shift+Enter quebra linha · cole checklists Markdown
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={busy || !title.trim()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}Adicionar
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Abrir editor completo"
          title="Mais detalhes"
          disabled={busy}
          onClick={() => onExpand(title)}
        >
          <ArrowUpRight />
        </Button>
        <Button
          className="ml-auto"
          size="icon-sm"
          variant="ghost"
          aria-label="Fechar criação rápida"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
    </form>
  );
}
