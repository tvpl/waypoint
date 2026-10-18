import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
process.env.DATABASE_PATH = ":memory:";

let b: typeof import("./backups");
let t: typeof import("./tasks");
let h: typeof import("./task-history");
let plans: typeof import("./plans");
let links: typeof import("./links");
let tags: typeof import("./tags");
let search: typeof import("./search");
let db: ReturnType<typeof import("../db").getDb>;
let schema: typeof import("../db").schema;

const owner = { workspaceId: "ws1", userId: "owner" };
const editor = { workspaceId: "ws1", userId: "editor" };
const viewer = { workspaceId: "ws1", userId: "viewer" };
const doc = (title: string) => ({ schemaVersion: 1, nodes: [{ id: "n1", kind: "block", x: 0, y: 0, width: 200, height: 80, data: { title } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

beforeAll(async () => {
  const mod = await import("../db");
  db = mod.getDb();
  schema = mod.schema;
  b = await import("./backups");
  t = await import("./tasks");
  h = await import("./task-history");
  plans = await import("./plans");
  links = await import("./links");
  tags = await import("./tags");
  search = await import("./search");
  db.insert(schema.users)
    .values(["owner", "editor", "viewer", "other"].map((id) => ({ id, name: id, email: `${id}@t.local`, passwordHash: "x" })))
    .run();
  db.insert(schema.workspaces).values([{ id: "ws1", name: "Equipe" }, { id: "ws2", name: "Outro" }]).run();
  db.insert(schema.workspaceMembers)
    .values([
      { workspaceId: "ws1", userId: "owner", role: "owner" },
      { workspaceId: "ws1", userId: "editor", role: "editor" },
      { workspaceId: "ws1", userId: "viewer", role: "viewer" },
      { workspaceId: "ws2", userId: "other", role: "owner" },
    ])
    .run();
});

function seed() {
  const planId = plans.createPlan({ workspaceId: "ws1", userId: "owner", title: "Arquitetura", document: doc("API") as never, tags: ["infra"] });
  const privateOfEditor = plans.createPlan({ workspaceId: "ws1", userId: "editor", title: "Rascunho do editor", visibility: "private" });
  const colId = links.createCollection({ workspaceId: "ws1", userId: "owner", name: "Referências" });
  const childId = links.createCollection({ workspaceId: "ws1", userId: "owner", name: "Docs", parentId: colId });
  const favId = links.createFavorite("ws1", "owner", { url: "https://example.com/a", title: "Exemplo", collectionId: childId, tags: ["leitura"] });
  const project = t.saveTaskProject(owner, { name: "Site", color: "mint" });
  const task = t.createTask(owner, { title: "Publicar", projectId: project });
  h.addTaskNote(owner, task.id, "Aprovado pelo cliente");
  const dep = t.createTask(owner, { title: "Revisar", dependsOn: [task.id] });
  db.insert(schema.userMarks).values({ userId: "owner", entityType: "plan", entityId: planId, mark: "star" }).run();
  return { planId, privateOfEditor, colId, childId, favId, project, task, dep };
}

describe("backups", () => {
  it("enforces roles", () => {
    expect(() => b.createBackup(viewer)).toThrow(/owners e editors/);
    expect(() => b.listBackups(viewer)).toThrow();
    expect(() => b.restoreWorkspace(editor, "x")).toThrow(/owners/);
    expect(() => b.saveBackupSettings(editor, { frequency: "off", keep: 7 })).toThrow(/owners/);
    expect(() => b.createBackup({ workspaceId: "ws1", userId: "other" })).toThrow(/permissão/);
  });

  it("recovers deleted and changed items, and restores the whole workspace", () => {
    const s = seed();
    const backupId = b.createBackup(editor, "Antes da limpeza");
    const [summary] = b.listBackups(owner);
    expect(summary).toMatchObject({ id: backupId, kind: "manual", note: "Antes da limpeza", foreign: false, createdByName: "editor" });
    expect(summary.counts).toMatchObject({ plans: 2, collections: 2, favorites: 1, tasks: 2, taskProjects: 1 });

    // Damage: delete things, change a task and a plan, add something new.
    plans.purgePlan(s.planId);
    links.purgeCollection(s.colId);
    t.deleteTaskProject(owner, s.project);
    const current = t.listTasks(owner).find((x) => x.id === s.task.id)!;
    t.updateTask(owner, s.task.id, current.version, { title: "Publicar (mudou)", status: "done" });
    const depNow = t.listTasks(owner).find((x) => x.id === s.dep.id)!;
    t.archiveTask(owner, s.dep.id, depNow.version, true);
    db.delete(schema.tasks).where(eq(schema.tasks.id, s.dep.id)).run();
    const added = t.createTask(owner, { title: "Nova depois do backup" });

    const { items } = b.listRecoverable(editor, backupId);
    const keys = items.map((i) => `${i.key}:${i.state}`);
    expect(keys).toEqual(
      expect.arrayContaining([
        `plan:${s.planId}:deleted`,
        `collection:${s.colId}:deleted`,
        `collection:${s.childId}:deleted`,
        `project:${s.project}:deleted`,
        `task:${s.task.id}:changed`,
        `task:${s.dep.id}:deleted`,
      ]),
    );
    // The editor's private plan is visible to them…
    expect(items.some((i) => i.id === s.privateOfEditor)).toBe(false);

    const n = b.recoverItems(editor, backupId, [`plan:${s.planId}`, `collection:${s.colId}`, `collection:${s.childId}`, `project:${s.project}`, `task:${s.task.id}`, `task:${s.dep.id}`]);
    expect(n).toBe(6);
    expect(items.some((i) => i.id === s.favId)).toBe(false);
    expect(plans.getPlan(s.planId)?.title).toBe("Arquitetura");
    expect(plans.getDraft(s.planId).document.nodes[0].data.title).toBe("API");
    expect(tags.tagsForPlans([s.planId]).get(s.planId)).toEqual(["infra"]);
    expect(links.getCollection(s.childId)?.parentId).toBe(s.colId);
    // Links moved out when the collection was deleted go back into it.
    expect(links.getFavorite(s.favId)?.collectionId).toBe(s.childId);
    expect(tags.tagsForFavorites([s.favId]).get(s.favId)).toEqual(["leitura"]);
    const restoredTask = t.listTasks(owner).find((x) => x.id === s.task.id)!;
    expect(restoredTask).toMatchObject({ title: "Publicar", status: "todo", projectId: s.project });
    expect(t.listTasks(owner).find((x) => x.id === s.dep.id)?.dependsOn).toEqual([s.task.id]);
    const history = h.listTaskHistory(owner, s.dep.id).map((e) => e.kind);
    expect(history[0]).toBe("created");
    expect(history.at(-1)).toBe("restored");
    expect(search.searchIndex("ws1", "Arquitetura").some((r) => r.id === s.planId)).toBe(true);
    expect(() => b.recoverItems(editor, backupId, [`plan:${s.planId}`])).toThrow(/Nada para recuperar/);

    // A full restore takes a safety copy, brings back the snapshot and removes what came later.
    b.restoreWorkspace(owner, backupId);
    expect(t.listTasks(owner).some((x) => x.id === added.id)).toBe(false);
    expect(t.listTasks(owner).map((x) => x.title).sort()).toEqual(["Publicar", "Revisar"]);
    expect(h.listTaskHistory(owner, s.task.id).some((e) => e.body === "Aprovado pelo cliente")).toBe(true);
    expect(plans.getPlan(s.privateOfEditor)).toBeTruthy();
    expect(db.select().from(schema.userMarks).all().some((m) => m.entityId === s.planId)).toBe(true);
    expect(search.searchIndex("ws1", "Publicar").length).toBeGreaterThan(0);
    const kinds = b.listBackups(owner).map((x) => x.kind);
    expect(kinds).toContain("safety");

    // …and the safety copy undoes the restore.
    const safety = b.listBackups(owner).find((x) => x.kind === "safety")!;
    b.restoreWorkspace(owner, safety.id);
    expect(t.listTasks(owner).some((x) => x.id === added.id)).toBe(true);
  });

  it("keeps other people's private plans out of downloads and through restores", () => {
    const mine = plans.createPlan({ workspaceId: "ws1", userId: "editor", title: "Só meu", visibility: "private" });
    const backupId = b.createBackup(owner);
    const { file, fileName } = b.downloadBackup(owner, backupId);
    expect(fileName).toMatch(/^waypoint-equipe-\d{4}-\d{2}-\d{2}\.json$/);
    expect(file.partial).toBe(true);
    expect(file.tables.plans.some((p) => p.id === mine)).toBe(false);
    expect(file.tables.plan_documents.some((p) => p.plan_id === mine)).toBe(false);

    // Upload the partial file and restore it: the editor's private plan stays.
    const uploaded = b.importBackupFile(owner, Buffer.from(JSON.stringify(file)));
    expect(uploaded).toMatchObject({ kind: "upload", foreign: false });
    b.restoreWorkspace(owner, uploaded.id);
    expect(plans.getPlan(mine)?.title).toBe("Só meu");
    expect(() => b.importBackupFile(owner, Buffer.from("{}"))).toThrow(/não é um backup/);
  });

  it("creates a new workspace from a backup with fresh ids", () => {
    const backupId = b.createBackup(owner);
    const { id, name } = b.restoreAsNewWorkspace(owner, backupId);
    expect(name).toBe("Equipe (restaurado)");
    const actor = { workspaceId: id, userId: "owner" };
    const copied = t.listTasks(actor);
    const original = t.listTasks(owner);
    expect(copied.map((x) => x.title).sort()).toEqual(original.map((x) => x.title).sort());
    expect(copied.some((x) => original.some((o) => o.id === x.id))).toBe(false);
    // Dependencies point at the copies.
    const revisar = copied.find((x) => x.title === "Revisar")!;
    expect(copied.some((x) => x.id === revisar.dependsOn[0])).toBe(true);
    // Only the restoring person is a member; other people's marks and private plans don't come.
    expect(db.select().from(schema.workspaceMembers).all().filter((m) => m.workspaceId === id).map((m) => m.userId)).toEqual(["owner"]);
    expect(search.searchIndex(id, "Publicar").length).toBeGreaterThan(0);
  });

  it("schedules automatic restore points and prunes old ones", () => {
    const now = Date.now();
    expect(b.maybeAutoBackup("ws2", now)).toBe(true);
    expect(b.maybeAutoBackup("ws2", now + 60_000)).toBe(false);
    expect(b.maybeAutoBackup("ws2", now + 25 * 3_600_000)).toBe(true);
    b.saveBackupSettings({ workspaceId: "ws2", userId: "other" }, { frequency: "off", keep: 7 });
    expect(b.maybeAutoBackup("ws2", now + 100 * 3_600_000)).toBe(false);
    b.saveBackupSettings({ workspaceId: "ws2", userId: "other" }, { frequency: "daily", keep: 7 });
    for (let i = 0; i < 10; i++) b.maybeAutoBackup("ws2", now + (200 + i * 25) * 3_600_000);
    expect(b.listBackups({ workspaceId: "ws2", userId: "other" }).filter((x) => x.kind === "auto")).toHaveLength(7);
    // Backups of another workspace are not reachable.
    const foreign = b.listBackups({ workspaceId: "ws2", userId: "other" })[0];
    expect(() => b.listRecoverable(owner, foreign.id)).toThrow(/não encontrado/);
  });
});

describe("backups outside the database", () => {
  it("encrypts downloads and mirrors restore points to WAYPOINT_BACKUP_DIR", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const crypto = await import("../lib/backup-crypto");
    const { file } = b.downloadBackup(owner, b.createBackup(owner));
    const sealed = crypto.encryptBackup(Buffer.from(JSON.stringify(file)), "senha-forte");
    expect(crypto.isEncryptedBackup(sealed)).toBe(true);
    expect(sealed.toString()).not.toContain(file.workspace.name);
    expect(() => b.importBackupFile(owner, sealed)).toThrow(/protegido por senha/);
    expect(() => b.importBackupFile(owner, sealed, "errada")).toThrow(/Senha incorreta/);
    expect(b.importBackupFile(owner, sealed, "senha-forte").kind).toBe("upload");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-backups-"));
    process.env.WAYPOINT_BACKUP_DIR = dir;
    try {
      const id = b.createBackup(owner);
      const folder = path.join(dir, "workspace-ws1");
      expect(fs.readdirSync(folder).some((f) => f.endsWith(`-${id}.json.gz`))).toBe(true);
      b.deleteBackup(owner, id);
      expect(fs.readdirSync(folder).some((f) => f.includes(id))).toBe(false);
    } finally {
      delete process.env.WAYPOINT_BACKUP_DIR;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
