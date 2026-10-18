import "server-only";
import { and, asc, eq, isNull, lte, ne, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { newId } from "@/lib/utils";
import { addDaysIso, dayInZone, weekdayIso } from "@/lib/timezone";
import { UserError, workspaceRole } from "./workspaces";
import { MAX_SHORTCUTS, normalizeLayout, shortcutInputSchema, type HomeLayout, homeLayoutSchema, type HomeShortcut } from "@/domain/dashboard";

type Actor = { workspaceId: string; userId: string };
const key = z.string().min(1).max(64);

/** Shortcuts and layout are personal: any member (viewers too) manages their own. */
function member(actor: Actor) {
  if (!workspaceRole(actor.userId, actor.workspaceId)) throw new UserError("Você não tem permissão para esta ação.");
}
const mine = (actor: Actor) => and(eq(schema.homeShortcuts.userId, actor.userId), eq(schema.homeShortcuts.workspaceId, actor.workspaceId));

export function listShortcuts(actor: Actor): HomeShortcut[] {
  member(actor);
  return getDb()
    .select()
    .from(schema.homeShortcuts)
    .where(mine(actor))
    .orderBy(asc(schema.homeShortcuts.position), asc(schema.homeShortcuts.createdAt))
    .all()
    .map((r) => {
      const parsed = shortcutInputSchema.safeParse(r);
      return { ...(parsed.success ? parsed.data : { title: r.title, href: "/", icon: "link" as const, color: "accent" as const }), id: r.id, position: r.position };
    });
}

export function saveShortcut(actor: Actor, raw: unknown, id?: string) {
  member(actor);
  const input = shortcutInputSchema.parse(raw);
  const db = getDb();
  if (id) {
    const res = db.update(schema.homeShortcuts).set(input).where(and(eq(schema.homeShortcuts.id, key.parse(id)), mine(actor))).run();
    if (!res.changes) throw new UserError("Atalho não encontrado.");
    return id;
  }
  const existing = listShortcuts(actor);
  if (existing.length >= MAX_SHORTCUTS) throw new UserError(`Use até ${MAX_SHORTCUTS} atalhos.`);
  const newIdValue = newId();
  db.insert(schema.homeShortcuts)
    .values({ ...input, id: newIdValue, userId: actor.userId, workspaceId: actor.workspaceId, position: (existing.at(-1)?.position ?? -1) + 1 })
    .run();
  return newIdValue;
}

export function deleteShortcut(actor: Actor, id: string) {
  member(actor);
  getDb().delete(schema.homeShortcuts).where(and(eq(schema.homeShortcuts.id, key.parse(id)), mine(actor))).run();
}

export function reorderShortcuts(actor: Actor, raw: unknown) {
  member(actor);
  const ids = z.array(key).max(MAX_SHORTCUTS).parse(raw);
  getDb().transaction((tx) => {
    ids.forEach((id, position) => tx.update(schema.homeShortcuts).set({ position }).where(and(eq(schema.homeShortcuts.id, id), mine(actor))).run());
  });
}

const LAYOUT_KEY = "home.layout";

export function homeLayout(actor: Actor): HomeLayout {
  const row = getDb()
    .select()
    .from(schema.userPreferences)
    .where(and(eq(schema.userPreferences.userId, actor.userId), eq(schema.userPreferences.workspaceId, actor.workspaceId), eq(schema.userPreferences.key, LAYOUT_KEY)))
    .get();
  try {
    return normalizeLayout(row ? JSON.parse(row.valueJson) : null);
  } catch {
    return normalizeLayout(null);
  }
}

export function saveHomeLayout(actor: Actor, raw: unknown) {
  member(actor);
  const layout = normalizeLayout(homeLayoutSchema.parse(raw));
  getDb()
    .insert(schema.userPreferences)
    .values({ userId: actor.userId, workspaceId: actor.workspaceId, key: LAYOUT_KEY, valueJson: JSON.stringify(layout), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.userPreferences.userId, schema.userPreferences.workspaceId, schema.userPreferences.key],
      set: { valueJson: JSON.stringify(layout), updatedAt: new Date() },
    })
    .run();
  return layout;
}

export type TodayTask = {
  id: string;
  title: string;
  version: number;
  status: string;
  dueDate: string | null;
  followUpDate: string | null;
  projectName: string | null;
  projectColor: string | null;
  reason: "overdue" | "today" | "followup";
};

/** Open tasks due today or earlier, plus follow-ups due; overdue first. */
export function todayTasks(actor: Actor, today: string, limit = 8): { items: TodayTask[]; total: number } {
  member(actor);
  const rows = getDb()
    .select({ task: schema.tasks, project: schema.taskProjects })
    .from(schema.tasks)
    .leftJoin(schema.taskProjects, eq(schema.taskProjects.id, schema.tasks.projectId))
    .where(
      and(
        eq(schema.tasks.workspaceId, actor.workspaceId),
        isNull(schema.tasks.archivedAt),
        ne(schema.tasks.status, "done"),
        or(lte(schema.tasks.dueDate, today), lte(schema.tasks.followUpDate, today)),
      ),
    )
    .all();
  const items = rows
    .map(({ task, project }): TodayTask => ({
      id: task.id,
      title: task.title,
      version: task.version,
      status: task.status,
      dueDate: task.dueDate,
      followUpDate: task.followUpDate,
      projectName: project?.name ?? null,
      projectColor: project?.color ?? null,
      reason: task.dueDate && task.dueDate < today ? "overdue" : task.dueDate === today ? "today" : "followup",
    }))
    .sort((a, b) => ["overdue", "today", "followup"].indexOf(a.reason) - ["overdue", "today", "followup"].indexOf(b.reason) || (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  return { items: items.slice(0, limit), total: items.length };
}

export type WeeklyReview = {
  days: { date: string; label: string; completed: number; future: boolean }[];
  completed: number;
  lastWeek: number;
  created: number;
  open: number;
  projects: { name: string; color: string | null; completed: number }[];
};

/** This week (Monday on) at a glance: completions per day, versus last week, per project. */
export function weeklyReview(actor: Actor, now = new Date(), timeZone?: string | null): WeeklyReview {
  member(actor);
  // Days are counted in the person's time zone (completedAt is an instant).
  const day = (d: Date | number) => dayInZone(d, timeZone);
  const today = day(now);
  const monday = addDaysIso(today, -weekdayIso(today));
  const lastMonday = addDaysIso(monday, -7);
  const rows = getDb()
    .select({ task: schema.tasks, project: schema.taskProjects })
    .from(schema.tasks)
    .leftJoin(schema.taskProjects, eq(schema.taskProjects.id, schema.tasks.projectId))
    .where(eq(schema.tasks.workspaceId, actor.workspaceId))
    .all();
  const done = rows.filter(({ task }) => task.status === "done" && task.completedAt && day(task.completedAt) >= lastMonday && day(task.completedAt) <= today);
  const thisWeek = done.filter(({ task }) => day(task.completedAt!) >= monday);
  const labels = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
  const days = labels.map((label, i) => {
    const date = addDaysIso(monday, i);
    return { date, label, completed: thisWeek.filter(({ task }) => day(task.completedAt!) === date).length, future: date > today };
  });
  const byProject = new Map<string, { name: string; color: string | null; completed: number }>();
  for (const { project } of thisWeek) {
    const key = project?.id ?? "";
    const entry = byProject.get(key) ?? { name: project?.name ?? "Sem projeto", color: project?.color ?? null, completed: 0 };
    entry.completed++;
    byProject.set(key, entry);
  }
  return {
    days,
    completed: thisWeek.length,
    lastWeek: done.length - thisWeek.length,
    created: rows.filter(({ task }) => day(task.createdAt) >= monday).length,
    open: rows.filter(({ task }) => !task.archivedAt && task.status !== "done").length,
    projects: [...byProject.values()].sort((a, b) => b.completed - a.completed).slice(0, 4),
  };
}
