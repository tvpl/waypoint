import { z } from "zod";
import { TASK_STATUSES, type Task, type TaskStatus } from "./tasks";
import { startOfWeek } from "./task-report";

/** How much of a stage to hide: nothing, everything, or what is older than today / this week / this month. */
export const HIDE_RULES = ["show", "before-today", "before-week", "before-month", "all"] as const;
export type HideRule = (typeof HIDE_RULES)[number];
export const HIDE_RULE_LABELS: Record<HideRule, string> = {
  show: "Mostrar",
  "before-today": "Antes de hoje",
  "before-week": "Antes desta semana",
  "before-month": "Antes deste mês",
  all: "Todas",
};

export const hideRulesSchema = z.object({
  todo: z.enum(HIDE_RULES).default("show"),
  doing: z.enum(HIDE_RULES).default("show"),
  waiting: z.enum(HIDE_RULES).default("show"),
  done: z.enum(HIDE_RULES).default("show"),
});
export type HideRules = z.infer<typeof hideRulesSchema>;
export const noHideRules = (): HideRules => ({ todo: "show", doing: "show", waiting: "show", done: "show" });

export const HIDE_PRESETS: { label: string; rules: Partial<HideRules> }[] = [
  { label: "Concluídas", rules: { done: "all" } },
  { label: "Concluídas antes de hoje", rules: { done: "before-today" } },
  { label: "Concluídas de meses anteriores", rules: { done: "before-month" } },
  { label: "Tudo, exceto o que está em andamento", rules: { todo: "all", waiting: "all", done: "all" } },
];

export const activeHideRules = (rules: HideRules) => TASK_STATUSES.filter((s) => rules[s] !== "show");

/**
 * The date a rule looks at: completed tasks by completion, the others by creation
 * ("Concluídas de meses anteriores", "A fazer criadas antes desta semana").
 */
export function referenceTime(task: Pick<Task, "status" | "completedAt" | "createdAt">) {
  return task.status === "done" && task.completedAt ? task.completedAt : task.createdAt;
}

/** Start of the window a rule keeps visible, in local time. */
export function ruleCutoff(rule: HideRule, now: Date): number | null {
  if (rule === "before-today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).valueOf();
  if (rule === "before-week") return startOfWeek(now).valueOf();
  if (rule === "before-month") return new Date(now.getFullYear(), now.getMonth(), 1).valueOf();
  return null;
}

/** True when the rules hide this task. `exempt` lists stages the current view explicitly asks for. */
export function hiddenByRules(task: Pick<Task, "status" | "completedAt" | "createdAt">, rules: HideRules, now: Date, exempt: TaskStatus[] = []) {
  const rule = rules[task.status];
  if (rule === "show" || exempt.includes(task.status)) return false;
  if (rule === "all") return true;
  return referenceTime(task) < ruleCutoff(rule, now)!;
}

/** "Concluídas antes deste mês e A fazer" — for chips and saved views. */
export function describeHideRules(rules: HideRules, labels: Record<TaskStatus, string>) {
  return activeHideRules(rules)
    .map((s) => (rules[s] === "all" ? labels[s] : `${labels[s]} ${HIDE_RULE_LABELS[rules[s]].toLowerCase()}`))
    .join(" · ");
}
