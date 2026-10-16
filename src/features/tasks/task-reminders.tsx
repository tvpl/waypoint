"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  Bell,
  BellOff,
  CalendarClock,
  Check,
  CheckCheck,
  Clock3,
  Plus,
  Pencil,
  Play,
  Flag,
  MessageCircle,
  Search,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import {
  changeReminderAction,
  changeRemindersAction,
  listRemindersAction,
  scheduleRemindersAction,
} from "@/app/(app)/tasks/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Input, selectClass } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  REMINDER_CHANNELS,
  REMINDER_KINDS,
  REMINDER_LABELS,
  SNOOZE_OPTIONS,
  formatReminderTime,
  localReminderTimestamp,
  type ReminderInput,
  type TaskReminder,
} from "@/domain/task-reminders";
import { fold, localDate, type Task, type TaskProject } from "@/domain/tasks";
import { taskPlacement, type TaskBoard } from "@/domain/task-board";
import { useDesktop } from "@/lib/desktop";
import { cn } from "@/lib/utils";

const duration = (minutes: number) =>
  minutes === 1440
    ? "1 dia"
    : minutes >= 60
      ? `${minutes / 60} h`
      : `${minutes} min`;
type SnoozeValue = { until: number } | { minutes: number };
function Snooze({
  reminder,
  busy,
  onChange,
}: {
  reminder: Pick<TaskReminder, "id" | "title"> & { nextAt?: number };
  busy: boolean;
  onChange: (value: SnoozeValue) => void;
}) {
  const [open, setOpen] = useState(false),
    [custom, setCustom] = useState("");
  const apply = (value: SnoozeValue) => {
    onChange(value);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label={`Adiar lembrete de ${reminder.title}`}
          title="Adiar"
        >
          <Clock3 />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <p className="text-sm font-medium">Lembrar novamente</p>
        <div className="grid grid-cols-3 gap-1.5">
          {SNOOZE_OPTIONS.map((v) => (
            <Button key={v} size="sm" onClick={() => apply({ minutes: v })}>
              {duration(v)}
            </Button>
          ))}
        </div>
        <Field label="Adiar até" htmlFor={`snooze-${reminder.id}`}>
          <Input
            id={`snooze-${reminder.id}`}
            type="datetime-local"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </Field>
        <Button
          className="w-full"
          size="sm"
          disabled={
            !custom ||
            new Date(custom).valueOf() <=
              Math.max(Date.now(), reminder.nextAt ?? 0)
          }
          onClick={() => apply({ until: new Date(custom).valueOf() })}
        >
          Confirmar adiamento
        </Button>
        <p className="text-[11px] text-muted">
          Os intervalos contam a partir do aviso atual ou de agora, se ele já
          venceu. Para antecipar, use Reagendar.
        </p>
      </PopoverContent>
    </Popover>
  );
}

export type ReminderLaunch = {
  taskId?: string;
  target?: string;
  compose?: boolean;
};
export function TaskReminders({
  tasks,
  projects,
  boards,
  reminders: source,
  selectedIds,
  visibleIds,
  initial,
  onClose,
  onOpenTask,
  onChanged,
}: {
  tasks: Task[];
  projects: TaskProject[];
  boards: TaskBoard[];
  reminders: TaskReminder[];
  selectedIds: string[];
  visibleIds: string[];
  initial: ReminderLaunch;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onChanged: (reminders: TaskReminder[]) => void;
}) {
  const desktop = useDesktop();
  const [reminders, setReminders] = useState(source),
    [compose, setCompose] = useState(initial.compose ?? false);
  const [busy, start] = useTransition(),
    [testing, setTesting] = useState(false);
  const [tab, setTab] = useState<"all" | "now" | "scheduled">("all"),
    [query, setQuery] = useState("");
  const [error, setError] = useState(""),
    [now, setNow] = useState(Date.now);
  const [selecting, setSelecting] = useState(false),
    [selection, setSelection] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(
    initial.taskId
      ? `task:${initial.taskId}`
      : (initial.target ?? (selectedIds.length ? "selection" : "visible")),
  );
  const first = tasks.find((t) => t.id === initial.taskId);
  const [kind, setKind] = useState<ReminderInput["kind"]>("finish");
  const [dateOnly, setDateOnly] = useState(false);
  const [day, setDay] = useState(() =>
    first?.dueDate && first.dueDate > localDate()
      ? first.dueDate
      : localDate(new Date(Date.now() + 86400_000)),
  );
  const [time, setTime] = useState("09:00"),
    [lead, setLead] = useState<ReminderInput["leadMinutes"]>(0);
  const [channel, setChannel] = useState<ReminderInput["channel"]>("sound"),
    [snooze, setSnooze] = useState(15);
  const request = useRef(0);
  const update = (value: TaskReminder[]) => {
    setReminders(value);
    onChanged(value);
  };
  const refresh = async () => {
    const token = ++request.current;
    try {
      const result = await listRemindersAction();
      if (token === request.current && result.ok) update(result.data);
    } catch {
      /* A temporary offline refresh does not discard the current inbox. */
    }
  };
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 30_000);
    return () => {
      clearInterval(timer);
      request.current++;
    };
    // Refresh belongs to this dialog instance, not to each parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const change = (
    reminder: TaskReminder,
    action: "dismiss" | "snooze",
    until?: number,
  ) =>
    start(async () => {
      setError("");
      try {
        const result = await changeReminderAction(
          reminder.id,
          reminder.version,
          action,
          until,
        );
        if (!result.ok) {
          setError(result.error);
          await refresh();
          return;
        }
        await refresh();
        void desktop?.notifications?.("refresh");
        toast.success(
          action === "snooze" ? "Lembrete adiado." : "Lembrete dispensado.",
        );
      } catch {
        setError("Não foi possível atualizar o lembrete. Tente novamente.");
      }
    });
  const active = tasks.filter((t) => !t.archivedAt && t.status !== "done");
  const matched = active.filter((t) =>
    target === "visible"
      ? visibleIds.includes(t.id)
      : target === "selection"
        ? selectedIds.includes(t.id)
        : target.startsWith("task:")
          ? t.id === target.slice(5)
          : target.startsWith("project:")
            ? (t.projectId ?? "none") === target.slice(8)
            : target.startsWith("block:")
              ? taskPlacement(t, boards).board.id === target.slice(6)
              : false,
  );
  const targets = matched.filter(
    (t) => kind !== "start" || t.status !== "doing",
  );
  const replacements = reminders.filter(
    (r) => r.kind === kind && targets.some((t) => t.id === r.taskId),
  ).length;
  const scoped = reminders.filter(
    (r) => !initial.taskId || r.taskId === initial.taskId,
  );
  const pending = scoped.filter(
    (r) => r.state === "delivered" || r.nextAt <= now,
  );
  const shown = scoped.filter(
    (r) =>
      (tab === "all" ||
        (tab === "now" ? pending.includes(r) : !pending.includes(r))) &&
      fold(`${r.title} ${r.projectName ?? ""}`).includes(fold(query)),
  );
  const deadlineAt = localReminderTimestamp(day, time);
  const selected = shown.filter((r) => selection.has(r.id));
  const changeSelected = (action: "dismiss" | "snooze", value?: SnoozeValue) =>
    start(async () => {
      setError("");
      try {
        const result = await changeRemindersAction(
          selected.map((r) => ({ id: r.id, version: r.version })),
          action,
          value && "until" in value ? value.until : undefined,
          value && "minutes" in value ? value.minutes : undefined,
        );
        if (!result.ok) {
          setError(result.error);
          await refresh();
          return;
        }
        setSelection(new Set());
        setSelecting(false);
        await refresh();
        void desktop?.notifications?.("refresh");
        toast.success(
          action === "snooze" ? "Lembretes adiados." : "Lembretes dispensados.",
        );
      } catch {
        setError("Não foi possível atualizar a seleção. Tente novamente.");
      }
    });
  const triggerAt = deadlineAt === null ? null : deadlineAt - lead * 60_000;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const submit = () =>
    start(async () => {
      setError("");
      if (
        deadlineAt === null ||
        triggerAt === null ||
        triggerAt <= Date.now()
      ) {
        setError("Escolha uma data e um horário de aviso no futuro.");
        return;
      }
      try {
        const result = await scheduleRemindersAction(
          targets.map((t) => ({ id: t.id, version: t.version })),
          {
            kind,
            deadlineAt,
            dateOnly,
            timeZone: zone,
            leadMinutes: lead,
            channel,
            snoozeMinutes: snooze,
          },
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        await refresh();
        void desktop?.notifications?.("refresh");
        setCompose(false);
        toast.success(
          `${result.data} ${result.data === 1 ? "lembrete agendado" : "lembretes agendados"}.`,
        );
      } catch {
        setError("Não foi possível agendar. Tente novamente.");
      }
    });
  const editReminder = (reminder: TaskReminder) => {
    const date = new Date(reminder.deadlineAt);
    setTarget(`task:${reminder.taskId}`);
    setKind(reminder.kind);
    setDay(localDate(date));
    setTime(
      `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    );
    setDateOnly(reminder.dateOnly);
    setLead(reminder.leadMinutes);
    setChannel(reminder.channel);
    setSnooze(reminder.snoozeMinutes);
    setCompose(true);
    setError("");
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-w-[700px]"
        title={compose ? "Agendar lembretes" : "Meus lembretes"}
        description={
          initial.taskId
            ? first?.title
            : "Seus próximos passos, na hora certa. Só você recebe estes avisos."
        }
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogBody className="gap-5 pt-4">
          {!compose ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  className="flex max-w-full flex-wrap gap-1 rounded-xl bg-surface-2 p-1"
                  role="group"
                  aria-label="Filtrar lembretes"
                >
                  {(
                    [
                      ["all", "Todos", scoped.length],
                      ["now", "Para agora", pending.length],
                      [
                        "scheduled",
                        "Agendados",
                        scoped.length - pending.length,
                      ],
                    ] as const
                  ).map(([id, label, count]) => (
                    <button
                      key={id}
                      aria-pressed={tab === id}
                      onClick={() => setTab(id)}
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-xs",
                        tab === id
                          ? "bg-surface font-medium text-ink shadow-rest"
                          : "text-muted",
                      )}
                    >
                      {label}{" "}
                      <span className="ml-1 tabular-nums opacity-70">
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => {
                    setError("");
                    setCompose(true);
                  }}
                >
                  <Plus />
                  Agendar
                </Button>
              </div>
              {scoped.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setSelecting(!selecting);
                      setSelection(new Set());
                    }}
                  >
                    <CheckCheck />
                    {selecting ? "Sair da seleção" : "Selecionar lembretes"}
                  </Button>
                  {selecting && (
                    <>
                      <button
                        disabled={busy}
                        className="mr-auto text-muted hover:text-ink"
                        onClick={() =>
                          setSelection(
                            selected.length === shown.length
                              ? new Set()
                              : new Set(shown.slice(0, 500).map((r) => r.id)),
                          )
                        }
                      >
                        Selecionar todos
                      </button>
                      <span className="text-muted">
                        {selected.length} selecionados
                      </span>
                      <Snooze
                        reminder={{
                          id: "selection",
                          title: "seleção",
                          nextAt: Math.max(0, ...selected.map((r) => r.nextAt)),
                        }}
                        busy={busy || !selected.length}
                        onChange={(value) => changeSelected("snooze", value)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || !selected.length}
                        onClick={() => changeSelected("dismiss")}
                      >
                        <Check />
                        Dispensar
                      </Button>
                    </>
                  )}
                </div>
              )}
              {scoped.length > 3 && (
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-muted" />
                  <Input
                    aria-label="Pesquisar lembretes"
                    className="pl-9"
                    placeholder="Pesquisar tarefa ou projeto…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2" aria-label="Lista de lembretes">
                {shown.map((r) => (
                  <div
                    key={r.id}
                    className={cn(
                      "flex flex-wrap items-start gap-3 rounded-2xl border p-3 min-[440px]:flex-nowrap",
                      pending.includes(r)
                        ? "border-accent/25 bg-accent-soft/40"
                        : "border-line bg-surface-2/30",
                    )}
                  >
                    {selecting && (
                      <input
                        type="checkbox"
                        className="mt-3 size-3.5 shrink-0 accent-accent"
                        aria-label={`Selecionar lembrete de ${r.title}`}
                        checked={selection.has(r.id)}
                        disabled={busy}
                        onChange={() =>
                          setSelection((old) => {
                            const next = new Set(old);
                            if (next.has(r.id)) next.delete(r.id);
                            else if (next.size < 500) next.add(r.id);
                            return next;
                          })
                        }
                      />
                    )}
                    <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-accent-ink">
                      {r.snoozed ? (
                        <Clock3 className="size-4" />
                      ) : (
                        <CalendarClock className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        className="max-w-full break-words text-left text-sm font-medium text-ink hover:underline"
                        onClick={() => onOpenTask(r.taskId)}
                      >
                        {r.title}
                      </button>
                      <p className="mt-0.5 text-xs text-muted">
                        {REMINDER_LABELS[r.kind]}{" "}
                        {formatReminderTime(
                          r.deadlineAt,
                          r.timeZone,
                          r.dateOnly,
                        )}
                        {r.projectName ? ` · ${r.projectName}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                        <span className="inline-flex items-center gap-1">
                          {r.channel === "sound" ? (
                            <Volume2 className="size-3" />
                          ) : r.channel === "silent" ? (
                            <BellOff className="size-3" />
                          ) : (
                            <Bell className="size-3" />
                          )}
                          {REMINDER_CHANNELS[r.channel]}
                        </span>
                        <span>
                          {r.snoozed
                            ? "Adiado para "
                            : r.state === "delivered"
                              ? "Enviado em "
                              : "Avisar em "}
                          {formatReminderTime(
                            r.state === "delivered" ? r.deliveredAt! : r.nextAt,
                            r.timeZone,
                          )}
                        </span>
                      </div>
                      {r.lastError && (
                        <p className="mt-1.5 text-xs text-danger">
                          {r.lastError}
                        </p>
                      )}
                    </div>
                    <div className="ml-auto flex w-full shrink-0 items-center justify-end min-[440px]:w-auto">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy}
                        onClick={() => editReminder(r)}
                        aria-label={`Reagendar lembrete de ${r.title}`}
                        title="Reagendar"
                      >
                        <Pencil />
                      </Button>
                      <Snooze
                        reminder={r}
                        busy={busy}
                        onChange={(value) =>
                          change(
                            r,
                            "snooze",
                            "until" in value
                              ? value.until
                              : Math.max(Date.now(), r.nextAt) +
                                  value.minutes * 60_000,
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy}
                        onClick={() => change(r, "dismiss")}
                        aria-label={`Dispensar lembrete de ${r.title}`}
                        title="Dispensar"
                      >
                        <Check />
                      </Button>
                    </div>
                  </div>
                ))}
                {!shown.length && (
                  <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
                    <Bell className="mx-auto mb-3 size-6 text-muted" />
                    <p className="text-sm font-medium">
                      {query
                        ? "Nenhum lembrete encontrado"
                        : tab === "now"
                          ? "Tudo em dia por aqui"
                          : "Espaço para seus próximos passos"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {query
                        ? "Tente outro termo."
                        : "Agende um aviso de início, conclusão ou acompanhamento."}
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <form
              id="task-reminder-form"
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy && targets.length && targets.length <= 500) submit();
              }}
            >
              <fieldset disabled={busy} className="space-y-5">
                <Field
                  label="Aplicar em"
                  htmlFor="reminder-target"
                  hint="Aplica às tarefas atuais. Concluídas e arquivadas ficam de fora."
                >
                  <select
                    id="reminder-target"
                    className={selectClass}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    {target.startsWith("task:") && (
                      <option value={target}>
                        {tasks.find((t) => t.id === target.slice(5))?.title ??
                          "Esta tarefa"}
                      </option>
                    )}
                    <option value="visible">Tarefas desta visão</option>
                    {selectedIds.length > 0 && (
                      <option value="selection">Tarefas selecionadas</option>
                    )}
                    <optgroup label="Projetos / pastas">
                      <option value="project:none">Sem projeto</option>
                      {projects.map((p) => (
                        <option key={p.id} value={`project:${p.id}`}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                    {!!boards.length && (
                      <optgroup label="Blocos">
                        {boards.map((b) => (
                          <option key={b.id} value={`block:${b.id}`}>
                            {projects.find((p) => p.id === b.projectId)?.name ??
                              "Sem projeto"}{" "}
                            / {b.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </Field>
                <div
                  className="grid grid-cols-3 gap-2"
                  role="group"
                  aria-label="Tipo de lembrete"
                >
                  {REMINDER_KINDS.map((v) => (
                    <button
                      type="button"
                      key={v}
                      aria-pressed={kind === v}
                      onClick={() => setKind(v)}
                      className={cn(
                        "flex min-w-0 flex-col items-center gap-2 rounded-xl border px-1 py-3 text-xs transition-colors",
                        kind === v
                          ? "border-accent/40 bg-accent-soft font-medium text-accent-ink"
                          : "border-line bg-surface text-muted hover:bg-hover",
                      )}
                    >
                      {v === "start" ? (
                        <Play className="size-4" />
                      ) : v === "finish" ? (
                        <Flag className="size-4" />
                      ) : (
                        <MessageCircle className="size-4" />
                      )}
                      {REMINDER_LABELS[v]}
                    </button>
                  ))}
                </div>
                <div className="rounded-2xl border border-line bg-surface-2/40 p-4">
                  <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
                    <Field label="Dia" htmlFor="reminder-day">
                      <Input
                        id="reminder-day"
                        required
                        type="date"
                        min={localDate()}
                        value={day}
                        onChange={(e) => setDay(e.target.value)}
                      />
                    </Field>
                    <Field
                      label={dateOnly ? "Horário do aviso" : "Horário limite"}
                      htmlFor="reminder-time"
                    >
                      <Input
                        id="reminder-time"
                        required
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                      />
                    </Field>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-xs text-ink-2">
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={dateOnly}
                      onChange={(e) => {
                        setDateOnly(e.target.checked);
                        if (e.target.checked) setLead(0);
                      }}
                    />
                    Definir só o dia, sem horário limite
                  </label>
                  <p className="mt-2 text-[11px] text-muted">
                    {dateOnly
                      ? "A meta vale para o dia inteiro. O aviso chega no horário escolhido. · "
                      : ""}
                    {zone}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Avisar" htmlFor="reminder-lead">
                    <select
                      id="reminder-lead"
                      className={selectClass}
                      value={lead}
                      disabled={dateOnly}
                      onChange={(e) =>
                        setLead(
                          Number(
                            e.target.value,
                          ) as ReminderInput["leadMinutes"],
                        )
                      }
                    >
                      <option value={0}>No horário escolhido</option>
                      {[5, 15, 30, 60, 1440].map((v) => (
                        <option key={v} value={v}>
                          {duration(v)} antes
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Adiar pelo aviso do Mac"
                    htmlFor="reminder-snooze"
                  >
                    <select
                      id="reminder-snooze"
                      className={selectClass}
                      value={snooze}
                      onChange={(e) => setSnooze(Number(e.target.value))}
                    >
                      {SNOOZE_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {duration(v)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Entrega" htmlFor="reminder-channel">
                  <select
                    id="reminder-channel"
                    className={selectClass}
                    value={channel}
                    onChange={(e) =>
                      setChannel(e.target.value as ReminderInput["channel"])
                    }
                  >
                    {Object.entries(REMINDER_CHANNELS).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div
                  className="rounded-xl bg-accent-soft p-3 text-xs text-accent-ink"
                  aria-live="polite"
                >
                  <strong>
                    {targets.length}{" "}
                    {targets.length === 1
                      ? "tarefa receberá"
                      : "tarefas receberão"}{" "}
                    este lembrete.
                  </strong>
                  {triggerAt !== null && (
                    <p className="mt-1">
                      Aviso: {formatReminderTime(triggerAt, zone)}.
                    </p>
                  )}
                  {matched.length !== targets.length && (
                    <p className="mt-1">
                      Tarefas já iniciadas ficam de fora do aviso de início.
                    </p>
                  )}
                  {replacements > 0 && (
                    <p className="mt-1">
                      Substitui {replacements} lembrete(s) seu(s) do mesmo tipo.
                      Os outros tipos são mantidos.
                    </p>
                  )}
                  {targets.length > 500 && (
                    <p className="mt-1">Selecione até 500 tarefas por lote.</p>
                  )}
                </div>
              </fieldset>
            </form>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="rounded-xl border border-line bg-surface-2/40 p-3 text-[11px] leading-relaxed text-muted">
            {desktop
              ? "No Mac, mantenha o Waypoint aberto ou em segundo plano. Ao voltar do repouso, os avisos pendentes serão retomados. Som, banners e modo Foco seguem os ajustes do macOS."
              : "Notificações do Mac são entregues pelo aplicativo desktop. Aqui no navegador, os lembretes continuam disponíveis nesta central."}
            {desktop && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-7 px-0 text-xs"
                disabled={testing}
                onClick={async () => {
                  setTesting(true);
                  try {
                    const value = await desktop.notifications("test");
                    toast(
                      value.sent
                        ? "Aviso de teste enviado ao macOS."
                        : "Confira Ajustes do Sistema → Notificações → Waypoint e tente novamente.",
                    );
                  } catch {
                    toast.error("Não foi possível testar a notificação.");
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                <Bell className="size-3!" />
                {testing ? "Enviando teste…" : "Testar notificação do Mac"}
              </Button>
            )}
          </div>
        </DialogBody>
        {compose && (
          <DialogFooter className="px-4 sm:px-6">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-label="Voltar à central"
              onClick={() => {
                setCompose(false);
                setError("");
              }}
            >
              <ArrowLeft />
              <span className="hidden min-[400px]:inline">Central</span>
            </Button>
            <Button
              form="task-reminder-form"
              type="submit"
              variant="primary"
              className="ml-auto"
              disabled={busy || !targets.length || targets.length > 500}
            >
              <Bell />
              {busy
                ? "Agendando…"
                : `Agendar ${targets.length === 1 ? "lembrete" : `${targets.length} lembretes`}`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
