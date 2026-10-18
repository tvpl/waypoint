import { beforeAll, describe, expect, it } from "vitest";
process.env.DATABASE_PATH = ":memory:";
let t: typeof import("./tasks");
let h: typeof import("./task-history");
let m: typeof import("./marks");
const owner = { workspaceId: "ws1", userId: "owner" };
const editor = { workspaceId: "ws1", userId: "editor" };
const viewer = { workspaceId: "ws1", userId: "viewer" };
const outsider = { workspaceId: "ws2", userId: "outsider" };
beforeAll(async () => {
  const { getDb, schema } = await import("../db");
  t = await import("./tasks");
  h = await import("./task-history");
  m = await import("./marks");
  const db = getDb();
  db.insert(schema.users).values(["owner", "editor", "viewer", "outsider"].map((id) => ({ id, name: id, email: `${id}@t.local`, passwordHash: "x" }))).run();
  db.insert(schema.workspaces).values([{ id: "ws1", name: "Equipe" }, { id: "ws2", name: "Outra" }]).run();
  db.insert(schema.workspaceMembers)
    .values([
      { workspaceId: "ws1", userId: "owner", role: "owner" },
      { workspaceId: "ws1", userId: "editor", role: "editor" },
      { workspaceId: "ws1", userId: "viewer", role: "viewer" },
      { workspaceId: "ws2", userId: "outsider", role: "owner" },
    ])
    .run();
});

describe("task history", () => {
  it("records creation, edits, stage changes and archive", () => {
    const task = t.createTask(owner, { title: "Proposta" });
    const edited = t.updateTask(owner, task.id, task.version, { title: "Proposta final", dueDate: "2026-10-20" });
    t.moveTask(owner, task.id, edited.version, "doing", null);
    const moved = t.listTasks(owner).find((x) => x.id === task.id)!;
    const done = t.updateTask(editor, task.id, moved.version, { status: "done" });
    t.archiveTask(owner, task.id, done.version, true);
    const events = h.listTaskHistory(viewer, task.id);
    expect(events.map((e) => e.kind)).toEqual(["created", "updated", "status", "status", "archived"]);
    expect(events[1].body).toBe("título e prazo");
    expect(events[2]).toMatchObject({ fromStatus: "todo", toStatus: "doing", userName: "owner" });
    expect(events[3]).toMatchObject({ toStatus: "done", userName: "editor" });
    expect(t.listTasks(owner).find((x) => x.id === task.id)!.createdAt).toBeGreaterThan(0);
  });

  it("does not log a reorder within the same column", () => {
    const a = t.createTask(owner, { title: "A" });
    t.createTask(owner, { title: "B" });
    t.moveTask(owner, a.id, a.version, "todo", null);
    expect(h.listTaskHistory(owner, a.id).map((e) => e.kind)).toEqual(["created"]);
  });

  it("marks imports", () => {
    t.importTasks(owner, "- [ ] Importada");
    const task = t.listTasks(owner).find((x) => x.title === "Importada")!;
    expect(h.listTaskHistory(owner, task.id)[0].kind).toBe("imported");
  });

  it("adds observations with permissions", () => {
    const task = t.createTask(owner, { title: "Com notas" });
    const note = h.addTaskNote(editor, task.id, "  Cliente pediu ajuste  ");
    expect(note).toMatchObject({ kind: "note", body: "Cliente pediu ajuste", userName: "editor" });
    expect(() => h.addTaskNote(viewer, task.id, "x")).toThrow(/permissão/);
    expect(() => h.addTaskNote(outsider, task.id, "x")).toThrow();
    expect(() => h.addTaskNote(owner, task.id, "   ")).toThrow();
    expect(() => h.listTaskHistory(outsider, task.id)).toThrow();
    const other = h.addTaskNote(owner, task.id, "Do owner");
    expect(() => h.deleteTaskNote(editor, other.id)).toThrow(/Só quem escreveu/);
    h.deleteTaskNote(owner, note.id);
    expect(h.listTaskHistory(owner, task.id).filter((e) => e.kind === "note").map((e) => e.body)).toEqual(["Do owner"]);
    const created = h.listTaskHistory(owner, task.id)[0];
    expect(() => h.deleteTaskNote(owner, created.id)).toThrow(/não encontrada/);
    const many = h.historyForTasks(owner, [task.id]);
    expect(many.get(task.id)!.length).toBe(2);
  });

  it("stars tasks per person and lists important items", () => {
    const task = t.createTask(owner, { title: "Importante" });
    expect(m.toggleImportant(viewer, "task", task.id)).toBe(true);
    expect(m.starredIds("viewer", "task").has(task.id)).toBe(true);
    expect(m.starredIds("owner", "task").has(task.id)).toBe(false);
    expect(m.importantItems(viewer).map((i) => i.title)).toEqual(["Importante"]);
    expect(() => m.toggleImportant(outsider, "task", task.id)).toThrow();
    expect(m.toggleImportant(viewer, "task", task.id)).toBe(false);
  });
});

describe("recurring tasks", () => {
  it("creates the next occurrence once per completion", () => {
    const task = t.createTask(owner, { title: "Fechar caixa", recurrence: "weekly", dueDate: "2030-01-07", subtasks: [{ id: "a", title: "Conferir", done: true }] });
    const done = t.updateTask(owner, task.id, task.version, { status: "done" });
    const next = t.listTasks(owner).filter((x) => x.title === "Fechar caixa" && x.status === "todo");
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ dueDate: "2030-01-14", recurrence: "weekly" });
    expect(next[0].subtasks[0].done).toBe(false);
    expect(h.listTaskHistory(owner, next[0].id)[0].body).toMatch(/^recurrence:/);
    // Reopen and complete again: no duplicate.
    const reopened = t.updateTask(owner, task.id, done.version, { status: "todo" });
    t.updateTask(owner, task.id, reopened.version, { status: "done" });
    expect(t.listTasks(owner).filter((x) => x.title === "Fechar caixa" && x.status === "todo")).toHaveLength(1);
  });
});

describe("weekly review", () => {
  it("counts completions per day in the person's time zone", async () => {
    const d = await import("./dashboard");
    const { getDb, schema } = await import("../db");
    const { eq } = await import("drizzle-orm");
    const task = t.createTask(owner, { title: "Fechada tarde da noite" });
    t.updateTask(owner, task.id, task.version, { status: "done" });
    // Sunday 23:30 in São Paulo = Monday 02:30 UTC.
    getDb().update(schema.tasks).set({ completedAt: new Date("2026-10-19T02:30:00Z") }).where(eq(schema.tasks.id, task.id)).run();
    const now = new Date("2026-10-19T12:00:00Z");
    const sp = d.weeklyReview(owner, now, "America/Sao_Paulo");
    expect(sp.days[0].date).toBe("2026-10-19");
    expect(sp.days[0].completed).toBe(0); // it belongs to last week there
    const utc = d.weeklyReview(owner, now, "UTC");
    expect(utc.days[0].completed).toBeGreaterThanOrEqual(1);
  });
});
