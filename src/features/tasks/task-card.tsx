"use client";
import {
  Archive,
  Bell,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Flag,
  MoreHorizontal,
  Palette,
  MessageSquareDot,
  CircleAlert,
  Hourglass,
  GitFork,
  Link2,
  CalendarClock,
  Pencil,
  RotateCcw,
} from "lucide-react";
import type { DragEvent } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CardSubtasks,
  PeopleAvatars,
  StatusMark,
  TaskDate,
} from "./task-controls";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  COLOR_LABELS,
  STATUS_LABELS,
  TASK_COLORS,
  TASK_STATUSES,
  PENDING_LABELS,
  dateLabel,
  PRIORITY_LABELS,
  type Task,
  type TaskColor,
  type TaskProject,
} from "@/domain/tasks";
import { cn } from "@/lib/utils";
import type { TaskDestination } from "@/domain/task-board";
import type { CardFields } from "./task-preferences";

export type TaskCommands = {
  remind: () => void;
  edit: () => void;
  patch: (patch: Partial<Task>) => void;
  archive: () => void;
  duplicate: () => void;
  copy: () => void;
  reorder: (direction: -1 | 1) => void;
};
function MenuItems({
  context,
  task,
  commands,
  disabled,
  destinations,
}: {
  destinations?: { name: string; value: TaskDestination }[];
  context: boolean;
  task: Task;
  commands: TaskCommands;
  disabled: boolean;
}) {
  const Item = context ? ContextMenuItem : DropdownMenuItem;
  const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator;
  const Sub = context ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger = context ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent = context ? ContextMenuSubContent : DropdownMenuSubContent;
  return (
    <>
      <Item onSelect={commands.edit}>
        <Pencil />
        Abrir detalhes
      </Item>
      <Item
        disabled={!!task.archivedAt || task.status === "done"}
        onSelect={commands.remind}
      >
        <Bell />
        Lembretes
      </Item>
      <Sub>
        <SubTrigger disabled={disabled}>
          <CheckCircle2 />
          Mover para etapa
        </SubTrigger>
        <SubContent>
          {destinations?.length
            ? destinations.map((d) => (
                <Item
                  key={`${d.value.blockId}:${d.value.columnId}:${d.value.status}`}
                  onSelect={() => commands.patch(d.value)}
                >
                  <StatusMark
                    status={d.value.status}
                    className="size-4 rounded [&_svg]:size-3"
                  />
                  {d.name}
                </Item>
              ))
            : TASK_STATUSES.map((s) => (
                <Item key={s} onSelect={() => commands.patch({ status: s })}>
                  <span
                    className={cn(
                      "wp-task-status size-2 rounded-full",
                      `wp-task-status-${s}`,
                    )}
                  />
                  {STATUS_LABELS[s]}
                  {task.status === s && <Check className="ml-auto" />}
                </Item>
              ))}
        </SubContent>
      </Sub>
      <Sub>
        <SubTrigger disabled={disabled}>
          <Palette />
          Cor do card
        </SubTrigger>
        <SubContent>
          {TASK_COLORS.map((c) => (
            <Item
              key={c}
              onSelect={() => commands.patch({ color: c as TaskColor })}
            >
              <span
                data-color={c}
                className="wp-task-color size-3 rounded-full border"
              />
              {COLOR_LABELS[c]}
              {task.color === c && <Check className="ml-auto" />}
            </Item>
          ))}
        </SubContent>
      </Sub>
      <Separator />
      <Item
        disabled={disabled || !!task.archivedAt}
        onSelect={() => commands.reorder(-1)}
      >
        <ArrowUp />
        Mover para cima
      </Item>
      <Item
        disabled={disabled || !!task.archivedAt}
        onSelect={() => commands.reorder(1)}
      >
        <ArrowDown />
        Mover para baixo
      </Item>
      <Item disabled={disabled} onSelect={commands.duplicate}>
        <Copy />
        Duplicar tarefa
      </Item>
      <Item onSelect={commands.copy}>
        <FileText />
        Copiar em Markdown
      </Item>
      <Separator />
      <Item disabled={disabled} onSelect={commands.archive}>
        {task.archivedAt ? <RotateCcw /> : <Archive />}
        {task.archivedAt ? "Restaurar tarefa" : "Arquivar tarefa"}
      </Item>
    </>
  );
}
export function TaskCard({
  task,
  project,
  commands,
  selecting,
  selected,
  onSelect,
  canEdit,
  canDrag,
  busy,
  list,
  today,
  dragging,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  fields,
  destinations,
  stageName,
  dependencies,
  onOpenTask,
  reminderCount,
}: {
  dependencies: Task[];
  onOpenTask: (id: string) => void;
  reminderCount: number;
  fields: CardFields;
  destinations?: { name: string; value: TaskDestination }[];
  stageName?: string;
  task: Task;
  project?: TaskProject;
  commands: TaskCommands;
  selecting: boolean;
  selected: boolean;
  onSelect: () => void;
  canEdit: boolean;
  canDrag: boolean;
  busy: boolean;
  list: boolean;
  today: string;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const complete = task.status === "done";
  const PendingIcon =
    task.pendingKind === "blocked"
      ? CircleAlert
      : task.pendingKind === "waiting"
        ? Hourglass
        : task.pendingKind === "decision"
          ? GitFork
          : MessageSquareDot;
  const menuItems = (context: boolean) => (
    <MenuItems
      context={context}
      task={task}
      commands={commands}
      destinations={destinations}
      disabled={!canEdit || busy}
    />
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <article
          data-task-id={task.id}
          aria-label={`Tarefa: ${task.title}`}
          draggable={canDrag && !selecting && !busy && !task.archivedAt}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDrop={onDrop}
          data-color={
            task.color === "neutral"
              ? (project?.color ?? "neutral")
              : task.color
          }
          className={cn(
            "wp-task-card group relative rounded-xl border p-2.5 shadow-rest transition-[box-shadow,opacity] duration-150 hover:shadow-raise",
            !list && "wp-task-board-card",
            selected && "ring-2 ring-accent",
            dragging && "opacity-40",
            dropTarget && "wp-task-drop-before",
            list && "sm:flex sm:items-center sm:gap-4",
          )}
        >
          <div
            className={cn(
              "mb-1 flex h-4 min-w-0 items-center gap-1.5 text-[11px]",
              list && "sm:mb-0 sm:w-40 sm:shrink-0",
            )}
          >
            {fields.project && project && (
              <span
                className="min-w-0 max-w-[50%] truncate"
                title={project.name}
              >
                {project.name}
              </span>
            )}
            {fields.tags && task.tags.length > 0 && (
              <span
                className="min-w-0 truncate"
                title={task.tags.map((t) => `#${t}`).join(" ")}
              >
                #{task.tags[0]}
                {task.tags.length > 1 && (
                  <span className="ml-1 opacity-70">
                    +{task.tags.length - 1}
                  </span>
                )}
              </span>
            )}
            {!(fields.project && project) &&
              !(fields.tags && task.tags.length) && (
                <span className="truncate text-muted">
                  {stageName ?? STATUS_LABELS[task.status]}
                </span>
              )}
            {fields.priority && task.priority !== "none" && (
              <span
                className="ml-auto inline-flex shrink-0 items-center gap-0.5"
                title={`Prioridade ${PRIORITY_LABELS[task.priority]}`}
              >
                <Flag className="size-3" />
                {task.priority === "high"
                  ? "Alta"
                  : task.priority === "medium"
                    ? "Média"
                    : "Baixa"}
              </span>
            )}
            {reminderCount > 0 && (
              <button
                className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-surface/40"
                onClick={commands.remind}
                aria-label={`${reminderCount} lembrete(s) em ${task.title}`}
                title="Ver lembretes"
              >
                <Bell className="size-3" />
              </button>
            )}
            {!list && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="wp-task-menu ml-auto -mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-surface/40"
                    aria-label={`Ações de ${task.title}`}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {menuItems(false)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div
            className={cn(
              "flex min-h-8 min-w-0 items-start gap-1.5",
              list && "sm:min-h-0 sm:flex-1 sm:items-center",
            )}
          >
            {selecting ? (
              <input
                type="checkbox"
                className="mt-0.5 size-3.5 shrink-0 accent-accent"
                checked={selected}
                onChange={onSelect}
                aria-label={`Selecionar ${task.title}`}
              />
            ) : (
              <button
                disabled={!canEdit || busy}
                aria-label={`${complete ? "Reabrir" : "Concluir"} ${task.title}`}
                onClick={() =>
                  commands.patch({ status: complete ? "todo" : "done" })
                }
                className="wp-task-complete mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded border border-current/40 bg-surface/50 disabled:opacity-60"
              >
                {complete && <Check className="size-2.5" />}
              </button>
            )}
            <button
              onClick={selecting ? onSelect : commands.edit}
              className={cn(
                "wp-task-title min-w-0 flex-1 text-left text-xs font-medium leading-[1.4] text-ink",
                complete && "text-muted line-through",
              )}
              title={task.title}
            >
              <span className="line-clamp-2 break-words">{task.title}</span>
            </button>
          </div>
          <div
            className={cn(
              "wp-task-card-meta mt-1 flex min-h-6 min-w-0 flex-wrap items-center gap-0.5 text-[11px]",
              list && "sm:mt-0 sm:shrink-0",
            )}
          >
            {list && (
              <span className="mr-1 hidden items-center gap-1 text-[11px] sm:inline-flex">
                <span
                  className={cn(
                    "wp-task-status size-1.5 rounded-full",
                    `wp-task-status-${task.status}`,
                  )}
                />
                {stageName ?? STATUS_LABELS[task.status]}
              </span>
            )}
            {fields.due && (
              <TaskDate
                date={task.dueDate}
                today={today}
                complete={complete}
                disabled={!canEdit || busy || selecting}
                onChange={(dueDate) => commands.patch({ dueDate })}
              />
            )}
            {fields.progress && task.subtasks.length > 0 && (
              <CardSubtasks
                task={task}
                disabled={!canEdit || busy || selecting}
                onChange={(subtasks) => commands.patch({ subtasks })}
              />
            )}
            {fields.pending && task.pendingNote && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded px-1 hover:bg-surface/40"
                    aria-label={`Ver pendência de ${task.title}`}
                    title={PENDING_LABELS[task.pendingKind]}
                  >
                    <PendingIcon className="size-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="space-y-2">
                  <p className="text-xs font-semibold text-amber-ink">
                    {PENDING_LABELS[task.pendingKind]}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-body leading-6 text-ink-2">
                    {task.pendingNote}
                  </p>
                  <Button variant="ghost" size="sm" onClick={commands.edit}>
                    Abrir detalhes
                  </Button>
                </PopoverContent>
              </Popover>
            )}
            {fields.dependencies && dependencies.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="inline-flex min-h-7 shrink-0 items-center justify-center rounded px-1 hover:bg-surface/40"
                    aria-label={`Dependências de ${task.title}`}
                    title={`${dependencies.filter((t) => t.status !== "done").length} dependências em aberto`}
                  >
                    <Link2 className="size-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="space-y-2">
                  <p className="text-xs font-semibold">Depende de</p>
                  {dependencies.map((dependency) => (
                    <button
                      key={dependency.id}
                      onClick={() => onOpenTask(dependency.id)}
                      className="flex w-full items-center gap-2 rounded-control px-1 py-2 text-left text-xs hover:bg-hover"
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          dependency.status === "done"
                            ? "bg-success-ink"
                            : "bg-amber-ink",
                        )}
                      />
                      <span className="min-w-0 flex-1 break-words">
                        {dependency.title}
                      </span>
                      {dependency.status === "done" && (
                        <Check className="size-3 shrink-0" />
                      )}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}
            {fields.followUp && task.followUpDate && (
              <button
                className={cn(
                  "inline-flex min-h-7 shrink-0 items-center justify-center rounded px-1 hover:bg-surface/40",
                  !complete && task.followUpDate <= today && "text-amber-ink",
                )}
                aria-label={`Acompanhar ${task.title} em ${task.followUpDate}`}
                title={`Acompanhar em ${dateLabel(task.followUpDate)}`}
                onClick={commands.edit}
              >
                <CalendarClock className="size-3" />
              </button>
            )}
            {fields.people && task.people.length > 0 && (
              <span className="ml-auto pl-1">
                <PeopleAvatars people={task.people} />
              </span>
            )}
            {list && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label={`Ações de ${task.title}`}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {menuItems(false)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {fields.project &&
            fields.tags &&
            project &&
            task.tags.length > 0 &&
            list && (
              <span className="hidden text-[11px] text-muted xl:block">
                {project.name}
              </span>
            )}
        </article>
      </ContextMenuTrigger>
      <ContextMenuContent>{menuItems(true)}</ContextMenuContent>
    </ContextMenu>
  );
}
