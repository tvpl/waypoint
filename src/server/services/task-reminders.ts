import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { newId } from "@/lib/utils";
import {
  reminderInputSchema,
  reminderSelectionSchema,
  SNOOZE_OPTIONS,
  type TaskReminder,
} from "@/domain/task-reminders";
import { UserError, workspaceRole } from "./workspaces";

type Actor = { workspaceId: string; userId: string };
const r = schema.taskReminders,
  t = schema.tasks,
  m = schema.workspaceMembers;
function access(actor: Actor) {
  if (!workspaceRole(actor.userId, actor.workspaceId))
    throw new UserError("Você não tem permissão para esta ação.");
}
function owned(actor: Actor, id: string) {
  access(actor);
  const row = getDb()
    .select()
    .from(r)
    .where(
      and(
        eq(r.id, z.string().max(64).parse(id)),
        eq(r.userId, actor.userId),
        eq(r.workspaceId, actor.workspaceId),
      ),
    )
    .get();
  if (!row) throw new UserError("Lembrete não encontrado.");
  return row;
}

export function scheduleTaskReminders(
  actor: Actor,
  selection: unknown,
  input: unknown,
  now = Date.now(),
) {
  access(actor);
  const targets = reminderSelectionSchema.parse(selection),
    value = reminderInputSchema.parse(input);
  const nextAt = value.deadlineAt - value.leadMinutes * 60_000;
  if (nextAt <= now || value.deadlineAt > now + 5 * 366 * 86400_000)
    throw new UserError(
      "Escolha um horário de aviso no futuro, dentro dos próximos 5 anos.",
    );
  return getDb().transaction((tx) => {
    const tasks = tx
      .select()
      .from(t)
      .where(
        and(
          eq(t.workspaceId, actor.workspaceId),
          inArray(
            t.id,
            targets.map((v) => v.id),
          ),
        ),
      )
      .all();
    if (tasks.length !== targets.length)
      throw new UserError(
        "Uma das tarefas não está disponível neste workspace.",
      );
    for (const task of tasks) {
      if (task.version !== targets.find((v) => v.id === task.id)!.version)
        throw new UserError(
          "Uma das tarefas mudou. Atualize a seleção e tente novamente.",
        );
      if (
        task.archivedAt ||
        task.status === "done" ||
        (value.kind === "start" && task.status === "doing")
      )
        throw new UserError(
          "A seleção contém tarefas concluídas, arquivadas ou já iniciadas para este tipo de lembrete.",
        );
    }
    const count = tx
      .select({ n: sql<number>`count(*)` })
      .from(r)
      .where(
        and(
          eq(r.userId, actor.userId),
          ne(r.state, "dismissed"),
          inArray(
            r.workspaceId,
            tx
              .select({ id: m.workspaceId })
              .from(m)
              .where(eq(m.userId, actor.userId)),
          ),
        ),
      )
      .get()!.n;
    const existing = tx
      .select({ taskId: r.taskId, state: r.state })
      .from(r)
      .where(
        and(
          eq(r.userId, actor.userId),
          eq(r.kind, value.kind),
          inArray(
            r.taskId,
            targets.map((v) => v.id),
          ),
        ),
      )
      .all();
    if (
      count +
        tasks.length -
        existing.filter((v) => v.state !== "dismissed").length >
      1000
    )
      throw new UserError(
        "Você pode manter até 1.000 lembretes ativos. Dispense alguns antes de continuar.",
      );
    for (const task of tasks) {
      tx.insert(r)
        .values({
          id: newId(),
          taskId: task.id,
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          ...value,
          nextAt,
        })
        .onConflictDoUpdate({
          target: [r.userId, r.taskId, r.kind],
          set: {
            ...value,
            nextAt,
            state: "scheduled",
            deliveredAt: null,
            snoozed: false,
            leaseUntil: null,
            claimToken: null,
            lastError: null,
            version: sql`${r.version} + 1`,
          },
        })
        .run();
    }
    return tasks.length;
  });
}

/** Inbox-only reminders do not depend on a native notification permission. */
function advanceInbox(userId: string, now: number) {
  getDb()
    .update(r)
    .set({
      state: "delivered",
      deliveredAt: now,
      version: sql`${r.version} + 1`,
    })
    .where(
      and(
        eq(r.userId, userId),
        eq(r.channel, "inbox"),
        eq(r.state, "scheduled"),
        lte(r.nextAt, now),
        inArray(
          r.workspaceId,
          getDb()
            .select({ id: m.workspaceId })
            .from(m)
            .where(eq(m.userId, userId)),
        ),
      ),
    )
    .run();
}
export function listTaskReminders(
  actor: Actor,
  now = Date.now(),
): TaskReminder[] {
  access(actor);
  advanceInbox(actor.userId, now);
  return getDb()
    .select({
      reminder: r,
      title: t.title,
      projectName: schema.taskProjects.name,
    })
    .from(r)
    .innerJoin(t, eq(t.id, r.taskId))
    .leftJoin(schema.taskProjects, eq(schema.taskProjects.id, t.projectId))
    .where(
      and(
        eq(r.workspaceId, actor.workspaceId),
        eq(r.userId, actor.userId),
        ne(r.state, "dismissed"),
      ),
    )
    .orderBy(asc(r.nextAt))
    .all()
    .map(({ reminder, title, projectName }) => ({
      ...reminderInputSchema.parse(reminder),
      id: reminder.id,
      taskId: reminder.taskId,
      workspaceId: reminder.workspaceId,
      nextAt: reminder.nextAt,
      state: reminder.state,
      deliveredAt: reminder.deliveredAt,
      snoozed: reminder.snoozed,
      version: reminder.version,
      lastError: reminder.lastError,
      title,
      projectName,
    }));
}
export function changeTaskReminder(
  actor: Actor,
  id: string,
  version: number,
  action: "dismiss" | "snooze",
  until?: number,
  now = Date.now(),
) {
  const row = owned(actor, id);
  if (row.version !== z.number().int().positive().parse(version))
    throw new UserError(
      "Este lembrete mudou. Atualize a central e tente novamente.",
    );
  if (action !== "dismiss" && action !== "snooze")
    throw new UserError("Ação inválida.");
  if (action === "snooze") {
    if (row.state === "dismissed")
      throw new UserError("Este lembrete já foi dispensado.");
    const task = getDb().select().from(t).where(eq(t.id, row.taskId)).get()!;
    if (
      task.archivedAt ||
      task.status === "done" ||
      (row.kind === "start" && task.status === "doing")
    )
      throw new UserError("Esta tarefa não precisa mais deste lembrete.");
    if (
      !until ||
      !Number.isSafeInteger(until) ||
      until <= Math.max(now, row.state === "scheduled" ? row.nextAt : now) ||
      until > Math.max(now, row.nextAt) + 366 * 86400_000
    )
      throw new UserError(
        "Escolha um adiamento posterior ao aviso atual, de até um ano. Para antecipar, use Reagendar.",
      );
  }
  const changed = getDb()
    .update(r)
    .set({
      state: action === "dismiss" ? "dismissed" : "scheduled",
      ...(action === "snooze" ? { nextAt: until!, snoozed: true } : {}),
      deliveredAt: null,
      claimToken: null,
      leaseUntil: null,
      lastError: null,
      version: row.version + 1,
    })
    .where(and(eq(r.id, id), eq(r.version, row.version)))
    .run();
  if (!changed.changes)
    throw new UserError(
      "Este lembrete mudou. Atualize a central e tente novamente.",
    );
}

/** Shell-only: authenticated user, across workspaces where membership still exists. */
export function claimTaskReminders(userId: string, now = Date.now()) {
  advanceInbox(userId, now);
  return getDb().transaction((tx) => {
    const rows = tx
      .select({
        reminder: r,
        title: t.title,
        workspaceName: schema.workspaces.name,
      })
      .from(r)
      .innerJoin(t, eq(t.id, r.taskId))
      .innerJoin(
        m,
        and(eq(m.workspaceId, r.workspaceId), eq(m.userId, r.userId)),
      )
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, r.workspaceId))
      .where(
        and(
          eq(r.userId, userId),
          eq(r.state, "scheduled"),
          ne(r.channel, "inbox"),
          lte(r.nextAt, now),
          or(isNull(r.leaseUntil), lte(r.leaseUntil, now)),
          isNull(t.archivedAt),
          ne(t.status, "done"),
          or(ne(r.kind, "start"), ne(t.status, "doing")),
        ),
      )
      .orderBy(asc(r.nextAt))
      .limit(50)
      .all();
    return rows.map(({ reminder, title, workspaceName }) => {
      const claimToken = randomUUID();
      tx.update(r)
        .set({ claimToken, leaseUntil: now + 120_000 })
        .where(eq(r.id, reminder.id))
        .run();
      return { ...reminder, claimToken, title, workspaceName };
    });
  });
}
export function nativeReminderResult(
  userId: string,
  id: string,
  token: string,
  action: "shown" | "failed" | "snooze" | "dismiss",
  now = Date.now(),
) {
  const row = getDb()
    .select()
    .from(r)
    .innerJoin(m, and(eq(m.workspaceId, r.workspaceId), eq(m.userId, r.userId)))
    .where(and(eq(r.id, id), eq(r.userId, userId), eq(r.claimToken, token)))
    .get()?.task_reminders;
  if (!row || row.state === "dismissed") return false;
  if (action === "snooze" || action === "dismiss") {
    changeTaskReminder(
      { workspaceId: row.workspaceId, userId },
      id,
      row.version,
      action,
      now + row.snoozeMinutes * 60_000,
      now,
    );
    return true;
  }
  if (row.state !== "scheduled") return false;
  getDb()
    .update(r)
    .set(
      action === "shown"
        ? {
            state: "delivered",
            deliveredAt: now,
            leaseUntil: null,
            lastError: null,
            version: row.version + 1,
          }
        : {
            leaseUntil: now + 5 * 60_000,
            lastError:
              "O sistema não exibiu o aviso. Confira as permissões de notificação do Waypoint.",
          },
    )
    .where(and(eq(r.id, id), eq(r.claimToken, token)))
    .run();
  return true;
}
export function reminderDestination(userId: string, id: string) {
  const row = getDb()
    .select({ workspaceId: r.workspaceId, taskId: r.taskId })
    .from(r)
    .innerJoin(m, and(eq(m.workspaceId, r.workspaceId), eq(m.userId, r.userId)))
    .where(and(eq(r.id, id), eq(r.userId, userId)))
    .get();
  if (!row) throw new UserError("Lembrete não encontrado.");
  return row;
}

export function activeNativeReminderTokens(userId: string) {
  return getDb()
    .select({ id: r.id, claimToken: r.claimToken })
    .from(r)
    .innerJoin(m, and(eq(m.workspaceId, r.workspaceId), eq(m.userId, r.userId)))
    .where(and(eq(r.userId, userId), ne(r.state, "dismissed")))
    .all();
}

export function changeTaskReminders(
  actor: Actor,
  selection: unknown,
  action: "dismiss" | "snooze",
  until?: number,
  now = Date.now(),
  delayMinutes?: number,
) {
  access(actor);
  const targets = reminderSelectionSchema.parse(selection);
  if (
    delayMinutes !== undefined &&
    (!(SNOOZE_OPTIONS as readonly number[]).includes(delayMinutes) ||
      until !== undefined)
  )
    throw new UserError("Intervalo de adiamento inválido.");
  return getDb().transaction(() => {
    for (const target of targets) {
      const row = delayMinutes === undefined ? null : owned(actor, target.id);
      const next =
        delayMinutes === undefined
          ? until
          : Math.max(now, row!.nextAt) + delayMinutes * 60_000;
      changeTaskReminder(actor, target.id, target.version, action, next, now);
    }
    return targets.length;
  });
}
