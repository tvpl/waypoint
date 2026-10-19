import { localDate } from "./tasks";

export const RECURRENCES = ["", "daily", "weekdays", "weekly", "monthly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];
export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  "": "Não repete",
  daily: "Todo dia",
  weekdays: "Dias úteis",
  weekly: "Toda semana",
  monthly: "Todo mês",
};
/** Quick-capture tokens ("~semanal"). */
export const RECURRENCE_TOKENS: Record<string, Recurrence> = {
  diaria: "daily",
  diario: "daily",
  uteis: "weekdays",
  "dias-uteis": "weekdays",
  semanal: "weekly",
  mensal: "monthly",
};

const at = (iso: string) => new Date(`${iso}T12:00:00`);

function step(date: Date, rule: Exclude<Recurrence, "">, anchorDay: number) {
  const d = new Date(date);
  if (rule === "daily") d.setDate(d.getDate() + 1);
  else if (rule === "weekly") d.setDate(d.getDate() + 7);
  else if (rule === "weekdays") {
    do d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6);
  } else {
    // Keeps the day of month, clamped to shorter months (31 → 30, 28/29).
    const month = d.getMonth() + 1;
    const last = new Date(d.getFullYear(), month + 1, 0).getDate();
    d.setDate(1);
    d.setMonth(month);
    d.setDate(Math.min(anchorDay, last));
  }
  return d;
}

/**
 * Due date of the next occurrence: one step after the current due date (or today), rolled
 * forward until it is after today, so finishing late doesn't create a task already overdue.
 */
export function nextOccurrence(rule: Exclude<Recurrence, "">, dueDate: string | null, today = localDate()): string {
  const start = at(dueDate ?? today);
  const anchor = start.getDate();
  let next = step(start, rule, anchor);
  for (let guard = 0; localDate(next) <= today && guard < 1000; guard++) next = step(next, rule, anchor);
  return localDate(next);
}
