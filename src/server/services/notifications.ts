import "server-only";
/**
 * Notification center: what asks for the person's attention in the current workspace, gathered
 * from the other services on demand (nothing is stored besides the "seen" timestamp).
 *
 * - task reminders delivered and not dismissed (personal);
 * - open tasks past their due date and follow-ups due (workspace tasks);
 * - open comment threads that @mention the person or sit on plans they own;
 * - links that started failing in the last week.
 *
 * "Marcar tudo como visto" stores a timestamp in user_preferences; items newer than it are unread.
 */
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { splitMentions } from "@/domain/comments";
import { visibleTree } from "@/features/links/server-data";
import { todayTasks } from "./dashboard";
import { recentlyBroken, SWEEP_STALE_MS } from "./link-health";
import { planAccess } from "./permissions";
import { listTaskReminders } from "./task-reminders";
import { listMembers, UserError, workspaceRole } from "./workspaces";

type Actor = { workspaceId: string; userId: string };

export type NotificationKind = "reminder" | "overdue" | "followup" | "mention" | "comment" | "broken";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string | null;
  /** When it started asking for attention (ms). */
  at: number;
  href: string;
  unread: boolean;
};

export type NotificationsResult = { items: NotificationItem[]; unread: number; seenAt: number | null };

export const SEEN_KEY = "notifications.seenAt";
const MAX_ITEMS = 50;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function member(actor: Actor) {
  if (!workspaceRole(actor.userId, actor.workspaceId)) throw new UserError("Você não tem permissão para esta ação.");
}

/** Midnight of a YYYY-MM-DD day, or of a day after it (server time zone). */
const dayStart = (day: string, plusDays = 0) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + plusDays);
  return d.getTime();
};

const snippet = (body: string, max = 90) => {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

// ------------------------------------------------------------------ seen timestamp

const prefWhere = (actor: Actor) =>
  and(eq(schema.userPreferences.userId, actor.userId), eq(schema.userPreferences.workspaceId, actor.workspaceId), eq(schema.userPreferences.key, SEEN_KEY));

export function notificationsSeenAt(actor: Actor): number | null {
  member(actor);
  const row = getDb().select({ v: schema.userPreferences.valueJson }).from(schema.userPreferences).where(prefWhere(actor)).get();
  if (!row) return null;
  try {
    const v = JSON.parse(row.v);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** "Marcar tudo como visto": everything up to `at` stops counting as unread. */
export function markNotificationsSeen(actor: Actor, at = Date.now()): number {
  member(actor);
  const valueJson = JSON.stringify(at);
  getDb()
    .insert(schema.userPreferences)
    .values({ userId: actor.userId, workspaceId: actor.workspaceId, key: SEEN_KEY, valueJson, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.userPreferences.userId, schema.userPreferences.workspaceId, schema.userPreferences.key],
      set: { valueJson, updatedAt: new Date() },
    })
    .run();
  return at;
}

// ------------------------------------------------------------------ sources

function reminderItems(actor: Actor, now: number): Omit<NotificationItem, "unread">[] {
  return listTaskReminders(actor, now)
    .filter((r) => r.state === "delivered")
    .map((r) => ({
      id: `reminder:${r.id}`,
      kind: "reminder" as const,
      title: r.kind === "start" ? `Hora de iniciar: ${r.title}` : r.kind === "finish" ? `Prazo para finalizar: ${r.title}` : `Acompanhar: ${r.title}`,
      detail: r.projectName,
      at: r.deliveredAt ?? r.nextAt,
      href: `/tasks?open=${encodeURIComponent(r.taskId)}`,
    }));
}

function taskItems(actor: Actor, today: string): Omit<NotificationItem, "unread">[] {
  const out: Omit<NotificationItem, "unread">[] = [];
  for (const t of todayTasks(actor, today, 200).items) {
    if (t.reason === "overdue" && t.dueDate) {
      out.push({
        id: `task:${t.id}:overdue`,
        kind: "overdue",
        title: `Tarefa atrasada: ${t.title}`,
        detail: t.projectName,
        // It became overdue when its due day ended.
        at: dayStart(t.dueDate, 1),
        href: `/tasks?open=${encodeURIComponent(t.id)}`,
      });
    } else if (t.reason === "followup" && t.followUpDate) {
      out.push({
        id: `task:${t.id}:followup`,
        kind: "followup",
        title: `Acompanhar hoje: ${t.title}`,
        detail: t.projectName,
        at: dayStart(t.followUpDate),
        href: `/tasks?open=${encodeURIComponent(t.id)}`,
      });
    }
  }
  return out;
}

/** Open threads on visible plans of the workspace that mention the person or sit on a plan they own. */
function commentItems(actor: Actor, userName: string): Omit<NotificationItem, "unread">[] {
  const db = getDb();
  const p = schema.plans;
  const plans = db
    .select({ id: p.id, title: p.title, workspaceId: p.workspaceId, visibility: p.visibility, createdBy: p.createdBy })
    .from(p)
    .where(and(eq(p.workspaceId, actor.workspaceId), isNull(p.archivedAt), isNull(p.deletedAt)))
    .all()
    // Comments are for insiders: public/link plans count as workspace plans here (as in commentAccess).
    .filter((plan) => planAccess(actor.userId, plan.visibility === "public" || plan.visibility === "link" ? { ...plan, visibility: "workspace" } : plan) != null);
  if (!plans.length) return [];
  const byPlan = new Map(plans.map((x) => [x.id, x]));
  const c = schema.planComments;
  const roots = db
    .select({ id: c.id })
    .from(c)
    .where(and(inArray(c.planId, [...byPlan.keys()]), isNull(c.parentId), isNull(c.resolvedAt)))
    .all()
    .map((r) => r.id);
  if (!roots.length) return [];
  const comments = db
    .select({ id: c.id, planId: c.planId, parentId: c.parentId, userId: c.userId, body: c.body, createdAt: c.createdAt, name: schema.users.name })
    .from(c)
    .leftJoin(schema.users, eq(schema.users.id, c.userId))
    .where(or(inArray(c.id, roots), inArray(c.parentId, roots)))
    .all();

  const names = [...new Set([...listMembers(actor.workspaceId).map((m) => m.name), ...comments.map((x) => x.name ?? "")])];
  const me = userName.trim().toLowerCase();
  const mentionsMe = (body: string) => !!me && splitMentions(body, names).some((part) => part.mention && part.text.slice(1).toLowerCase() === me);

  const threads = new Map<string, typeof comments>();
  for (const x of comments) {
    const key = x.parentId ?? x.id;
    threads.set(key, [...(threads.get(key) ?? []), x]);
  }
  const out: Omit<NotificationItem, "unread">[] = [];
  for (const [rootId, list] of threads) {
    const plan = byPlan.get(list[0].planId);
    if (!plan) continue;
    const others = list.filter((x) => x.userId !== actor.userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const mention = others.find((x) => mentionsMe(x.body));
    const latest = others[0];
    const href = `/plans/${encodeURIComponent(plan.id)}/edit`;
    if (mention) {
      out.push({
        id: `thread:${rootId}`,
        kind: "mention",
        title: `${mention.name ?? "Alguém"} mencionou você em ${plan.title}`,
        detail: snippet(mention.body),
        at: mention.createdAt.getTime(),
        href,
      });
    } else if (latest && plan.createdBy === actor.userId) {
      out.push({
        id: `thread:${rootId}`,
        kind: "comment",
        title: `${latest.name ?? "Alguém"} comentou em ${plan.title}`,
        detail: snippet(latest.body),
        at: latest.createdAt.getTime(),
        href,
      });
    }
  }
  return out;
}

/** Links that started failing in the last week (link-health's recentlyBroken), as one item. */
function brokenItem(actor: Actor, now: number): Omit<NotificationItem, "unread">[] {
  const { hidden } = visibleTree(actor.workspaceId, actor.userId);
  const count = recentlyBroken(actor.workspaceId, hidden);
  if (!count) return [];
  // When the latest of them was found failing: the item is "new" again when another one breaks.
  const f = schema.favorites;
  const hiddenIds = [...hidden];
  const last = getDb()
    .select({ at: sql<number | null>`max(${f.healthCheckedAt})` })
    .from(f)
    .where(
      and(
        eq(f.workspaceId, actor.workspaceId),
        isNull(f.archivedAt),
        isNull(f.deletedAt),
        inArray(f.healthStatus, ["broken", "unreachable"]),
        sql`${f.healthCheckedAt} > ${now - SWEEP_STALE_MS}`,
        hiddenIds.length ? or(isNull(f.collectionId), sql`${f.collectionId} not in (${sql.join(hiddenIds.map((h) => sql`${h}`), sql`, `)})`) : undefined,
      ),
    )
    .get()?.at;
  return [
    {
      id: "broken",
      kind: "broken",
      title: count === 1 ? "1 link parou de responder" : `${count} links pararam de responder`,
      detail: "Na última semana. Confira e corrija na biblioteca.",
      at: last == null ? now : Number(last),
      href: "/links?scope=broken",
    },
  ];
}

// ------------------------------------------------------------------ the list

/**
 * Everything that asks for attention, newest first (at most 50), with the unread count.
 * `today` is the person's local day (YYYY-MM-DD); it decides what is overdue.
 */
export function listNotifications(actor: Actor, opts: { userName: string; today: string; now?: number }): NotificationsResult {
  member(actor);
  const now = opts.now ?? Date.now();
  if (!ISO_DAY.test(opts.today)) throw new UserError("Data inválida.");
  const seenAt = notificationsSeenAt(actor);
  const all = [...reminderItems(actor, now), ...taskItems(actor, opts.today), ...commentItems(actor, opts.userName), ...brokenItem(actor, now)]
    .map((item) => ({ ...item, unread: seenAt == null || item.at > seenAt }))
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  return { items: all.slice(0, MAX_ITEMS), unread: all.filter((i) => i.unread).length, seenAt };
}
