import { z } from "zod";

export const REMINDER_KINDS = ["start", "finish", "followup"] as const;
export const REMINDER_LABELS = {
  start: "Iniciar até",
  finish: "Finalizar até",
  followup: "Acompanhar em",
};
export const REMINDER_CHANNELS = {
  sound: "Notificação com som",
  silent: "Notificação silenciosa",
  inbox: "Somente na central",
};
export const SNOOZE_OPTIONS = [5, 15, 30, 60, 120, 1440] as const;
export const reminderInputSchema = z.object({
  kind: z.enum(REMINDER_KINDS),
  deadlineAt: z.number().int().positive(),
  dateOnly: z.boolean().default(false),
  timeZone: z
    .string()
    .max(100)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("pt-BR", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Fuso horário inválido."),
  leadMinutes: z
    .union([
      z.literal(0),
      z.literal(5),
      z.literal(15),
      z.literal(30),
      z.literal(60),
      z.literal(1440),
    ])
    .default(0),
  channel: z.enum(["sound", "silent", "inbox"]).default("sound"),
  snoozeMinutes: z
    .number()
    .refine((v) => (SNOOZE_OPTIONS as readonly number[]).includes(v))
    .default(15),
});
export type ReminderInput = z.infer<typeof reminderInputSchema>;
export type TaskReminder = ReminderInput & {
  id: string;
  taskId: string;
  title: string;
  projectName: string | null;
  workspaceId: string;
  nextAt: number;
  state: "scheduled" | "delivered" | "dismissed";
  deliveredAt: number | null;
  snoozed: boolean;
  version: number;
  lastError: string | null;
};
export const reminderSelectionSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      version: z.number().int().positive(),
    }),
  )
  .min(1)
  .max(500)
  .refine(
    (v) => new Set(v.map((t) => t.id)).size === v.length,
    "A seleção contém tarefas repetidas.",
  );
export function formatReminderTime(
  value: number,
  timeZone: string,
  dateOnly = false,
) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit" }),
  }).format(value);
}
/** Reject nonexistent local times, including daylight-saving gaps. */
export function localReminderTimestamp(day: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time))
    return null;
  const value = new Date(`${day}T${time}:00`);
  const pad = (n: number) => String(n).padStart(2, "0");
  return Number.isFinite(value.valueOf()) &&
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` ===
      day &&
    `${pad(value.getHours())}:${pad(value.getMinutes())}` === time
    ? value.valueOf()
    : null;
}
