import { z } from "zod";
import { eventSummary, type TaskEvent } from "./task-history";
import { PENDING_LABELS, PRIORITY_LABELS, STATUS_LABELS, type Task, type TaskProject } from "./tasks";

export const reportOptionsSchema = z.object({
  /** Inclusive start / exclusive end, epoch ms (computed in the reader's time zone); null = open. */
  from: z.number().int().nullable(),
  to: z.number().int().nullable(),
  /** Shown in the header ("Este mês", "1–15 out."). */
  periodLabel: z.string().trim().max(80),
  /** null = every project; "none" selects tasks without a project. */
  projectIds: z.array(z.string().min(1).max(64)).max(200).nullable(),
  includeArchived: z.boolean().default(true),
  includeOpen: z.boolean().default(false),
  context: z.boolean().default(true),
  subtasks: z.boolean().default(true),
  notes: z.boolean().default(true),
  history: z.boolean().default(true),
  timeline: z.boolean().default(true),
  timeZone: z.string().max(64).default("UTC"),
});
export type ReportOptions = z.infer<typeof reportOptionsSchema>;
export type ReportInput = z.input<typeof reportOptionsSchema>;

const DAY = 86_400_000;

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone, ...options });
  } catch {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...options });
  }
}

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
function isoDay(ms: number, timeZone: string) {
  const parts = formatter(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ms);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatDuration(ms: number) {
  if (ms < 0) ms = 0;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "menos de 1 hora";
  if (hours < 24) return hours === 1 ? "1 hora" : `${hours} horas`;
  const days = Math.round(ms / DAY);
  return days === 1 ? "1 dia" : `${days} dias`;
}

/** Keeps user text from breaking the report's structure (headings, lists, comments). */
const inline = (s: string) => s.replace(/\s+/g, " ").replace(/<!--/g, "&lt;!--").trim();
const quote = (s: string, indent = "") =>
  s
    .trim()
    .split("\n")
    .map((l) => `${indent}> ${l}`.trimEnd())
    .join("\n");

export type TaskReport = { markdown: string; completed: number; open: number };

/** Markdown report of the work completed in a period: summary, per project details and a timeline. */
export function buildTaskReport({
  tasks,
  projects,
  events,
  options: raw,
  workspaceName,
  now = Date.now(),
}: {
  tasks: Task[];
  projects: TaskProject[];
  events: Map<string, TaskEvent[]>;
  options: ReportInput;
  workspaceName: string;
  now?: number;
}): TaskReport {
  const o = reportOptionsSchema.parse(raw);
  const tz = o.timeZone;
  const dateFmt = formatter(tz, { day: "numeric", month: "short", year: "numeric" });
  const dateTimeFmt = formatter(tz, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const dayHeadingFmt = formatter(tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const date = (ms: number) => dateFmt.format(ms);
  const dateTime = (ms: number) => dateTimeFmt.format(ms);
  const dueLabel = (d: string) => formatter("UTC", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00Z`));

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const inProjects = (t: Task) => !o.projectIds || o.projectIds.includes(t.projectId ?? "none");
  const inRange = (ms: number) => (o.from === null || ms >= o.from) && (o.to === null || ms < o.to);
  const completed = tasks
    .filter((t) => t.status === "done" && t.completedAt !== null && inRange(t.completedAt) && inProjects(t) && (o.includeArchived || !t.archivedAt))
    .sort((a, b) => a.completedAt! - b.completedAt! || a.title.localeCompare(b.title));
  const open = o.includeOpen ? tasks.filter((t) => !t.archivedAt && (t.status === "doing" || t.status === "waiting") && inProjects(t)) : [];

  const projectName = (id: string | null) => (id ? (projectMap.get(id)?.name ?? "Projeto removido") : "Sem projeto");
  const groups = (list: Task[]) => {
    const map = new Map<string, Task[]>();
    for (const t of list) map.set(t.projectId ?? "", [...(map.get(t.projectId ?? "") ?? []), t]);
    return [...map.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : projectName(a).localeCompare(projectName(b), "pt-BR")));
  };

  const scopeLabel = !o.projectIds ? "Todos os projetos" : o.projectIds.map((id) => projectName(id === "none" ? null : id)).join(", ");
  const lines: string[] = [
    `# Relatório de entregas · ${inline(workspaceName)}`,
    "",
    `> **Período:** ${inline(o.periodLabel) || "Todo o histórico"} · **Projetos:** ${inline(scopeLabel)} · Gerado em ${dateTime(now)}`,
    "",
  ];

  // ---------------------------------------------------------------- summary
  const withDue = completed.filter((t) => t.dueDate);
  const onTime = withDue.filter((t) => isoDay(t.completedAt!, tz) <= t.dueDate!);
  const durations = completed.map((t) => t.completedAt! - t.createdAt).filter((d) => d >= 0);
  const projectCounts = groups(completed).map(([id, list]) => `${projectName(id || null)} (${list.length})`);
  lines.push("## Resumo", "");
  if (!completed.length) lines.push("Nenhuma tarefa concluída neste período.", "");
  else {
    const projectsCount = new Set(completed.map((t) => t.projectId ?? "")).size;
    lines.push(
      `- **${completed.length} ${completed.length === 1 ? "tarefa concluída" : "tarefas concluídas"}** em ${projectsCount} ${projectsCount === 1 ? "projeto" : "projetos"}`,
    );
    if (durations.length) lines.push(`- Tempo médio da criação à conclusão: ${formatDuration(durations.reduce((a, b) => a + b, 0) / durations.length)}`);
    if (withDue.length) lines.push(`- No prazo: ${onTime.length} de ${withDue.length} com prazo definido`);
    const subtasks = completed.flatMap((t) => t.subtasks);
    if (subtasks.length) lines.push(`- Subtarefas concluídas: ${subtasks.filter((s) => s.done).length} de ${subtasks.length}`);
    lines.push(`- Por projeto: ${projectCounts.join(" · ")}`, "");
  }

  // ---------------------------------------------------------------- details
  const detail = (t: Task) => {
    const history = events.get(t.id) ?? [];
    const out: string[] = [`### ${t.status === "done" ? "✅" : "⏳"} ${inline(t.title)}`, ""];
    const facts: string[] = [];
    if (t.status === "done" && t.completedAt) facts.push(`**Concluída:** ${dateTime(t.completedAt)}`);
    else facts.push(`**Etapa:** ${STATUS_LABELS[t.status]}`);
    facts.push(`**Criada:** ${date(t.createdAt)}`);
    if (t.status === "done" && t.completedAt) facts.push(`**Duração:** ${formatDuration(t.completedAt - t.createdAt)}`);
    out.push(`- ${facts.join(" · ")}`);
    if (t.dueDate) {
      const late = t.status === "done" && t.completedAt ? (isoDay(t.completedAt, tz) <= t.dueDate ? "no prazo" : "após o prazo") : "";
      out.push(`- **Prazo:** ${dueLabel(t.dueDate)}${late ? ` (${late})` : ""}`);
    }
    const meta: string[] = [];
    if (t.priority !== "none") meta.push(`**Prioridade:** ${PRIORITY_LABELS[t.priority]}`);
    if (t.tags.length) meta.push(`**Marcadores:** ${t.tags.map((tag) => `#${inline(tag)}`).join(" ")}`);
    if (t.people.length) meta.push(`**Pessoas:** ${t.people.map(inline).join(", ")}`);
    if (meta.length) out.push(`- ${meta.join(" · ")}`);
    if (t.archivedAt) out.push(`- _Arquivada em ${date(t.archivedAt)}_`);
    if (t.pendingNote.trim()) out.push(`- **${PENDING_LABELS[t.pendingKind]}:** ${inline(t.pendingNote)}`);
    if (o.subtasks && t.subtasks.length) {
      out.push(`- **Subtarefas:** ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}`);
      for (const s of t.subtasks) out.push(`  - [${s.done ? "x" : " "}] ${inline(s.title)}`);
    }
    if (o.context && t.description.trim()) out.push("", "**Contexto**", "", quote(t.description));
    const notes = history.filter((e) => e.kind === "note");
    if (o.notes && notes.length) {
      out.push("", "**Observações**", "");
      for (const n of notes) {
        const [first, ...rest] = n.body.trim().split("\n");
        out.push(`- ${dateTime(n.createdAt)}${n.userName ? ` — ${inline(n.userName)}` : ""}: ${first}`);
        for (const l of rest) out.push(`  ${l}`.trimEnd());
      }
    }
    const lifecycle = history.filter((e) => e.kind !== "note");
    if (o.history && lifecycle.length) {
      out.push("", "**Histórico**", "");
      for (const e of lifecycle) out.push(`- ${dateTime(e.createdAt)} — ${eventSummary(e)}${e.userName ? ` (${inline(e.userName)})` : ""}`);
    }
    out.push("");
    return out;
  };

  for (const [id, list] of groups(completed)) {
    lines.push(`## ${inline(projectName(id || null))} · ${list.length} ${list.length === 1 ? "concluída" : "concluídas"}`, "");
    for (const t of list) lines.push(...detail(t));
  }

  if (o.timeline && completed.length > 1) {
    lines.push("## Linha do tempo", "");
    const days = new Map<string, Task[]>();
    for (const t of completed) {
      const day = isoDay(t.completedAt!, tz);
      days.set(day, [...(days.get(day) ?? []), t]);
    }
    for (const list of days.values()) {
      const heading = dayHeadingFmt.format(list[0].completedAt!);
      lines.push(`**${heading.charAt(0).toUpperCase()}${heading.slice(1)}**`, "");
      for (const t of list) lines.push(`- ${inline(t.title)} · _${inline(projectName(t.projectId))}_`);
      lines.push("");
    }
  }

  if (open.length) {
    lines.push("## Em andamento", "");
    for (const [id, list] of groups(open)) {
      lines.push(`**${inline(projectName(id || null))}**`, "");
      for (const t of list) {
        const extra = [STATUS_LABELS[t.status], t.dueDate ? `prazo ${dueLabel(t.dueDate)}` : "", t.subtasks.length ? `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length} subtarefas` : ""]
          .filter(Boolean)
          .join(" · ");
        lines.push(`- ${inline(t.title)} — ${extra}`);
      }
      lines.push("");
    }
  }

  lines.push("---", "", "_Gerado pelo Waypoint._", "");
  return { markdown: lines.join("\n"), completed: completed.length, open: open.length };
}

// ---------------------------------------------------------------- periods (computed in the browser's time zone)

export const REPORT_PERIODS = [
  { id: "this-week", label: "Esta semana" },
  { id: "last-week", label: "Semana passada" },
  { id: "this-month", label: "Este mês" },
  { id: "last-month", label: "Mês passado" },
  { id: "last-30", label: "Últimos 30 dias" },
  { id: "this-year", label: "Este ano" },
  { id: "all", label: "Todo o histórico" },
  { id: "custom", label: "Personalizado" },
] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number]["id"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Weeks start on Monday (pt-BR). */
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

/** Local-time bounds of a period; `custom` uses the given YYYY-MM-DD dates (inclusive). */
export function periodRange(period: ReportPeriod, now = new Date(), custom?: { from: string; to: string }): { from: number | null; to: number | null } {
  const today = startOfDay(now);
  switch (period) {
    case "this-week":
      return { from: startOfWeek(now).valueOf(), to: addDays(startOfWeek(now), 7).valueOf() };
    case "last-week":
      return { from: addDays(startOfWeek(now), -7).valueOf(), to: startOfWeek(now).valueOf() };
    case "this-month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).valueOf(), to: new Date(now.getFullYear(), now.getMonth() + 1, 1).valueOf() };
    case "last-month":
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1).valueOf(), to: new Date(now.getFullYear(), now.getMonth(), 1).valueOf() };
    case "last-30":
      return { from: addDays(today, -29).valueOf(), to: addDays(today, 1).valueOf() };
    case "this-year":
      return { from: new Date(now.getFullYear(), 0, 1).valueOf(), to: new Date(now.getFullYear() + 1, 0, 1).valueOf() };
    case "all":
      return { from: null, to: null };
    case "custom": {
      const parse = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : null);
      const from = parse(custom?.from);
      const to = parse(custom?.to);
      return { from: from?.valueOf() ?? null, to: to ? addDays(to, 1).valueOf() : null };
    }
  }
}
