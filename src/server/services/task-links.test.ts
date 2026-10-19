import { beforeAll, describe, expect, it } from "vitest";
process.env.DATABASE_PATH = ":memory:";
let t: typeof import("./tasks");
let l: typeof import("./task-links");
let tt: typeof import("./task-tags");
let plans: typeof import("./plans");
let links: typeof import("./links");
let tags: typeof import("./tags");
const owner = { workspaceId: "ws1", userId: "owner" };
const viewer = { workspaceId: "ws1", userId: "viewer" };
beforeAll(async () => {
  const { getDb, schema } = await import("../db");
  t = await import("./tasks");
  l = await import("./task-links");
  tt = await import("./task-tags");
  plans = await import("./plans");
  links = await import("./links");
  tags = await import("./tags");
  const db = getDb();
  db.insert(schema.users).values(["owner", "viewer", "other"].map((id) => ({ id, name: id, email: `${id}@t.local`, passwordHash: "x" }))).run();
  db.insert(schema.workspaces).values([{ id: "ws1", name: "A" }, { id: "ws2", name: "B" }]).run();
  db.insert(schema.workspaceMembers)
    .values([
      { workspaceId: "ws1", userId: "owner", role: "owner" },
      { workspaceId: "ws1", userId: "viewer", role: "viewer" },
      { workspaceId: "ws2", userId: "other", role: "owner" },
    ])
    .run();
});

describe("task references", () => {
  it("links tasks to plans, links and collections, with backlinks and access checks", () => {
    const task = t.createTask(owner, { title: "Implementar login" });
    const plan = plans.createPlan({ workspaceId: "ws1", userId: "owner", title: "Arquitetura" });
    const col = links.createCollection({ workspaceId: "ws1", userId: "owner", name: "Docs" });
    const fav = links.createFavorite("ws1", "owner", { url: "https://example.com/oauth", title: "OAuth" });
    const foreign = plans.createPlan({ workspaceId: "ws2", userId: "other", title: "Alheio" });
    const saved = l.setTaskLinks(owner, task.id, [
      { type: "plan", id: plan },
      { type: "favorite", id: fav },
      { type: "collection", id: col },
      { type: "plan", id: plan },
    ]);
    expect(saved.map((s) => s.resource.title)).toEqual(["Arquitetura", "OAuth", "Docs"]);
    expect(l.taskLinkCounts(owner)[task.id]).toBe(3);
    expect(l.tasksLinkedTo(viewer, "plan", plan).map((x) => x.title)).toEqual(["Implementar login"]);
    expect(() => l.setTaskLinks(owner, task.id, [{ type: "plan", id: foreign }])).toThrow(/não está disponível/);
    expect(() => l.setTaskLinks(viewer, task.id, [])).toThrow(/permissão/);
    expect(() => l.listTaskLinks({ workspaceId: "ws2", userId: "other" }, task.id)).toThrow();
    l.setTaskLinks(owner, task.id, [{ type: "favorite", id: fav }]);
    expect(l.listTaskLinks(viewer, task.id).map((x) => x.type)).toEqual(["favorite"]);
  });
});

describe("task tags", () => {
  it("syncs markers into workspace tags and follows renames and deletions", () => {
    const task = t.createTask(owner, { title: "Proposta", tags: ["Cliente VIP", "fin"] });
    tt.syncTaskTags("ws1");
    const names = tags.listTags("ws1", "owner").map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(["cliente-vip", "fin"]));
    expect(tt.taskTagCounts("ws1").get("cliente-vip")).toBe(1);
    expect(tt.tasksWithTag("ws1", "cliente-vip").map((x) => x.id)).toEqual([task.id]);
    tt.retagTasks("ws1", "cliente-vip", "vip");
    expect(t.listTasks(owner).find((x) => x.id === task.id)!.tags).toEqual(["vip", "fin"]);
    tt.retagTasks("ws1", "fin", null);
    expect(t.listTasks(owner).find((x) => x.id === task.id)!.tags).toEqual(["vip"]);
  });
});
