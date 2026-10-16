"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  Bell,
  ChevronDown,
  Eye,
  FileText,
  ListTodo,
  Plus,
  Users,
  Link2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Input, selectClass, Textarea } from "@/components/ui/input";
import {
  COLOR_LABELS,
  PRIORITY_LABELS,
  PENDING_LABELS,
  STATUS_LABELS,
  TASK_COLORS,
  TASK_STATUSES,
  emptyTask,
  taskInputSchema,
  type Task,
  type TaskColor,
  type TaskInput,
  type TaskProject,
} from "@/domain/tasks";
import { cn } from "@/lib/utils";
import {
  boardsForProject,
  columnDestination,
  taskPlacement,
  type TaskBoard,
} from "@/domain/task-board";
import { TaskMarkdown } from "./markdown";

export function ColorPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: TaskColor;
  onChange: (c: TaskColor) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Cor do card">
      {TASK_COLORS.map((c) => (
        <button
          type="button"
          key={c}
          disabled={disabled}
          aria-label={COLOR_LABELS[c]}
          aria-pressed={value === c}
          title={COLOR_LABELS[c]}
          onClick={() => onChange(c)}
          className={cn(
            "wp-task-color flex size-8 items-center justify-center rounded-full border transition-transform hover:scale-110",
            value === c &&
              "ring-2 ring-accent ring-offset-2 ring-offset-surface",
          )}
          data-color={c}
        >
          {value === c && <Check className="size-3.5" />}
        </button>
      ))}
    </div>
  );
}
function Extra({
  title,
  icon,
  children,
  open,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className="group rounded-2xl border border-line bg-surface-2/30"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-body font-medium text-ink-2 [&::-webkit-details-marker]:hidden">
        {icon}
        {title}
        <ChevronDown className="ml-auto size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 px-4 pb-4">{children}</div>
    </details>
  );
}
function Tokens({
  label,
  values,
  onChange,
  suggestions = [],
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const names = input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length) onChange([...new Set([...values, ...names])]);
    setInput("");
  };
  return (
    <div className="space-y-2">
      <label
        className="text-xs font-medium text-ink-2"
        htmlFor={`task-${label}`}
      >
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 rounded-chip bg-subtle px-2 py-1 text-xs"
          >
            {v}
            <button
              type="button"
              aria-label={`Remover ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id={`task-${label}`}
          list={`suggestions-${label}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={add}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          size="icon"
          aria-label={`Adicionar ${label.toLowerCase()}`}
          onClick={add}
        >
          <Plus />
        </Button>
      </div>
      <datalist id={`suggestions-${label}`}>
        {suggestions
          .filter((s) => !values.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
export function TaskEditor({
  task,
  defaults,
  projects,
  boards,
  members,
  allTasks,
  onOpenTask,
  onRemind,
  reminderCount,
  canEdit,
  busy,
  onSave,
  onClose,
}: {
  task: Task | null;
  defaults: Partial<TaskInput>;
  projects: TaskProject[];
  boards: TaskBoard[];
  members: string[];
  allTasks: Task[];
  onOpenTask: (id: string) => void;
  onRemind?: () => void;
  reminderCount: number;
  canEdit: boolean;
  busy: boolean;
  onSave: (data: TaskInput, task: Task | null) => Promise<boolean>;
  onClose: () => void;
}) {
  const initial = task
    ? taskInputSchema.parse(task)
    : {
        ...emptyTask({
          ...defaults,
          title: defaults.title?.trim() || "Nova tarefa",
        }),
        title: defaults.title ?? "",
      };
  const [draft, setDraft] = useState<TaskInput>(initial);
  const [preview, setPreview] = useState(!canEdit);
  const [subtask, setSubtask] = useState("");
  const [error, setError] = useState("");
  const [dependencyQuery, setDependencyQuery] = useState("");
  const dependents = task
    ? allTasks.filter((t) => t.dependsOn.includes(task.id))
    : [];
  const scopedBoards = boardsForProject(boards, draft.projectId);
  const placement = taskPlacement(draft, boards);
  const changed =
    JSON.stringify(draft) !== JSON.stringify(initial) || !!subtask.trim();
  useEffect(() => {
    if (!changed || !canEdit) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [changed, canEdit]);
  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const close = () => {
    if (
      !busy &&
      (!canEdit ||
        !changed ||
        window.confirm("Descartar as alterações desta tarefa?"))
    )
      onClose();
  };
  const addSubtask = () => {
    if (!subtask.trim()) return;
    set("subtasks", [
      ...draft.subtasks,
      { id: crypto.randomUUID(), title: subtask.trim(), done: false },
    ]);
    setSubtask("");
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        title={task ? "Detalhes da tarefa" : "Nova tarefa"}
        description={
          task
            ? "Contexto e próximos passos, no seu ritmo."
            : "Comece pelo título. Os detalhes podem vir depois."
        }
        data-color={draft.color}
        className="wp-task-sheet left-auto right-0 top-[var(--titlebar-h,0px)] h-[calc(100dvh-var(--titlebar-h,0px))] max-h-none w-full max-w-[520px] translate-x-0 rounded-none border-l border-line sm:rounded-l-3xl data-[state=open]:animate-panel-in data-[state=closed]:animate-panel-out"
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onKeyDown={(e) => {
            if (
              (e.metaKey || e.ctrlKey) &&
              e.key === "Enter" &&
              canEdit &&
              !busy
            ) {
              e.preventDefault();
              e.currentTarget.requestSubmit();
            }
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            const data = {
              ...draft,
              subtasks: subtask.trim()
                ? [
                    ...draft.subtasks,
                    {
                      id: crypto.randomUUID(),
                      title: subtask.trim(),
                      done: false,
                    },
                  ]
                : draft.subtasks,
            };
            const result = taskInputSchema.safeParse(data);
            if (!result.success)
              return setError(
                result.error.issues[0]?.message ?? "Revise os campos.",
              );
            setError("");
            await onSave(result.data, task);
          }}
        >
          <DialogBody className="flex-1 gap-6 pb-8 pt-6 sm:px-8">
            <fieldset disabled={!canEdit || busy} className="contents">
              <Field label="O que precisa ser feito?" htmlFor="task-title">
                <Input
                  id="task-title"
                  value={draft.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="Ex.: Preparar a proposta do projeto"
                  maxLength={300}
                  autoFocus
                  className="h-14 rounded-xl border-transparent bg-transparent px-0 text-[22px] font-semibold tracking-tight focus:border-transparent focus:ring-0"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-surface-2/70 p-4 sm:grid-cols-3">
                <Field label="Etapa" htmlFor="task-status">
                  <select
                    id="task-status"
                    className={selectClass}
                    value={draft.status}
                    onChange={(e) =>
                      setDraft((d) => {
                        const status = e.target.value as TaskInput["status"];
                        const column = placement.board.columns.find(
                          (c) => c.status === status,
                        );
                        return {
                          ...d,
                          status,
                          blockId:
                            column && placement.board.version
                              ? placement.board.id
                              : null,
                          columnId:
                            column && placement.board.version
                              ? column.id
                              : null,
                        };
                      })
                    }
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Projeto" htmlFor="task-project">
                  <select
                    id="task-project"
                    className={selectClass}
                    value={draft.projectId ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        projectId: e.target.value || null,
                        blockId: null,
                        columnId: null,
                      }))
                    }
                  >
                    <option value="">Sem projeto</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Data ou meta" htmlFor="task-due">
                  <Input
                    id="task-due"
                    type="date"
                    value={draft.dueDate ?? ""}
                    onChange={(e) => set("dueDate", e.target.value || null)}
                  />
                </Field>
              </div>
              <Field label="Bloco e coluna" htmlFor="task-location">
                <select
                  id="task-location"
                  className={selectClass}
                  value={`${placement.board.id}|${placement.column?.id ?? ""}`}
                  onChange={(e) => {
                    const [blockId, columnId] = e.target.value.split("|");
                    const board = scopedBoards.find((b) => b.id === blockId)!;
                    const column = board.columns.find(
                      (c) => c.id === columnId,
                    )!;
                    setDraft((d) => ({
                      ...d,
                      ...columnDestination(board, column),
                    }));
                  }}
                >
                  {scopedBoards.map((board) => (
                    <optgroup key={board.id} label={board.name}>
                      {board.columns.map((column) => (
                        <option
                          key={column.id}
                          value={`${board.id}|${column.id}`}
                        >
                          {column.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
            </fieldset>
            {onRemind && (
              <button
                type="button"
                onClick={onRemind}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/40 px-4 py-3 text-left text-sm hover:bg-hover"
              >
                <Bell className="size-4 text-accent-ink" />
                <span className="flex-1">
                  Lembretes pessoais
                  <span className="mt-0.5 block text-xs text-muted">
                    Início, conclusão ou acompanhamento
                  </span>
                </span>
                <span className="text-xs text-muted">
                  {reminderCount ? `${reminderCount} ativo(s)` : "Agendar"}
                </span>
              </button>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  className="text-xs font-medium text-ink-2"
                  htmlFor="task-description"
                >
                  Contexto{" "}
                  <span className="font-normal text-muted">· Markdown</span>
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreview(!preview)}
                >
                  {preview ? <FileText /> : <Eye />}
                  {preview ? "Editar" : "Visualizar"}
                </Button>
              </div>
              {preview ? (
                <div className="min-h-24 rounded-2xl border border-line bg-surface-2/40 p-4">
                  {draft.description ? (
                    <TaskMarkdown text={draft.description} />
                  ) : (
                    <p className="text-body text-muted">
                      Espaço para ideias, links e contexto.
                    </p>
                  )}
                </div>
              ) : (
                <Textarea
                  id="task-description"
                  maxLength={20000}
                  disabled={!canEdit || busy}
                  value={draft.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Escreva livremente. Use **destaques**, listas, links e blocos de código…"
                  className="min-h-36 rounded-2xl border-line bg-surface-2/40 p-4 leading-6"
                />
              )}
            </div>
            <fieldset disabled={!canEdit || busy} className="contents">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-body font-medium">
                  <ListTodo className="size-4 text-muted" />
                  Subtarefas{" "}
                  <span className="ml-auto text-xs font-normal tabular-nums text-muted">
                    {draft.subtasks.filter((s) => s.done).length}/
                    {draft.subtasks.length}
                  </span>
                </div>
                {draft.subtasks.length > 0 && (
                  <div className="h-1 overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{
                        width: `${(draft.subtasks.filter((s) => s.done).length / draft.subtasks.length) * 100}%`,
                      }}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  {draft.subtasks.map((s) => (
                    <div
                      key={s.id}
                      className="group/sub flex min-h-11 items-center gap-2 rounded-xl border border-line/70 bg-surface-2/50 p-2"
                    >
                      <input
                        type="checkbox"
                        aria-label={`Concluir ${s.title}`}
                        checked={s.done}
                        onChange={(e) =>
                          set(
                            "subtasks",
                            draft.subtasks.map((item) =>
                              item.id === s.id
                                ? { ...item, done: e.target.checked }
                                : item,
                            ),
                          )
                        }
                        className="size-4 accent-accent"
                      />
                      <Input
                        aria-label="Título da subtarefa"
                        maxLength={300}
                        value={s.title}
                        onChange={(e) =>
                          set(
                            "subtasks",
                            draft.subtasks.map((item) =>
                              item.id === s.id
                                ? { ...item, title: e.target.value }
                                : item,
                            ),
                          )
                        }
                        className={cn(
                          "h-7 border-0 bg-transparent px-1 text-body",
                          s.done && "text-muted line-through",
                        )}
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remover subtarefa ${s.title}`}
                        onClick={() =>
                          set(
                            "subtasks",
                            draft.subtasks.filter((item) => item.id !== s.id),
                          )
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Input
                      aria-label="Nova subtarefa"
                      maxLength={300}
                      value={subtask}
                      onChange={(e) => setSubtask(e.target.value)}
                      placeholder="Dividir em um pequeno passo…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSubtask();
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Adicionar subtarefa"
                      onClick={addSubtask}
                    >
                      <Plus />
                    </Button>
                  </div>
                )}
              </div>
              <Extra
                title="Pendências e dependências"
                icon={<FileText className="size-4" />}
                open={
                  !!(
                    initial.pendingNote ||
                    initial.followUpDate ||
                    initial.dependsOn.length ||
                    dependents.length
                  )
                }
              >
                <Field label="Acompanhar em" htmlFor="task-follow-up">
                  <Input
                    id="task-follow-up"
                    type="date"
                    value={draft.followUpDate ?? ""}
                    onChange={(e) =>
                      set("followUpDate", e.target.value || null)
                    }
                  />
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Quando revisitar ou cobrar um retorno. A meta de conclusão
                    continua no campo Data ou meta.
                  </p>
                </Field>
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <Link2 className="size-3.5" />
                    Depende de
                  </p>
                  {draft.dependsOn.map((id) => {
                    const related = allTasks.find((t) => t.id === id);
                    return (
                      <div
                        key={id}
                        className="flex items-center gap-2 rounded-control border border-line p-2"
                      >
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            related?.status === "done"
                              ? "bg-success-ink"
                              : "bg-amber-ink",
                          )}
                        />
                        <a
                          className="min-w-0 flex-1 truncate text-xs text-accent-ink underline underline-offset-2"
                          href={`/tasks?open=${encodeURIComponent(id)}`}
                          onClick={(e) => {
                            e.preventDefault();
                            if (
                              !changed ||
                              window.confirm(
                                "Descartar as alterações desta tarefa antes de abrir a dependência?",
                              )
                            )
                              onOpenTask(id);
                          }}
                        >
                          {related?.title ?? "Referência indisponível"}
                        </a>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remover dependência ${related?.title ?? id}`}
                          onClick={() =>
                            set(
                              "dependsOn",
                              draft.dependsOn.filter((v) => v !== id),
                            )
                          }
                        >
                          <X />
                        </Button>
                      </div>
                    );
                  })}
                  <Input
                    aria-label="Buscar tarefa para vincular"
                    value={dependencyQuery}
                    onChange={(e) => setDependencyQuery(e.target.value)}
                    placeholder="Buscar uma tarefa…"
                  />
                  <select
                    aria-label="Adicionar dependência"
                    className={selectClass}
                    value=""
                    disabled={draft.dependsOn.length >= 50}
                    onChange={(e) => {
                      if (e.target.value)
                        set("dependsOn", [...draft.dependsOn, e.target.value]);
                      setDependencyQuery("");
                    }}
                  >
                    <option value="">Escolha uma tarefa para vincular</option>
                    {allTasks
                      .filter(
                        (t) =>
                          t.id !== task?.id &&
                          !t.archivedAt &&
                          !draft.dependsOn.includes(t.id) &&
                          t.title
                            .toLocaleLowerCase()
                            .includes(dependencyQuery.toLocaleLowerCase()),
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                  {dependents.length > 0 && (
                    <div className="pt-2">
                      <p className="mb-2 text-xs font-medium">Desbloqueia</p>
                      {dependents.map((t) => (
                        <a
                          key={t.id}
                          href={`/tasks?open=${encodeURIComponent(t.id)}`}
                          className="mb-1 block truncate text-xs text-accent-ink underline underline-offset-2"
                          onClick={(e) => {
                            e.preventDefault();
                            if (
                              !changed ||
                              window.confirm(
                                "Descartar as alterações desta tarefa antes de abrir a tarefa vinculada?",
                              )
                            )
                              onOpenTask(t.id);
                          }}
                        >
                          {t.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <Field label="Tipo de pendência" htmlFor="task-pending-kind">
                  <select
                    id="task-pending-kind"
                    className={selectClass}
                    value={draft.pendingKind}
                    onChange={(e) =>
                      set(
                        "pendingKind",
                        e.target.value as TaskInput["pendingKind"],
                      )
                    }
                  >
                    {Object.entries(PENDING_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="O que falta ou está bloqueando?"
                  htmlFor="task-pending"
                >
                  <Textarea
                    id="task-pending"
                    maxLength={5000}
                    value={draft.pendingNote}
                    onChange={(e) => set("pendingNote", e.target.value)}
                    placeholder="Ex.: Aguardando aprovação do orçamento pela Ana."
                  />
                </Field>
              </Extra>
              <Extra
                title="Pessoas e organização"
                icon={<Users className="size-4" />}
                open={
                  !!(
                    initial.people.length ||
                    initial.tags.length ||
                    initial.priority !== "none" ||
                    initial.color !== "neutral"
                  )
                }
              >
                <Tokens
                  label="Pessoas de apoio"
                  values={draft.people}
                  onChange={(v) => set("people", v)}
                  suggestions={members}
                  placeholder="Nome de alguém do time ou contato externo"
                />
                <p className="text-xs text-muted">
                  Referências para você se organizar. Não envia convites nem
                  notificações.
                </p>
                <Tokens
                  label="Marcadores"
                  values={draft.tags}
                  onChange={(v) => set("tags", v)}
                  placeholder="Ex.: cliente, revisão, financeiro"
                />
                <Field label="Prioridade" htmlFor="task-priority">
                  <select
                    id="task-priority"
                    className={selectClass}
                    value={draft.priority}
                    onChange={(e) =>
                      set("priority", e.target.value as TaskInput["priority"])
                    }
                  >
                    {Object.entries(PRIORITY_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Cor do card">
                  <p className="mb-2 text-xs text-muted">
                    Neutro acompanha a cor do projeto. Escolha outra cor apenas
                    quando quiser destacar este card.
                  </p>
                  <ColorPicker
                    value={draft.color}
                    onChange={(v) => set("color", v)}
                  />
                </Field>
              </Extra>
            </fieldset>
            {task?.completedAt && (
              <p className="text-xs text-muted">
                Concluída em{" "}
                {new Date(task.completedAt).toLocaleDateString("pt-BR")}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter className="bg-surface px-6 py-4 sm:px-8">
            <span className="mr-auto hidden text-xs text-muted sm:block">
              {changed ? "Alterações não salvas" : "Tudo em ordem por aqui."}
            </span>
            <Button disabled={busy} variant="ghost" onClick={close}>
              {canEdit ? "Cancelar" : "Fechar"}
            </Button>
            {canEdit && (
              <Button type="submit" variant="primary" disabled={busy}>
                {busy
                  ? "Salvando…"
                  : task
                    ? "Salvar alterações"
                    : "Criar tarefa"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
