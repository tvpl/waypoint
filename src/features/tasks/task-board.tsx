"use client";
import {
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeftRight,
  MoreHorizontal,
  Plus,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  boardsForProject,
  columnDestination,
  defaultBoard,
  taskPlacement,
  type TaskBoard,
  type TaskDestination,
} from "@/domain/task-board";
import type { Task, TaskProject, TaskStatus } from "@/domain/tasks";
import { cn } from "@/lib/utils";
import { StatusMark } from "./task-controls";
import type { BoardPreferences } from "./task-preferences";

export function TaskBoards({
  boards,
  projects,
  projectId,
  tasks,
  allTasks,
  preferences,
  onPreferences,
  statusFilter,
  canEdit,
  busy,
  quickDestination,
  quickCreate,
  renderCard,
  onQuick,
  onConfigure,
  onNewBlock,
  onDragOver,
  onDrop,
  dropHint,
}: {
  boards: TaskBoard[];
  projects: TaskProject[];
  projectId: string;
  tasks: Task[];
  allTasks: Task[];
  preferences: BoardPreferences;
  onPreferences: (patch: Partial<BoardPreferences>) => void;
  statusFilter: TaskStatus | "";
  canEdit: boolean;
  busy: boolean;
  quickDestination: TaskDestination | null;
  quickCreate: (destination: TaskDestination) => ReactNode;
  renderCard: (task: Task) => ReactNode;
  onQuick: (destination: TaskDestination) => void;
  onConfigure: (board: TaskBoard) => void;
  onNewBlock: () => void;
  onDragOver: (
    event: DragEvent,
    destination: TaskDestination,
    beforeId: string | null,
  ) => void;
  onDrop: (
    event: DragEvent,
    destination: TaskDestination,
    beforeId: string | null,
  ) => void;
  dropHint: { laneKey: string; beforeId: string | null } | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const scopes: (string | null)[] = projectId
    ? [projectId === "none" ? null : projectId]
    : [
        ...new Set([
          ...tasks.map((t) => t.projectId),
          ...boards.map((b) => b.projectId),
        ]),
      ];
  if (!scopes.length) scopes.push(null);
  const allBoards = projectId
    ? scopes.flatMap((id) => boardsForProject(boards, id))
    : [
        { ...defaultBoard(null), id: "aggregate", name: "Demandas" },
        ...boards.filter((b) => !b.isDefault),
      ];
  const toggle = (key: string, field: "collapsedBlocks" | "collapsedColumns") =>
    onPreferences({
      [field]: preferences[field].includes(key)
        ? preferences[field].filter((v) => v !== key)
        : [...preferences[field], key],
    });
  const scrollDrag = (event: DragEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    if (event.clientX < r.left + 45) event.currentTarget.scrollLeft -= 18;
    else if (event.clientX > r.right - 45) event.currentTarget.scrollLeft += 18;
  };
  return (
    <div
      className="space-y-6"
      style={{ "--task-visible": preferences.density } as CSSProperties}
    >
      {allBoards.map((board) => {
        const aggregate = board.id === "aggregate";
        const collapsed = preferences.collapsedBlocks.includes(board.id);
        const boardTasks = tasks.filter((t) =>
          aggregate
            ? taskPlacement(t, boards).board.isDefault
            : taskPlacement(t, boards).board.id === board.id,
        );
        const columns = board.columns.filter(
          (c) => !statusFilter || c.status === statusFilter,
        );
        const project = projects.find((p) => p.id === board.projectId);
        return (
          <section
            key={board.id}
            className="min-w-0"
            aria-label={`Bloco ${board.name}`}
            data-board-id={board.id}
          >
            <div className="mb-2 flex min-h-8 flex-wrap items-center gap-1.5">
              <button
                onClick={() => toggle(board.id, "collapsedBlocks")}
                aria-expanded={!collapsed}
                className="flex min-w-0 items-center gap-1.5 text-body font-semibold text-ink"
              >
                {collapsed ? (
                  <ChevronRight className="size-3.5 shrink-0 text-muted" />
                ) : (
                  <ChevronDown className="size-3.5 shrink-0 text-muted" />
                )}
                <span className="truncate">{board.name}</span>
              </button>
              {!projectId && project && (
                <span className="max-w-44 truncate text-[11px] text-muted">
                  · {project.name}
                </span>
              )}
              <span className="text-[11px] tabular-nums text-muted">
                {boardTasks.length}
              </span>
              {canEdit && !aggregate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 text-[11px]"
                  aria-label={`Organizar bloco ${board.name}`}
                  disabled={busy}
                  onClick={() => onConfigure(board)}
                >
                  <Settings2 />
                  <span className="hidden sm:inline">Colunas</span>
                </Button>
              )}
            </div>
            {!collapsed && (
              <div
                className="wp-task-board-scroll scrollbar-thin overflow-x-auto pb-2"
                onDragOverCapture={scrollDrag}
              >
                <div className="wp-task-board-row flex items-stretch gap-2.5">
                  {columns.map((column) => {
                    const destination: TaskDestination = {
                        ...columnDestination(board, column),
                        ...(aggregate ? { aggregate: true } : {}),
                      },
                      key = laneKey(destination);
                    const isCollapsed =
                      preferences.collapsedColumns.includes(key);
                    const items = boardTasks.filter((t) =>
                      aggregate
                        ? t.status === column.status
                        : taskPlacement(t, boards).column?.id === column.id,
                    );
                    const total = allTasks.filter((t) => {
                      if (t.archivedAt) return false;
                      const p = taskPlacement(t, boards);
                      return aggregate
                        ? p.board.isDefault && t.status === column.status
                        : p.board.id === board.id && p.column?.id === column.id;
                    }).length;
                    const overLimit =
                      column.limit !== null && total > column.limit;
                    const capacity =
                      column.limit === null
                        ? String(items.length)
                        : `${total}/${column.limit}`;
                    const limited =
                      preferences.limit && !expanded.has(key)
                        ? items.slice(0, preferences.limit)
                        : items;
                    const capturing =
                      quickDestination && laneKey(quickDestination) === key;
                    return (
                      <section
                        key={column.id}
                        aria-label={column.name}
                        data-stage={column.status}
                        data-column-id={column.id}
                        data-over-limit={overLimit || undefined}
                        className={cn(
                          "wp-task-lane shrink-0 rounded-xl p-2",
                          isCollapsed && "wp-task-lane-collapsed",
                          dropHint?.laneKey === key &&
                            !dropHint.beforeId &&
                            "wp-task-lane-target",
                        )}
                        style={
                          preferences.widths[key] && !isCollapsed
                            ? { flexBasis: preferences.widths[key] }
                            : undefined
                        }
                        onDragOver={(e) => onDragOver(e, destination, null)}
                        onDrop={(e) => onDrop(e, destination, null)}
                      >
                        {isCollapsed ? (
                          <button
                            className="flex h-full min-h-36 w-full flex-col items-center gap-3 py-2 text-muted"
                            onClick={() => toggle(key, "collapsedColumns")}
                            aria-label={`Expandir coluna ${column.name}`}
                          >
                            <ChevronsLeftRight className="size-4" />
                            <span className="text-[11px] tabular-nums">
                              {items.length}
                            </span>
                            <span className="max-h-52 text-xs font-medium [writing-mode:vertical-rl]">
                              {column.name}
                            </span>
                          </button>
                        ) : (
                          <>
                            <div className="mb-2 flex min-h-7 items-center gap-1.5 px-0.5">
                              <StatusMark
                                status={column.status}
                                className="size-4 rounded [&_svg]:size-3"
                              />
                              <h2
                                className="min-w-0 flex-1 truncate text-[11px] font-semibold"
                                title={column.name}
                              >
                                {column.name}
                              </h2>
                              <span
                                className={cn(
                                  "text-[11px] tabular-nums",
                                  overLimit
                                    ? "font-semibold text-amber-ink"
                                    : "text-muted",
                                )}
                                aria-label={
                                  column.limit === null
                                    ? undefined
                                    : `Capacidade de ${column.name}: ${total} de ${column.limit}${overLimit ? ", acima do limite" : ""}`
                                }
                                title={
                                  column.limit === null
                                    ? undefined
                                    : "Capacidade considera todas as tarefas da coluna, inclusive as ocultas pelos filtros."
                                }
                              >
                                {capacity}
                              </span>
                              {canEdit && (
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  className="size-6"
                                  disabled={busy}
                                  aria-label={`Adicionar em ${column.name}`}
                                  onClick={() => onQuick(destination)}
                                >
                                  <Plus />
                                </Button>
                              )}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="size-6"
                                    aria-label={`Exibição da coluna ${column.name}`}
                                  >
                                    <MoreHorizontal />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="end"
                                  className="w-64 space-y-4"
                                >
                                  <p className="text-xs font-semibold">
                                    {column.name}
                                  </p>
                                  {column.limit !== null && (
                                    <p className="text-xs leading-5 text-muted">
                                      {total} tarefas · limite sugerido de{" "}
                                      {column.limit}.{" "}
                                      {overLimit
                                        ? "Há mais tarefas que a capacidade definida."
                                        : "Dentro da capacidade definida."}
                                    </p>
                                  )}
                                  <label className="block space-y-2 text-xs text-muted">
                                    <span>
                                      Largura ·{" "}
                                      {preferences.widths[key]
                                        ? `${preferences.widths[key]} px`
                                        : "Automática"}
                                    </span>
                                    <input
                                      type="range"
                                      aria-label={`Largura da coluna ${column.name}`}
                                      className="w-full accent-accent"
                                      min={200}
                                      max={420}
                                      step={10}
                                      value={preferences.widths[key] ?? 230}
                                      onChange={(e) =>
                                        onPreferences({
                                          widths: {
                                            ...preferences.widths,
                                            [key]: Number(e.target.value),
                                          },
                                        })
                                      }
                                    />
                                  </label>
                                  <div className="flex flex-col items-start gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const widths = {
                                          ...preferences.widths,
                                        };
                                        delete widths[key];
                                        onPreferences({ widths });
                                      }}
                                    >
                                      Largura automática
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        toggle(key, "collapsedColumns")
                                      }
                                    >
                                      <ChevronsLeftRight />
                                      Recolher coluna
                                    </Button>
                                    {canEdit && !aggregate && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={busy}
                                        onClick={() => onConfigure(board)}
                                      >
                                        <Settings2 />
                                        Nomes e ordem das etapas
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div className="space-y-2">
                              {capturing && quickCreate(destination)}
                              {limited.map(renderCard)}
                            </div>
                            {!items.length && !capturing && (
                              <p className="px-1 py-5 text-[11px] text-muted">
                                {column.status === "done"
                                  ? "Entregas concluídas"
                                  : "Solte uma tarefa aqui"}
                              </p>
                            )}
                            {!!preferences.limit &&
                              items.length > preferences.limit && (
                                <button
                                  className="mt-2 w-full rounded-control py-1.5 text-[11px] text-accent-ink hover:bg-surface"
                                  onClick={() =>
                                    setExpanded((old) => {
                                      const next = new Set(old);
                                      if (next.has(key)) next.delete(key);
                                      else next.add(key);
                                      return next;
                                    })
                                  }
                                >
                                  {expanded.has(key)
                                    ? "Mostrar menos"
                                    : `Ver mais ${items.length - limited.length}`}
                                </button>
                              )}
                            {dropHint?.laneKey === key &&
                              !dropHint.beforeId && (
                                <div className="mt-2 h-1 rounded-full bg-accent" />
                              )}
                            {canEdit && !capturing && (
                              <button
                                disabled={busy}
                                onClick={() => onQuick(destination)}
                                className="mt-1 flex min-h-8 w-full items-center gap-1.5 rounded-control px-1 text-[11px] text-muted hover:bg-surface hover:text-ink"
                              >
                                <Plus className="size-3" />
                                Adicionar tarefa
                              </button>
                            )}
                          </>
                        )}
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
      {canEdit && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted"
          disabled={busy}
          onClick={onNewBlock}
        >
          <Plus />
          Novo bloco
        </Button>
      )}
    </div>
  );
}
export function laneKey(destination: TaskDestination) {
  return `${destination.aggregate ? "all" : (destination.projectId ?? "none")}:${destination.blockId ?? "default"}:${destination.columnId ?? destination.status}`;
}
