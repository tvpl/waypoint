"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import {
  Archive,
  Bell,
  ArrowDownWideNarrow,
  CalendarDays,
  CheckCheck,
  ListChecks,
  Eye,
  EyeOff,
  FileBarChart2,
  ChevronRight,
  CircleDashed,
  Folder,
  Inbox,
  LayoutGrid,
  List,
  ListTodo,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Sun,
  Timer,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  archiveTaskAction,
  changeTasksAction,
  deleteProjectAction,
  importTasksAction,
  moveTaskAction,
  saveProjectAction,
  saveBoardAction,
  saveTemplateAction,
  deleteTemplateAction,
  previewTaskUpdatesAction,
  applyTaskUpdatesAction,
  saveTaskAction,
  toggleTaskStarAction,
} from "@/app/(app)/tasks/actions";
import { Button } from "@/components/ui/button";
import { Input, selectClass } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  STATUS_LABELS,
  TASK_STATUSES,
  PRIORITY_LABELS,
  PENDING_LABELS,
  exportTasksMarkdown,
  fold,
  localDate,
  type Task,
  type TaskColor,
  type TaskInput,
  type TaskProject,
  type TaskStatus,
  type TaskBulkChange,
} from "@/domain/tasks";
import { cn } from "@/lib/utils";
import { overlayOpen } from "@/lib/dom";
import { QuickTask } from "./task-controls";
import { TaskBulkBar } from "./task-bulk-bar";
import { TaskEditor } from "./task-editor";
import { TaskCard } from "./task-card";
import { MarkdownDialog, ProjectDialog, copyMarkdown } from "./task-dialogs";
import {
  boardsForProject,
  columnDestination,
  taskPlacement,
  type TaskBoard,
  type TaskDestination,
} from "@/domain/task-board";
import { parseQuickTask } from "@/domain/task-capture";
import { TaskBoards, laneKey } from "./task-board";
import type { TaskTemplate } from "@/domain/task-template";
import { TaskTemplateDialog } from "./task-template-dialog";
import { MarkdownUpdateDialog } from "./task-markdown-update";
import { TaskBoardEditor } from "./task-board-editor";
import { TaskReminders, type ReminderLaunch } from "./task-reminders";
import { TaskReportDialog } from "./task-report-dialog";
import { TaskHideControl } from "./task-hide-control";
import {
  activeHideRules,
  describeHideRules,
  hiddenByRules,
  noHideRules,
} from "@/domain/task-visibility";
import type { TaskReminder } from "@/domain/task-reminders";
import {
  BoardDisplaySettings,
  SavedTaskViews,
  useTaskPreferences,
  type ViewFilters,
} from "./task-preferences";

export type Scope =
  | "all"
  | "today"
  | "week"
  | "waiting"
  | "done"
  | "archived"
  | "followup";
const SCOPES = [
  {
    id: "all",
    title: "Todas as tarefas",
    icon: Inbox,
    subtitle: "Tire as ideias da cabeça. Encontre seu próximo passo.",
  },
  {
    id: "today",
    title: "Meu dia",
    icon: Sun,
    subtitle: "Um pouco de foco para o que merece atenção agora.",
  },
  {
    id: "week",
    title: "Próximos 7 dias",
    icon: CalendarDays,
    subtitle: "Prepare os próximos passos com tranquilidade.",
  },
  {
    id: "waiting",
    title: "Aguardando",
    icon: Timer,
    subtitle: "Acompanhe o que depende de um retorno ou de outra pessoa.",
  },
  {
    id: "followup",
    title: "Acompanhar",
    icon: Timer,
    subtitle: "Retornos e tarefas para revisitar.",
  },
  {
    id: "done",
    title: "Concluídas",
    icon: CheckCheck,
    subtitle: "Cada pequeno passo conta. Veja o que já avançou.",
  },
  {
    id: "archived",
    title: "Arquivadas",
    icon: Archive,
    subtitle: "Fora do caminho, disponíveis quando precisar.",
  },
] as const;
type Result = { ok: true; data: unknown } | { ok: false; error: string };
export function TaskWorkspace({
  tasks: sourceTasks,
  projects,
  boards,
  templates,
  reminders: sourceReminders,
  preferenceKey,
  members,
  canEdit,
  workspaceName,
  openId,
  starred: sourceStarred = [],
  meId = "",
  isOwner = false,
  initial = {},
}: {
  starred?: string[];
  meId?: string;
  isOwner?: boolean;
  /** From the URL: ?scope=today, ?project=<id>, ?new=1, ?report=1 (home shortcuts). */
  initial?: { scope?: Scope; projectId?: string; compose?: boolean; report?: boolean };
  tasks: Task[];
  projects: TaskProject[];
  boards: TaskBoard[];
  templates: TaskTemplate[];
  reminders: TaskReminder[];
  preferenceKey: string;
  members: string[];
  canEdit: boolean;
  workspaceName: string;
  openId: string | null;
}) {
  const [tasks, optimistic] = useOptimistic(sourceTasks);
  const [busy, start] = useTransition();
  const [templateDialog, setTemplateDialog] = useState(false);
  const [markdownUpdate, setMarkdownUpdate] = useState(false);
  const [reminderDialog, setReminderDialog] = useState<ReminderLaunch | null>(
    null,
  );
  const [reminders, setReminders] = useState(sourceReminders);
  useEffect(() => setReminders(sourceReminders), [sourceReminders]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reminders") === "1")
      setReminderDialog({});
  }, []);
  const [scope, setScope] = useState<Scope>(initial.scope ?? "all");
  const [projectId, setProjectId] = useState(
    initial.projectId &&
      (initial.projectId === "none" ||
        projects.some((p) => p.id === initial.projectId))
      ? initial.projectId
      : "",
  );
  const [starred, setStarred] = useState(() => new Set(sourceStarred));
  const [hideOpen, setHideOpen] = useState(false);
  const [report, setReport] = useState(!!initial.report);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [hideDone, setHideDone] = useState(false);
  const [quickDestination, setQuickDestination] =
    useState<TaskDestination | null>(null);
  const [pending, setPending] = useState<ViewFilters["pending"]>("");
  const [boardEditor, setBoardEditor] = useState<TaskBoard | "new" | null>(
    null,
  );
  const { preferences, setPreferences, views, saveView, removeView } =
    useTaskPreferences(preferenceKey, projectId);
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [priority, setPriority] = useState("");
  const [tag, setTag] = useState("");
  const [person, setPerson] = useState("");
  const [sort, setSort] = useState<"manual" | "due" | "priority">("manual");
  const [today, setToday] = useState(localDate);
  const [editor, setEditor] = useState<{
    task: Task | null;
    defaults: Partial<TaskInput>;
  } | null>(null);
  const [projectEditor, setProjectEditor] = useState<
    TaskProject | "new" | null
  >(null);
  const [markdown, setMarkdown] = useState<"import" | "export" | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{
    laneKey: string;
    beforeId: string | null;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastOpen = useRef<string | null>(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("wp-tasks-view");
      if (stored === "board" || stored === "list") setView(stored);
    } catch {}
    const timer = setInterval(() => setToday(localDate()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (openId && lastOpen.current !== openId) {
      const task = sourceTasks.find((t) => t.id === openId);
      if (task) {
        setEditor({ task, defaults: {} });
        lastOpen.current = openId;
      }
    }
  }, [openId, sourceTasks]);
  const newTask = useCallback(
    (status?: TaskStatus, title = "", destination?: TaskDestination) => {
      if (canEdit && !busy)
        setEditor({
          task: null,
          defaults: {
            title,
            color: "neutral",
            status:
              status ??
              (scope === "waiting"
                ? "waiting"
                : scope === "done"
                  ? "done"
                  : "todo"),
            projectId: projectId && projectId !== "none" ? projectId : null,
            dueDate: scope === "today" ? today : null,
            ...destination,
            ...(title.trim()
              ? parseQuickTask(
                  title,
                  {
                    projectId:
                      projectId && projectId !== "none" ? projectId : null,
                    status: status ?? "todo",
                    dueDate: scope === "today" ? today : null,
                    ...destination,
                  },
                  today,
                )
              : {}),
          },
        });
    },
    [canEdit, busy, projectId, projects, scope, today],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selecting && !overlayOpen()) {
        setSelecting(false);
        setSelection(new Set());
        return;
      }
      const target = e.target as HTMLElement;
      if (
        overlayOpen() ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      )
        return;
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        newTask();
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [newTask, selecting]);
  useEffect(() => {
    setSelection(new Set());
    setQuickDestination(null);
  }, [
    scope,
    projectId,
    query,
    priority,
    tag,
    person,
    statusFilter,
    hideDone,
    pending,
  ]);
  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );
  const active = tasks.filter((t) => !t.archivedAt);
  const weekEnd = new Date(`${today}T12:00:00`);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekDate = localDate(weekEnd);
  const matchesScope = (t: Task, s: Scope) => {
    if (s === "archived") return !!t.archivedAt;
    if (t.archivedAt) return false;
    if (s === "today")
      return t.status !== "done" && !!t.dueDate && t.dueDate <= today;
    if (s === "week")
      return (
        t.status !== "done" &&
        !!t.dueDate &&
        t.dueDate >= today &&
        t.dueDate < weekDate
      );
    if (s === "waiting") return t.status === "waiting";
    if (s === "followup")
      return t.status !== "done" && !!t.followUpDate && t.followUpDate <= today;
    if (s === "done") return t.status === "done";
    return true;
  };
  const now = useMemo(() => new Date(), [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const hideRules = preferences.hide ?? noHideRules();
  const exemptStages: TaskStatus[] =
    scope === "archived"
      ? [...TASK_STATUSES]
      : [
          ...(statusFilter ? [statusFilter] : []),
          ...(scope === "done" ? (["done"] as const) : []),
          ...(scope === "waiting" ? (["waiting"] as const) : []),
        ];
  const matching = tasks
    .filter((t) => {
      if (
        !matchesScope(t, scope) ||
        (statusFilter && t.status !== statusFilter) ||
        (hideDone &&
          scope !== "done" &&
          scope !== "archived" &&
          t.status === "done") ||
        (projectId === "none"
          ? !!t.projectId
          : projectId && t.projectId !== projectId) ||
        (priority && t.priority !== priority) ||
        (tag && !t.tags.includes(tag)) ||
        (person && !t.people.includes(person)) ||
        (pending && (!t.pendingNote || t.pendingKind !== pending))
      )
        return false;
      const haystack = fold(
        [
          t.title,
          t.description,
          t.pendingNote,
          t.pendingNote ? PENDING_LABELS[t.pendingKind] : "",
          ...t.tags,
          ...t.people,
          ...t.subtasks.map((s) => s.title),
          t.projectId ? (projectMap.get(t.projectId)?.name ?? "") : "",
        ].join(" "),
      );
      return query
        .trim()
        .split(/\s+/)
        .every((term) =>
          term.startsWith("#")
            ? t.tags.some((tag) => fold(tag).includes(fold(term.slice(1))))
            : term.startsWith("@")
              ? t.people.some((person) =>
                  fold(person).includes(fold(term.slice(1))),
                )
              : haystack.includes(fold(term)),
        );
    });
  const visible = matching
    .filter((t) => !hiddenByRules(t, hideRules, now, exemptStages))
    .sort((a, b) => {
      if (sort === "due")
        return (
          (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
          a.sortOrder - b.sortOrder
        );
      if (sort === "priority") {
        const rank = { high: 0, medium: 1, low: 2, none: 3 };
        return rank[a.priority] - rank[b.priority] || a.sortOrder - b.sortOrder;
      }
      return a.sortOrder - b.sortOrder;
    });
  const tags = [...new Set(tasks.flatMap((t) => t.tags))].sort();
  const people = [...new Set(tasks.flatMap((t) => t.people))].sort();
  const currentScope = SCOPES.find((s) => s.id === scope)!;
  const currentProject = projectMap.get(projectId);
  const filterCount =
    Number(!!priority) +
    Number(!!tag) +
    Number(!!person) +
    Number(!!statusFilter) +
    Number(!!pending);
  const hiddenCount = matching.length - visible.length;
  const hiding = activeHideRules(hideRules).length > 0;
  const filtering = !!(query || projectId || filterCount || hideDone);
  const list = view === "list" || scope === "archived";
  const projectTasks = active.filter(
    (t) =>
      !projectId ||
      (projectId === "none" ? !t.projectId : t.projectId === projectId),
  );
  const pendingCount = projectTasks.filter((t) => t.status !== "done").length;
  const selectedTasks = visible.filter((t) => selection.has(t.id));
  const toggleSelection = (id: string) =>
    setSelection((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < 200) next.add(id);
      else toast.info("Selecione até 200 tarefas por vez.");
      return next;
    });
  const changeView = (v: "board" | "list") => {
    setView(v);
    try {
      localStorage.setItem("wp-tasks-view", v);
    } catch {}
  };
  const perform = (
    action: () => Promise<Result>,
    onSuccess?: () => void,
    optimisticChange?: () => void,
  ): Promise<boolean> =>
    new Promise((resolve) => {
      start(async () => {
        optimisticChange?.();
        try {
          const result = await action();
          if (!result.ok) {
            toast.error(result.error);
            resolve(false);
            return;
          }
          onSuccess?.();
          resolve(true);
        } catch {
          toast.error(
            "Não foi possível conectar. Suas alterações não foram salvas. Tente novamente.",
          );
          resolve(false);
        }
      });
    });
  const toggleStar = (id: string) => {
    const on = !starred.has(id);
    const flip = (value: boolean) =>
      setStarred((current) => {
        const next = new Set(current);
        if (value) next.add(id);
        else next.delete(id);
        return next;
      });
    flip(on);
    toggleTaskStarAction(id)
      .then((r) => {
        if (!r.ok) {
          flip(!on);
          toast.error(r.error);
        } else
          toast.success(
            on ? "Marcada como importante." : "Removida de importantes.",
          );
      })
      .catch(() => {
        flip(!on);
        toast.error("Não foi possível conectar. Tente novamente.");
      });
  };
  useEffect(() => {
    if (initial.compose) newTask();
    if (initial.scope || initial.projectId || initial.compose || initial.report) {
      // Shortcut parameters apply once; a reload shouldn't repeat them.
      const url = new URL(window.location.href);
      ["scope", "project", "new", "report"].forEach((k) =>
        url.searchParams.delete(k),
      );
      window.history.replaceState(null, "", url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const patchTask = (task: Task, patch: Partial<TaskInput>) =>
    void perform(
      () => saveTaskAction(patch, task.id, task.version),
      undefined,
      () =>
        optimistic(
          tasks.map((t) => (t.id === task.id ? { ...t, ...patch } : t)),
        ),
    );
  const move = (
    task: Task,
    destination: TaskDestination,
    beforeId: string | null,
  ) => {
    if (busy || !canEdit || task.id === beforeId) return;
    void perform(
      () =>
        moveTaskAction(
          task.id,
          task.version,
          destination.status,
          beforeId,
          destination,
        ),
      undefined,
      () => {
        const targetKey = laneKey(destination);
        const defaultForTask = boardsForProject(boards, task.projectId).find(
          (b) => b.isDefault,
        )!;
        const actualDestination = destination.aggregate
          ? columnDestination(
              defaultForTask,
              defaultForTask.columns.find(
                (c) => c.status === destination.status,
              )!,
            )
          : destination;
        const others = tasks
          .filter((t) => {
            const p = taskPlacement(t, boards);
            return (
              t.id !== task.id &&
              !t.archivedAt &&
              (destination.aggregate
                ? p.board.isDefault && t.status === destination.status
                : p.column &&
                  laneKey(columnDestination(p.board, p.column)) === targetKey)
            );
          })
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const i = beforeId
          ? others.findIndex((t) => t.id === beforeId)
          : others.length;
        others.splice(i < 0 ? others.length : i, 0, {
          ...task,
          ...actualDestination,
        });
        const positions = new Map(others.map((t, index) => [t.id, index]));
        optimistic(
          tasks.map((t) =>
            positions.has(t.id)
              ? {
                  ...t,
                  ...(t.id === task.id ? actualDestination : {}),
                  sortOrder: positions.get(t.id)!,
                }
              : t,
          ),
        );
      },
    );
  };
  const finishDrag = () => {
    setDragged(null);
    setDropHint(null);
  };
  const dragOver = (
    e: DragEvent,
    destination: TaskDestination,
    beforeId: string | null,
  ) => {
    if (
      !dragged ||
      !canEdit ||
      selecting ||
      busy ||
      sort !== "manual" ||
      scope === "archived"
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const key = laneKey(destination);
    if (dropHint?.laneKey !== key || dropHint.beforeId !== beforeId)
      setDropHint({ laneKey: key, beforeId });
  };
  const drop = (
    e: DragEvent,
    destination: TaskDestination,
    beforeId: string | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const task = tasks.find((t) => t.id === dragged);
    if (task && sort === "manual" && scope !== "archived")
      move(task, destination, beforeId);
    finishDrag();
  };
  const destinationFor = (task: Task) => {
    const p = taskPlacement(task, boards);
    if (!projectId && !list && p.board.isDefault)
      return {
        aggregate: true,
        blockId: null,
        columnId: null,
        projectId: null,
        status: task.status,
      };
    return p.column
      ? columnDestination(p.board, p.column)
      : {
          blockId: null,
          columnId: null,
          status: task.status,
          projectId: task.projectId,
        };
  };
  const card = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      project={task.projectId ? projectMap.get(task.projectId) : undefined}
      today={today}
      fields={preferences.fields}
      dependencies={tasks.filter((related) =>
        task.dependsOn.includes(related.id),
      )}
      reminderCount={reminders.filter((r) => r.taskId === task.id).length}
      starred={starred.has(task.id)}
      onOpenTask={(id) => {
        const related = tasks.find((t) => t.id === id);
        if (related) setEditor({ task: related, defaults: {} });
      }}
      stageName={taskPlacement(task, boards).column?.name}
      destinations={boardsForProject(boards, task.projectId).flatMap((b) =>
        b.columns.map((c) => ({
          name:
            boardsForProject(boards, task.projectId).length > 1
              ? `${b.name} / ${c.name}`
              : c.name,
          value: columnDestination(b, c),
        })),
      )}
      list={list}
      canEdit={canEdit}
      canDrag={canEdit && sort === "manual" && !selecting}
      selecting={selecting}
      selected={selection.has(task.id)}
      onSelect={() => toggleSelection(task.id)}
      busy={busy}
      dragging={dragged === task.id}
      dropTarget={dropHint?.beforeId === task.id}
      onDragStart={(e) => {
        if (sort !== "manual" || selecting) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        setDragged(task.id);
      }}
      onDragEnd={finishDrag}
      onDragOver={(e) => dragOver(e, destinationFor(task), task.id)}
      onDrop={(e) => drop(e, destinationFor(task), task.id)}
      commands={{
        remind: () =>
          setReminderDialog({
            taskId: task.id,
            compose: !reminders.some((r) => r.taskId === task.id),
          }),
        edit: () => setEditor({ task, defaults: {} }),
        star: () => toggleStar(task.id),
        patch: (p) => patchTask(task, p),
        archive: () =>
          void perform(
            () => archiveTaskAction(task.id, task.version, !task.archivedAt),
            () =>
              toast.success(
                task.archivedAt ? "Tarefa restaurada." : "Tarefa arquivada.",
                {
                  action: task.archivedAt
                    ? undefined
                    : {
                        label: "Desfazer",
                        onClick: () =>
                          void perform(() =>
                            archiveTaskAction(task.id, task.version + 1, false),
                          ),
                      },
                },
              ),
          ),
        duplicate: () =>
          void perform(
            () =>
              saveTaskAction({
                ...task,
                title: `${task.title.slice(0, 290)} (cópia)`,
              }),
            () => toast.success("Tarefa duplicada."),
          ),
        copy: () =>
          void copyMarkdown(
            exportTasksMarkdown([task], projects, boards, sourceTasks),
          ),
        reorder: (direction) => {
          if (sort !== "manual")
            return toast.info("Selecione a ordem manual para reorganizar.");
          const siblings = tasks
            .filter(
              (t) =>
                !t.archivedAt &&
                laneKey(destinationFor(t)) === laneKey(destinationFor(task)),
            )
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const index = siblings.findIndex((t) => t.id === task.id);
          if (direction === -1 && index > 0)
            move(task, destinationFor(task), siblings[index - 1].id);
          if (direction === 1 && index < siblings.length - 1)
            move(task, destinationFor(task), siblings[index + 2]?.id ?? null);
        },
      }}
    />
  );
  const quickCreate = (destination: TaskDestination) => (
    <QuickTask
      key={`${laneKey(destination)}-${projectId}`}
      status={destination.status}
      busy={busy}
      onClose={() => setQuickDestination(null)}
      onExpand={(title) => {
        try {
          newTask(destination.status, title, destination);
          setQuickDestination(null);
        } catch {
          toast.error("Dê um título à tarefa antes das marcações.");
        }
      }}
      onCreate={(text) => {
        let input: TaskInput;
        try {
          input = parseQuickTask(
            text,
            {
              ...destination,
              color: "neutral",
              dueDate: scope === "today" ? today : null,
            },
            today,
          );
        } catch (e) {
          toast.error(
            e instanceof Error
              ? "Revise a captura: informe um título, até 20 marcadores e 20 pessoas."
              : "Revise a tarefa.",
          );
          return Promise.resolve(false);
        }
        return perform(
          () => saveTaskAction(input),
          () => toast.success("Tarefa adicionada."),
        );
      }}
    />
  );
  const clearFilters = () => {
    setQuery("");
    setPriority("");
    setTag("");
    setPerson("");
    setStatusFilter("");
    setHideDone(false);
    setPending("");
  };
  const bulkChange = (change: TaskBulkChange) =>
    void perform(
      () =>
        changeTasksAction(
          selectedTasks.map(({ id, version }) => ({ id, version })),
          change,
        ),
      () => {
        setSelection(new Set());
        setSelecting(false);
        toast.success("Seleção atualizada.");
      },
    );
  const filters: ViewFilters = {
    scope,
    projectId,
    query,
    statusFilter,
    hideDone,
    priority: priority as ViewFilters["priority"],
    tag,
    person,
    pending,
    sort,
    hide: hideRules,
  };
  const applyView = (value: ViewFilters) => {
    if (
      value.projectId &&
      value.projectId !== "none" &&
      !projectMap.has(value.projectId)
    ) {
      toast.error("O projeto desta visão não está mais disponível.");
      return;
    }
    setScope(value.scope);
    setProjectId(value.projectId);
    setQuery(value.query);
    setStatusFilter(value.statusFilter);
    setHideDone(value.hideDone);
    setPriority(value.priority);
    setTag(value.tag);
    setPerson(value.person);
    setPending(value.pending);
    setSort(value.sort);
    if (value.hide) setPreferences({ hide: value.hide });
  };
  const boardStatusFilter =
    statusFilter ||
    (scope === "waiting" ? "waiting" : scope === "done" ? "done" : "");
  const scopeDestination: TaskDestination = {
    blockId: null,
    columnId: null,
    status: scope === "waiting" ? "waiting" : "todo",
    projectId: projectId && projectId !== "none" ? projectId : null,
  };
  return (
    <div className="wp-tasks relative flex min-h-0 min-w-0 flex-1 flex-col">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="wp-task-header shrink-0 px-4 pb-3 pt-4 sm:px-6">
          <div className="mb-3 flex items-center gap-1.5 pr-24 text-[11px] text-muted">
            <span className="max-w-40 truncate">{workspaceName}</span>
            <ChevronRight className="size-3" />
            <span>Demandas</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 max-w-full break-words text-[23px] font-semibold tracking-[-.035em]">
              {currentProject?.name ??
                (projectId === "none" ? "Sem projeto" : currentScope.title)}
            </h1>
            <span className="text-[11px] text-muted">
              {pendingCount} em aberto
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                data-tour="tasks-reminders"
                aria-label="Meus lembretes"
                onClick={() =>
                  setReminderDialog({
                    target: projectId ? `project:${projectId}` : "visible",
                  })
                }
              >
                <Bell />
                <span className="hidden sm:inline">Lembretes</span>
                {reminders.length > 0 && (
                  <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] tabular-nums text-accent-ink">
                    {reminders.length}
                  </span>
                )}
              </Button>
              {!list && (
                <div
                  className="flex items-center rounded-lg border border-line bg-surface p-0.5"
                  role="group"
                  aria-label="Colunas por linha"
                >
                  <span className="px-2 text-[11px] text-muted">Por linha</span>
                  {([3, 4] as const).map((n) => (
                    <button
                      key={n}
                      onClick={() => setPreferences({ density: n, widths: {} })}
                      aria-pressed={preferences.density === n}
                      aria-label={`${n} colunas por linha`}
                      className={cn(
                        "size-7 rounded-md text-[11px]",
                        preferences.density === n
                          ? "bg-accent-soft font-semibold text-accent-ink"
                          : "text-muted hover:bg-hover",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    data-tour="tasks-menu"
                    aria-label="Opções de tarefas"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && (
                    <>
                      <DropdownMenuItem onSelect={() => setMarkdown("import")}>
                        <Upload />
                        Importar Markdown
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setMarkdownUpdate(true)}
                      >
                        <Upload />
                        Atualizar via Markdown
                      </DropdownMenuItem>
                      {projectId && (
                        <DropdownMenuItem
                          onSelect={() => setTemplateDialog(true)}
                        >
                          <Folder />
                          Salvar como modelo
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => setProjectEditor("new")}
                      >
                        <Folder />
                        Novo projeto
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setBoardEditor("new")}>
                        <Plus />
                        Novo bloco
                      </DropdownMenuItem>
                      {currentProject && (
                        <DropdownMenuItem
                          onSelect={() => setProjectEditor(currentProject)}
                        >
                          <MoreHorizontal />
                          Editar projeto atual
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    onSelect={() =>
                      setPreferences({
                        hide: {
                          ...hideRules,
                          done: hideRules.done === "all" ? "show" : "all",
                        },
                      })
                    }
                  >
                    {hideRules.done === "all" ? <Eye /> : <EyeOff />}
                    {hideRules.done === "all"
                      ? "Mostrar concluídas"
                      : "Ocultar concluídas"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setHideOpen(true)}>
                    <SlidersHorizontal />
                    Ocultar por etapa e data…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setReport(true)}>
                    <FileBarChart2 />
                    Relatório de concluídas
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!visible.length}
                    onSelect={() => setMarkdown("export")}
                  >
                    <ListTodo />
                    Exportar visão em Markdown
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {canEdit && (
                <Button
                  variant="primary"
                  size="sm"
                  data-tour="tasks-new"
                  disabled={busy}
                  onClick={() => newTask()}
                >
                  <Plus />
                  Nova tarefa
                </Button>
              )}
            </div>
          </div>
          <nav
            className="mt-3 flex flex-wrap items-center gap-1"
            aria-label="Projetos de tarefas"
            data-tour="tasks-projects"
          >
            <button
              className={cn("wp-task-project", !projectId && "is-active")}
              onClick={() => {
                setProjectId("");
                setScope("all");
              }}
              aria-pressed={!projectId}
            >
              Todos
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                className={cn(
                  "wp-task-project",
                  projectId === p.id && "is-active",
                )}
                onClick={() => {
                  setProjectId(p.id);
                  setScope("all");
                }}
                aria-pressed={projectId === p.id}
              >
                <span
                  data-color={p.color}
                  className="wp-task-color size-1.5 shrink-0 rounded-full"
                />
                <span className="max-w-44 truncate">{p.name}</span>
              </button>
            ))}
            <button
              className={cn(
                "wp-task-project",
                projectId === "none" && "is-active",
              )}
              onClick={() => {
                setProjectId("none");
                setScope("all");
              }}
            >
              Sem projeto
            </button>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Novo projeto"
                disabled={busy}
                onClick={() => setProjectEditor("new")}
              >
                <Plus />
              </Button>
            )}
          </nav>
        </header>
        <div className="mx-4 flex shrink-0 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-1.5 sm:mx-6">
          <div className="relative min-w-40 flex-1" data-tour="tasks-search">
            <Search className="pointer-events-none absolute left-2 top-2 size-3.5 text-muted" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar tarefas"
              placeholder="Pesquisar, #tag ou @pessoa"
              maxLength={1000}
              className="h-8 border-transparent bg-transparent pl-7 pr-7 text-xs"
            />
            {query && (
              <button
                aria-label="Limpar busca"
                onClick={() => setQuery("")}
                className="absolute right-2 top-2"
              >
                <X className="size-3.5 text-muted" />
              </button>
            )}
          </div>
          <select
            aria-label="Visão de tarefas"
            data-tour="tasks-scope"
            className={cn(
              selectClass,
              "h-8 w-auto max-w-36 border-transparent text-xs",
            )}
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
          >
            {SCOPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={filterCount ? "soft" : "ghost"}
                size="sm"
                data-tour="tasks-filters"
              >
                <SlidersHorizontal />
                Filtros
                {filterCount > 0 && (
                  <span className="text-[11px]">{filterCount}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="space-y-3">
              <p className="text-sm font-semibold">Encontre seu foco</p>
              <label className="block space-y-1 text-xs text-muted">
                <span>Etapa</span>
                <select
                  aria-label="Filtrar por etapa"
                  className={selectClass}
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as TaskStatus | "")
                  }
                >
                  <option value="">Todas</option>
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs text-muted">
                <span>Prioridade</span>
                <select
                  aria-label="Filtrar por prioridade"
                  className={selectClass}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="">Todas</option>
                  {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs text-muted">
                <span>Marcador</span>
                <select
                  aria-label="Filtrar por marcador"
                  className={selectClass}
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                >
                  <option value="">Todos</option>
                  {tags.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs text-muted">
                <span>Pessoa de apoio</span>
                <select
                  aria-label="Filtrar por pessoa"
                  className={selectClass}
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                >
                  <option value="">Todas</option>
                  {people.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs text-muted">
                <span>Pendência</span>
                <select
                  aria-label="Filtrar por pendência"
                  className={selectClass}
                  value={pending}
                  onChange={(e) =>
                    setPending(e.target.value as ViewFilters["pending"])
                  }
                >
                  <option value="">Todas</option>
                  {Object.entries(PENDING_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                Limpar filtros
              </Button>
            </PopoverContent>
          </Popover>
          <TaskHideControl
            rules={hideRules}
            onChange={(hide) => setPreferences({ hide })}
            scopeLabel={
              currentProject?.name ??
              (projectId === "none" ? "Sem projeto" : "Todas as tarefas")
            }
            hiddenCount={hiddenCount}
            open={hideOpen}
            onOpenChange={setHideOpen}
          />
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <label
              className="flex items-center gap-1 text-muted"
              data-tour="tasks-sort"
            >
              <ArrowDownWideNarrow className="size-3.5" />
              <select
                aria-label="Ordenar tarefas"
                className="max-w-24 bg-transparent py-1 text-xs"
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
              >
                <option value="manual">Manual</option>
                <option value="due">Por data</option>
                <option value="priority">Prioridade</option>
              </select>
            </label>
            <BoardDisplaySettings
              preferences={preferences}
              onChange={setPreferences}
            />
            {canEdit && (
              <Button
                variant={selecting ? "soft" : "ghost"}
                size="icon-sm"
                data-tour="tasks-select"
                aria-label="Selecionar tarefas"
                aria-pressed={selecting}
                onClick={() => {
                  setSelecting(!selecting);
                  setSelection(new Set());
                }}
              >
                <ListChecks />
              </Button>
            )}
            <div
              className="flex rounded-lg border border-line p-0.5"
              role="group"
              data-tour="tasks-view"
              aria-label="Formato de visualização"
            >
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Quadro"
                aria-pressed={!list}
                className={!list ? "bg-subtle" : "text-muted"}
                onClick={() => changeView("board")}
              >
                <LayoutGrid />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Lista"
                aria-pressed={list}
                className={list ? "bg-subtle" : "text-muted"}
                onClick={() => changeView("list")}
              >
                <List />
              </Button>
            </div>
          </div>
        </div>
        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-1 px-4 pb-2 pt-2 sm:px-6"
          data-tour="tasks-saved-views"
        >
          <SavedTaskViews
            views={views}
            filters={filters}
            onApply={applyView}
            onSave={(name, value) => {
              saveView(name, value);
              toast.success("Visão salva neste dispositivo.");
            }}
            onRemove={removeView}
          />
          <span className="text-[11px] text-muted" role="status">
            {busy ? "Salvando…" : `${visible.length} tarefas`}
          </span>
        </div>
        {(filterCount > 0 || hideDone || hiding) && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-4 pb-3 sm:px-6">
            {[
              {
                value: statusFilter && STATUS_LABELS[statusFilter],
                clear: () => setStatusFilter(""),
              },
              {
                value:
                  priority &&
                  PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS],
                clear: () => setPriority(""),
              },
              { value: tag && `#${tag}`, clear: () => setTag("") },
              { value: person, clear: () => setPerson("") },
              {
                value: pending && PENDING_LABELS[pending],
                clear: () => setPending(""),
              },
              {
                value: hideDone ? "Concluídas ocultas" : "",
                clear: () => setHideDone(false),
              },
              {
                value: !hiding
                  ? ""
                  : activeHideRules(hideRules).join() === "done" &&
                      hideRules.done === "all"
                    ? "Concluídas ocultas"
                    : `Ocultas: ${describeHideRules(hideRules, STATUS_LABELS)} (${hiddenCount})`,
                clear: () => setPreferences({ hide: noHideRules() }),
              },
            ]
              .filter((f) => f.value)
              .map((f) => (
                <button
                  key={f.value as string}
                  onClick={f.clear}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-1 text-[11px] text-accent-ink"
                >
                  {f.value}
                  <X className="size-3" />
                </button>
              ))}
          </div>
        )}
        <div
          className={cn(
            "wp-task-body scrollbar-thin min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-5 pt-1 sm:px-6",
            selecting && "pb-28",
          )}
          aria-busy={busy}
          data-tour="tasks-board"
        >
          {visible.length === 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line px-4 py-4 text-body text-muted">
              <CircleDashed className="size-4" />
              {hiddenCount > 0 && matching.length === hiddenCount
                ? `${hiddenCount} ${hiddenCount === 1 ? "tarefa está oculta" : "tarefas estão ocultas"} pelas regras desta pasta.`
                : filtering
                ? "Nenhuma tarefa combina com essa combinação de filtros."
                : scope === "archived"
                  ? "As tarefas arquivadas aparecem aqui."
                  : "Comece por uma tarefa. Os detalhes podem vir depois."}
              {hiddenCount > 0 && matching.length === hiddenCount && (
                <button
                  onClick={() => setPreferences({ hide: noHideRules() })}
                  className="text-accent-ink underline"
                >
                  Mostrar tudo
                </button>
              )}
              {filtering && (
                <button
                  onClick={clearFilters}
                  className="text-accent-ink underline"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}
          {list ? (
            <div className="space-y-2">
              {quickDestination && quickCreate(quickDestination)}
              {visible.map(card)}
              {canEdit && scope !== "archived" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuickDestination(scopeDestination)}
                >
                  <Plus />
                  Adicionar tarefa
                </Button>
              )}
            </div>
          ) : (
            <TaskBoards
              boards={boards}
              projects={projects}
              projectId={projectId}
              tasks={visible}
              allTasks={tasks}
              preferences={preferences}
              onPreferences={setPreferences}
              statusFilter={boardStatusFilter}
              canEdit={canEdit}
              busy={busy}
              quickDestination={quickDestination}
              quickCreate={quickCreate}
              renderCard={card}
              onQuick={setQuickDestination}
              onConfigure={setBoardEditor}
              onNewBlock={() => setBoardEditor("new")}
              onDragOver={dragOver}
              onDrop={drop}
              dropHint={dropHint}
            />
          )}
        </div>
        {selecting && (
          <TaskBulkBar
            count={selectedTasks.length}
            visibleCount={visible.length}
            allSelected={
              !!visible.length && selectedTasks.length === visible.length
            }
            busy={busy}
            archived={scope === "archived"}
            today={today}
            projects={projects}
            onRemind={() =>
              setReminderDialog({ target: "selection", compose: true })
            }
            onSelectAll={() =>
              setSelection(
                selectedTasks.length === visible.length
                  ? new Set()
                  : new Set(visible.slice(0, 200).map((t) => t.id)),
              )
            }
            onChange={bulkChange}
            onExport={() =>
              void copyMarkdown(
                exportTasksMarkdown(
                  selectedTasks,
                  projects,
                  boards,
                  sourceTasks,
                ),
              )
            }
            onClose={() => {
              setSelecting(false);
              setSelection(new Set());
            }}
          />
        )}
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-[10px] text-muted sm:px-6">
          <span>
            {currentProject?.name ?? workspaceName}
            {!canEdit ? " · Somente leitura" : ""}
          </span>
          <span>
            {sort !== "manual"
              ? "Selecione Manual para arrastar"
              : "Arraste para organizar · Botão direito para ações · N para criar"}
          </span>
        </footer>
      </main>
      {editor && (
        <TaskEditor
          key={editor.task?.id ?? "new"}
          task={editor.task}
          defaults={editor.defaults}
          projects={projects}
          boards={boards}
          allTasks={tasks}
          onOpenTask={(id) => {
            const related = tasks.find((t) => t.id === id);
            if (related) setEditor({ task: related, defaults: {} });
          }}
          onRemind={
            editor.task
              ? () =>
                  setReminderDialog({
                    taskId: editor.task!.id,
                    compose: !reminders.some(
                      (r) => r.taskId === editor.task!.id,
                    ),
                  })
              : undefined
          }
          reminderCount={
            reminders.filter((r) => r.taskId === editor.task?.id).length
          }
          members={[...new Set([...members, ...people])]}
          canEdit={canEdit}
          busy={busy}
          starred={!!editor.task && starred.has(editor.task.id)}
          onToggleStar={
            editor.task ? () => toggleStar(editor.task!.id) : undefined
          }
          meId={meId}
          isOwner={isOwner}
          onClose={() => setEditor(null)}
          onSave={(data, task) =>
            perform(
              () => saveTaskAction(data, task?.id, task?.version),
              () => {
                setEditor(null);
                toast.success(task ? "Tarefa atualizada." : "Tarefa criada.");
              },
            )
          }
        />
      )}
      {boardEditor && (
        <TaskBoardEditor
          board={boardEditor === "new" ? null : boardEditor}
          projectId={
            boardEditor === "new"
              ? projectId && projectId !== "none"
                ? projectId
                : null
              : boardEditor.projectId
          }
          busy={busy}
          onClose={() => setBoardEditor(null)}
          onSave={(data, board) =>
            perform(
              () =>
                saveBoardAction(
                  data,
                  board?.version ? board.id : undefined,
                  board?.version,
                ),
              () => toast.success("Bloco salvo."),
            )
          }
        />
      )}
      {projectEditor && (
        <ProjectDialog
          project={projectEditor === "new" ? null : projectEditor}
          templates={templates}
          busy={busy}
          onClose={() => setProjectEditor(null)}
          onSave={(name, color: TaskColor, id, templateId) =>
            perform(
              () => saveProjectAction({ name, color }, id, templateId),
              () => toast.success("Projeto salvo."),
            )
          }
          onDelete={(id) =>
            perform(
              () => deleteProjectAction(id),
              () => {
                if (projectId === id) setProjectId("");
                toast.success("Projeto excluído. As tarefas foram mantidas.");
              },
            )
          }
        />
      )}
      {templateDialog && (
        <TaskTemplateDialog
          name={currentProject?.name ?? "Organização geral"}
          templates={templates}
          busy={busy}
          onClose={() => setTemplateDialog(false)}
          onSave={(name) =>
            perform(
              () =>
                saveTemplateAction(
                  projectId && projectId !== "none" ? projectId : null,
                  name,
                ),
              () => toast.success("Modelo salvo no workspace."),
            )
          }
          onDelete={(id, version) =>
            perform(
              () => deleteTemplateAction(id, version),
              () => toast.success("Modelo excluído."),
            )
          }
        />
      )}
      {markdownUpdate && (
        <MarkdownUpdateDialog
          busy={busy}
          onClose={() => setMarkdownUpdate(false)}
          onPreview={previewTaskUpdatesAction}
          onApply={(text, token, selection) =>
            perform(
              () => applyTaskUpdatesAction(text, token, selection),
              () => toast.success("Tarefas atualizadas a partir do Markdown."),
            )
          }
        />
      )}
      {reminderDialog && (
        <TaskReminders
          tasks={sourceTasks}
          projects={projects}
          boards={boards}
          reminders={reminders}
          selectedIds={selectedTasks.map((t) => t.id)}
          visibleIds={visible.map((t) => t.id)}
          initial={reminderDialog}
          onClose={() => setReminderDialog(null)}
          onChanged={setReminders}
          onOpenTask={(id) => {
            const task = tasks.find((t) => t.id === id);
            if (task) {
              setReminderDialog(null);
              setEditor({ task, defaults: {} });
            }
          }}
        />
      )}
      {report && (
        <TaskReportDialog
          projects={projects}
          projectId={projectId}
          workspaceName={workspaceName}
          onClose={() => setReport(false)}
        />
      )}
      {markdown && (
        <MarkdownDialog
          mode={markdown}
          text={exportTasksMarkdown(visible, projects, boards, sourceTasks)}
          count={visible.length}
          busy={busy}
          canEdit={canEdit}
          onClose={() => setMarkdown(null)}
          onImport={(text) =>
            perform(
              () => importTasksAction(text),
              () => {
                setScope("all");
                setProjectId("");
                clearFilters();
                toast.success("Tarefas importadas.");
              },
            )
          }
        />
      )}
    </div>
  );
}
