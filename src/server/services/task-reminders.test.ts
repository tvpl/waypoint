import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  localReminderTimestamp,
  reminderInputSchema,
} from "@/domain/task-reminders";

process.env.DATABASE_PATH = ":memory:";
let service: typeof import("./task-reminders"), tasks: typeof import("./tasks");
let database: typeof import("../db");
const owner = { userId: "owner", workspaceId: "ws" },
  viewer = { userId: "viewer", workspaceId: "ws" },
  foreign = { userId: "foreign", workspaceId: "other" };
const now = new Date("2026-10-16T12:00:00Z").valueOf();
const input = {
  kind: "finish" as const,
  deadlineAt: now + 3600_000,
  timeZone: "America/Sao_Paulo",
  channel: "silent" as const,
  leadMinutes: 15 as const,
  snoozeMinutes: 30,
};
const current = vi.hoisted(() => ({
  user: null as { id: string; name: string; email: string } | null,
}));
vi.mock("../auth", async (original) => ({
  ...(await original<typeof import("../auth")>()),
  getCurrentUser: async () => current.user,
}));
beforeAll(async () => {
  database = await import("../db");
  service = await import("./task-reminders");
  tasks = await import("./tasks");
  const { getDb, schema } = database;
  getDb()
    .insert(schema.users)
    .values(
      ["owner", "viewer", "foreign"].map((id) => ({
        id,
        name: id,
        email: `${id}@reminders.test`,
        passwordHash: "x",
      })),
    )
    .run();
  getDb()
    .insert(schema.workspaces)
    .values([
      { id: "ws", name: "Pessoal" },
      { id: "other", name: "Outro" },
    ])
    .run();
  getDb()
    .insert(schema.workspaceMembers)
    .values([
      { ...owner, role: "owner" },
      { ...viewer, role: "viewer" },
      { ...foreign, role: "owner" },
    ])
    .run();
});
const create = (title = "Próximo passo") => tasks.createTask(owner, { title });
const one = (taskId: string, actor = owner) =>
  service.listTaskReminders(actor, now).find((r) => r.taskId === taskId)!;

describe("personal task reminders", () => {
  it("validates local dates, offsets, time zones, bounds and overdue warnings", () => {
    expect(localReminderTimestamp("2026-02-30", "12:00")).toBeNull();
    expect(localReminderTimestamp("2026-10-17", "25:00")).toBeNull();
    expect(localReminderTimestamp("2026-10-17", "12:00")).toBe(
      new Date("2026-10-17T12:00:00").valueOf(),
    );
    expect(
      reminderInputSchema.safeParse({ ...input, timeZone: "not-a-zone" })
        .success,
    ).toBe(false);
    const task = create();
    expect(() =>
      service.scheduleTaskReminders(
        owner,
        [task],
        { ...input, deadlineAt: now + 10 * 60_000 },
        now,
      ),
    ).toThrow(/futuro/);
    expect(() =>
      service.scheduleTaskReminders(
        owner,
        [task],
        { ...input, deadlineAt: now + 7 * 366 * 86400_000 },
        now,
      ),
    ).toThrow(/5 anos/);
  });
  it("atomically validates the whole batch and never touches task dates or other users' reminders", () => {
    const a = create("Uma tarefa"),
      b = create("Outra tarefa");
    const hidden = tasks.createTask(foreign, { title: "Segredo" });
    expect(() =>
      service.scheduleTaskReminders(owner, [a, hidden], input, now),
    ).toThrow(/workspace/);
    expect(service.listTaskReminders(owner, now)).toHaveLength(0);
    expect(() =>
      service.scheduleTaskReminders(
        owner,
        [a, { ...b, version: 99 }],
        input,
        now,
      ),
    ).toThrow(/mudou/);
    expect(() =>
      service.scheduleTaskReminders(
        { ...owner, userId: "foreign" },
        [a],
        input,
        now,
      ),
    ).toThrow(/permissão/);
    service.scheduleTaskReminders(viewer, [a], input, now);
    expect(service.listTaskReminders(owner, now)).toHaveLength(0);
    service.scheduleTaskReminders(owner, [a, b], input, now);
    service.scheduleTaskReminders(
      owner,
      [a],
      { ...input, kind: "start", dateOnly: true },
      now,
    );
    service.scheduleTaskReminders(
      owner,
      [a],
      { ...input, deadlineAt: now + 7200_000 },
      now,
    );
    expect(
      service.listTaskReminders(owner, now).filter((r) => r.taskId === a.id),
    ).toHaveLength(2);
    expect(one(a.id, viewer).deadlineAt).toBe(input.deadlineAt);
    expect(
      tasks.listTasks(owner).find((t) => t.id === a.id)?.dueDate,
    ).toBeNull();
    expect(JSON.stringify(service.listTaskReminders(owner, now))).not.toContain(
      "claimToken",
    );
  });
  it("leases deliveries, retries after expiry, persists acknowledgement and rejects stale callbacks", () => {
    const task = create("Durável");
    service.scheduleTaskReminders(owner, [task], input, now);
    const due = input.deadlineAt - input.leadMinutes * 60_000;
    expect(service.claimTaskReminders(owner.userId, due - 1)).toHaveLength(0);
    const first = service
      .claimTaskReminders(owner.userId, due)
      .find((r) => r.taskId === task.id)!;
    expect(first).toBeDefined();
    expect(
      service
        .claimTaskReminders(owner.userId, due + 1000)
        .some((r) => r.id === first.id),
    ).toBe(false);
    const retry = service
      .claimTaskReminders(owner.userId, due + 120_001)
      .find((r) => r.id === first.id)!;
    expect(retry.claimToken).not.toBe(first.claimToken);
    expect(
      service.nativeReminderResult(
        owner.userId,
        first.id,
        first.claimToken,
        "shown",
        due,
      ),
    ).toBe(false);
    expect(
      service.nativeReminderResult(
        viewer.userId,
        retry.id,
        retry.claimToken,
        "shown",
        due,
      ),
    ).toBe(false);
    expect(
      service.nativeReminderResult(
        owner.userId,
        retry.id,
        retry.claimToken,
        "shown",
        due,
      ),
    ).toBe(true);
    expect(
      service
        .claimTaskReminders(owner.userId, due + 86400_000)
        .some((r) => r.id === retry.id),
    ).toBe(false);
    expect(one(task.id).state).toBe("delivered");
    service.nativeReminderResult(
      owner.userId,
      retry.id,
      retry.claimToken,
      "snooze",
      due,
    );
    expect(one(task.id)).toMatchObject({
      state: "scheduled",
      snoozed: true,
      nextAt: due + 30 * 60_000,
    });
    expect(
      service.nativeReminderResult(
        owner.userId,
        retry.id,
        retry.claimToken,
        "dismiss",
        due,
      ),
    ).toBe(false);
  });
  it("surfaces delivery failure, retries with backoff and makes inbox-only reminders available", () => {
    const task = create("Falha recuperável"),
      inbox = create("Só na central");
    service.scheduleTaskReminders(owner, [task], input, now);
    service.scheduleTaskReminders(
      owner,
      [inbox],
      { ...input, channel: "inbox" },
      now,
    );
    const due = input.deadlineAt;
    const delivery = service
      .claimTaskReminders(owner.userId, due)
      .find((r) => r.taskId === task.id)!;
    expect(
      service
        .claimTaskReminders(owner.userId, due)
        .some((r) => r.taskId === inbox.id),
    ).toBe(false);
    service.nativeReminderResult(
      owner.userId,
      delivery.id,
      delivery.claimToken,
      "failed",
      due,
    );
    expect(one(task.id).lastError).toMatch(/permissões/);
    expect(
      service
        .claimTaskReminders(owner.userId, due + 10_000)
        .some((r) => r.id === delivery.id),
    ).toBe(false);
    expect(
      service
        .claimTaskReminders(owner.userId, due + 300_001)
        .some((r) => r.id === delivery.id),
    ).toBe(true);
    expect(one(inbox.id).state).toBe("delivered");
  });
  it("protects snoozes and dismissals with owner, membership and version checks", () => {
    const task = create("Adiar");
    service.scheduleTaskReminders(owner, [task], input, now);
    const reminder = one(task.id);
    expect(() =>
      service.changeTaskReminder(
        viewer,
        reminder.id,
        reminder.version,
        "dismiss",
      ),
    ).toThrow(/encontrado/);
    expect(() =>
      service.changeTaskReminder(owner, reminder.id, 99, "dismiss"),
    ).toThrow(/mudou/);
    expect(() =>
      service.changeTaskReminder(
        owner,
        reminder.id,
        reminder.version,
        "snooze",
        now,
        now,
      ),
    ).toThrow(/posterior/);
    service.changeTaskReminder(
      owner,
      reminder.id,
      reminder.version,
      "snooze",
      input.deadlineAt + 600_000,
      now,
    );
    expect(one(task.id).nextAt).toBe(input.deadlineAt + 600_000);
    service.changeTaskReminder(
      owner,
      reminder.id,
      one(task.id).version,
      "dismiss",
    );
    expect(one(task.id)).toBeUndefined();
  });
  it("snoozes future reminders relative to each original delivery, without anticipating any", () => {
    const a = create("Hoje"),
      b = create("Amanhã");
    service.scheduleTaskReminders(owner, [a], input, now);
    service.scheduleTaskReminders(
      owner,
      [b],
      { ...input, deadlineAt: input.deadlineAt + 86400_000 },
      now,
    );
    const first = one(a.id),
      second = one(b.id);
    expect(() =>
      service.changeTaskReminder(
        owner,
        first.id,
        first.version,
        "snooze",
        now + 60_000,
        now,
      ),
    ).toThrow(/posterior/);
    service.changeTaskReminders(
      owner,
      [first, second],
      "snooze",
      undefined,
      now,
      15,
    );
    expect(one(a.id).nextAt).toBe(first.nextAt + 15 * 60_000);
    expect(one(b.id).nextAt).toBe(second.nextAt + 15 * 60_000);
    expect(one(b.id).nextAt - one(a.id).nextAt).toBe(86400_000);
  });
  it("permanently cancels satisfied reminders on start, completion and archive", () => {
    const task = create("Ciclo de vida");
    for (const kind of ["start", "finish", "followup"] as const)
      service.scheduleTaskReminders(owner, [task], { ...input, kind }, now);
    const started = tasks.updateTask(owner, task.id, task.version, {
      status: "doing",
    });
    expect(
      service
        .listTaskReminders(owner, now)
        .filter((r) => r.taskId === task.id)
        .map((r) => r.kind),
    ).toEqual(["finish", "followup"]);
    const done = tasks.updateTask(owner, task.id, started.version, {
      status: "done",
    });
    const reopened = tasks.updateTask(owner, task.id, done.version, {
      status: "todo",
    });
    expect(one(task.id)).toBeUndefined();
    expect(() =>
      service.scheduleTaskReminders(owner, [done], input, now),
    ).toThrow(/mudou/);
    service.scheduleTaskReminders(owner, [reopened], input, now);
    tasks.archiveTask(owner, task.id, reopened.version, true);
    expect(one(task.id)).toBeUndefined();
  });
  it("rolls back the entire reminder batch when a selection changes", () => {
    const a = create("Lote A"),
      b = create("Lote B");
    service.scheduleTaskReminders(owner, [a, b], input, now);
    const first = one(a.id),
      second = one(b.id);
    expect(() =>
      service.changeTaskReminders(
        owner,
        [first, { ...second, version: 99 }],
        "snooze",
        input.deadlineAt + 600_000,
        now,
      ),
    ).toThrow(/mudou/);
    expect(one(a.id)).toMatchObject({
      version: first.version,
      nextAt: first.nextAt,
      snoozed: false,
    });
    service.changeTaskReminders(
      owner,
      [first, second],
      "snooze",
      input.deadlineAt + 600_000,
      now,
    );
    expect(one(a.id).nextAt).toBe(input.deadlineAt + 600_000);
    expect(one(b.id).nextAt).toBe(input.deadlineAt + 600_000);
  });
  it("stops delivery and navigation immediately after membership is removed", () => {
    const task = create("Acesso removido");
    service.scheduleTaskReminders(viewer, [task], input, now);
    const id = one(task.id, viewer).id;
    database
      .getDb()
      .delete(database.schema.workspaceMembers)
      .where(eq(database.schema.workspaceMembers.userId, viewer.userId))
      .run();
    expect(
      service.claimTaskReminders(viewer.userId, input.deadlineAt),
    ).toHaveLength(0);
    expect(() => service.reminderDestination(viewer.userId, id)).toThrow(
      /encontrado/,
    );
  });
});
describe("desktop reminders endpoint", () => {
  it("requires both the desktop gate and a valid user session", async () => {
    const { POST } = await import("@/app/api/desktop/reminders/route");
    process.env.WAYPOINT_DESKTOP_SECRET = "test-desktop-secret";
    const request = (key?: string) =>
      new Request("http://localhost/api/desktop/reminders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(key ? { "x-waypoint-desktop": key } : {}),
        },
        body: JSON.stringify({ action: "poll" }),
      });
    expect((await POST(request())).status).toBe(403);
    expect((await POST(request("test-desktop-secret"))).status).toBe(401);
    current.user = { id: "owner", name: "Owner", email: "owner@test.local" };
    expect((await POST(request("wrong"))).status).toBe(403);
    expect((await POST(request("test-desktop-secret"))).status).toBe(200);
    delete process.env.WAYPOINT_DESKTOP_SECRET;
  });
});
