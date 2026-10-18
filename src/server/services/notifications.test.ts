import { beforeAll, describe, expect, it } from "vitest";
process.env.DATABASE_PATH = ":memory:";
let n: typeof import("./notifications");
let db: typeof import("../db");

const owner = { workspaceId: "ws1", userId: "owner" };
const editor = { workspaceId: "ws1", userId: "editor" };
const outsider = { workspaceId: "ws1", userId: "outsider" };
// Real clock: link-health's recentlyBroken looks at the last week from Date.now().
const now = Date.now();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Local day `offset` days from today (YYYY-MM-DD). */
const day = (offset: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return iso(d);
};
const today = day(0);
const ago = (minutes: number) => new Date(now - minutes * 60_000);

beforeAll(async () => {
  db = await import("../db");
  n = await import("./notifications");
  const { getDb, schema } = db;
  const d = getDb();
  d.insert(schema.users)
    .values([
      { id: "owner", name: "Ana Lima", email: "ana@t.local", passwordHash: "x" },
      { id: "editor", name: "Bruno", email: "bruno@t.local", passwordHash: "x" },
      { id: "outsider", name: "Ana", email: "out@t.local", passwordHash: "x" },
    ])
    .run();
  d.insert(schema.workspaces).values([{ id: "ws1", name: "Equipe" }, { id: "ws2", name: "Outra" }]).run();
  d.insert(schema.workspaceMembers)
    .values([
      { workspaceId: "ws1", userId: "owner", role: "owner" },
      { workspaceId: "ws1", userId: "editor", role: "editor" },
      { workspaceId: "ws2", userId: "outsider", role: "owner" },
    ])
    .run();
});

const list = (actor = owner) => n.listNotifications(actor, { userName: actor === owner ? "Ana Lima" : "Bruno", today, now });

describe("notifications", () => {
  it("starts empty and refuses people outside the workspace", () => {
    expect(list()).toEqual({ items: [], unread: 0, seenAt: null });
    expect(() => n.listNotifications(outsider, { userName: "Ana", today, now })).toThrow(/permissão/);
    expect(() => n.markNotificationsSeen(outsider)).toThrow(/permissão/);
  });

  it("gathers overdue tasks, follow-ups and delivered reminders", () => {
    const { getDb, schema } = db;
    getDb()
      .insert(schema.tasks)
      .values([
        { id: "late", workspaceId: "ws1", title: "Proposta", dueDate: day(-3) },
        { id: "follow", workspaceId: "ws1", title: "Cobrar retorno", followUpDate: today },
        { id: "doneLate", workspaceId: "ws1", title: "Feita", dueDate: day(-17), status: "done" },
        { id: "future", workspaceId: "ws1", title: "Depois", dueDate: day(12) },
        { id: "other", workspaceId: "ws2", title: "Outro workspace", dueDate: day(-17) },
      ])
      .run();
    const base = { workspaceId: "ws1", userId: "owner", deadlineAt: now, timeZone: "America/Sao_Paulo" };
    getDb()
      .insert(schema.taskReminders)
      .values([
        { ...base, id: "r1", taskId: "future", kind: "start", nextAt: now - 60_000, state: "delivered", deliveredAt: now - 60_000 },
        { ...base, id: "r2", taskId: "late", kind: "finish", nextAt: now - 7_200_000, state: "dismissed" },
        { ...base, id: "r3", taskId: "follow", kind: "followup", nextAt: now + 3_600_000 },
        { ...base, userId: "editor", id: "r4", taskId: "future", kind: "finish", nextAt: now - 60_000, state: "delivered", deliveredAt: now - 60_000 },
      ])
      .run();
    const res = list();
    expect(res.items.map((i) => i.id)).toEqual(["reminder:r1", "task:follow:followup", "task:late:overdue"]);
    expect(res.items[0]).toMatchObject({ kind: "reminder", title: "Hora de iniciar: Depois", href: "/tasks?open=future", unread: true });
    expect(res.items[2]).toMatchObject({ kind: "overdue", at: new Date(`${day(-2)}T00:00:00`).getTime() });
    expect(res.unread).toBe(3);
  });

  it("includes open threads that mention the person or sit on their plans", () => {
    const { getDb, schema } = db;
    getDb()
      .insert(schema.plans)
      .values([
        { id: "p-own", workspaceId: "ws1", title: "Roadmap", slug: "roadmap", createdBy: "owner" },
        { id: "p-team", workspaceId: "ws1", title: "Arquitetura", slug: "arquitetura", createdBy: "editor" },
        { id: "p-private", workspaceId: "ws1", title: "Rascunho", slug: "rascunho", createdBy: "editor", visibility: "private" },
      ])
      .run();
    getDb()
      .insert(schema.planComments)
      .values([
        // on the owner's plan, by someone else → "comentou"
        { id: "c1", planId: "p-own", userId: "editor", body: "Podemos revisar a fase 2?", createdAt: ago(30), updatedAt: ago(30) },
        // the owner's own thread with no reply → nothing
        { id: "c2", planId: "p-own", userId: "owner", body: "Lembrar de datas", createdAt: ago(20), updatedAt: ago(20) },
        // mention on someone else's plan → "mencionou"
        { id: "c3", planId: "p-team", userId: "editor", body: "Começando", createdAt: ago(50), updatedAt: ago(50) },
        { id: "c3r", planId: "p-team", parentId: "c3", userId: "editor", body: "@Ana Lima, pode olhar?", createdAt: ago(10), updatedAt: ago(10) },
        // resolved thread → nothing
        { id: "c4", planId: "p-team", userId: "editor", body: "@Ana Lima resolvido", resolvedAt: ago(5), createdAt: ago(40), updatedAt: ago(40) },
        // thread without a mention on someone else's plan → nothing
        { id: "c5", planId: "p-team", userId: "editor", body: "Nota solta", createdAt: ago(15), updatedAt: ago(15) },
        // private plan the person can't open → nothing
        { id: "c6", planId: "p-private", userId: "editor", body: "@Ana Lima segredo", createdAt: ago(5), updatedAt: ago(5) },
      ])
      .run();
    const threads = list().items.filter((i) => i.id.startsWith("thread:"));
    expect(threads).toEqual([
      expect.objectContaining({ id: "thread:c3", kind: "mention", title: "Bruno mencionou você em Arquitetura", detail: "@Ana Lima, pode olhar?", href: "/plans/p-team/edit" }),
      expect.objectContaining({ id: "thread:c1", kind: "comment", title: "Bruno comentou em Roadmap" }),
    ]);
    // the editor wrote all of them: nothing for them
    expect(list(editor).items.filter((i) => i.id.startsWith("thread:"))).toEqual([]);
  });

  it("summarizes links that started failing in the last week", () => {
    const { getDb, schema } = db;
    const link = { workspaceId: "ws1", url: "https://x.test", domain: "x.test" };
    getDb()
      .insert(schema.favorites)
      .values([
        { ...link, id: "f1", title: "A", healthStatus: "broken", healthCheckedAt: ago(90) },
        { ...link, id: "f2", title: "B", healthStatus: "unreachable", healthCheckedAt: ago(120) },
        { ...link, id: "f3", title: "C", healthStatus: "broken", healthCheckedAt: ago(60 * 24 * 10) },
        { ...link, id: "f4", title: "D", healthStatus: "ok", healthCheckedAt: ago(5) },
      ])
      .run();
    const broken = list().items.find((i) => i.kind === "broken");
    expect(broken).toMatchObject({ title: "2 links pararam de responder", href: "/links?scope=broken", at: ago(90).getTime() });
  });

  it("marks everything as seen per person and counts what comes after", () => {
    expect(list().unread).toBeGreaterThan(0);
    n.markNotificationsSeen(owner, now);
    expect(n.notificationsSeenAt(owner)).toBe(now);
    const res = list();
    expect(res.unread).toBe(0);
    expect(res.items.every((i) => !i.unread)).toBe(true);
    // the editor's own seen state is untouched
    expect(n.notificationsSeenAt(editor)).toBeNull();

    const { getDb, schema } = db;
    const later = new Date(now + 60_000);
    getDb().insert(schema.planComments).values({ id: "c7", planId: "p-own", userId: "editor", body: "Novidade", createdAt: later, updatedAt: later }).run();
    const after = n.listNotifications(owner, { userName: "Ana Lima", today, now: now + 120_000 });
    expect(after.unread).toBe(1);
    expect(after.items[0]).toMatchObject({ id: "thread:c7", unread: true });
  });
});
