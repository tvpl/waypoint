import { afterAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyDatabaseUpdate, inspectDatabase, saveCopyBeforeUpdate } from "./migrations";
import type { DataUpgrade } from "./upgrades";

const ROOT = path.join(process.cwd(), "drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
const TAGS = journal.entries.map((e) => e.tag);
const LAST = TAGS.at(-1)!;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wp-migrations-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** The migrations folder as an older version shipped it: only the first `n` migrations. */
function olderFolder(n: number): string {
  const dir = path.join(tmp, `drizzle-${n}`);
  if (fs.existsSync(dir)) return dir;
  fs.mkdirSync(path.join(dir, "meta"), { recursive: true });
  fs.writeFileSync(path.join(dir, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, n) }));
  for (const tag of TAGS.slice(0, n)) fs.copyFileSync(path.join(ROOT, `${tag}.sql`), path.join(dir, `${tag}.sql`));
  return dir;
}

const fresh = () => {
  const c = new Database(":memory:");
  c.pragma("foreign_keys = ON");
  return c;
};
/** A database left by an older version (its own drizzle migrator), with a person signed in. */
function olderDatabase(n = TAGS.length - 1, file = ":memory:") {
  const c = new Database(file);
  c.pragma("foreign_keys = ON");
  migrate(drizzle(c), { migrationsFolder: olderFolder(n) });
  c.prepare("insert into users (id, email, name, password_hash) values ('u1', 'a@t.local', 'Ana', 'x')").run();
  c.prepare("insert into sessions (id, user_id, expires_at) values ('s1', 'u1', ?)").run(Date.now() + 60_000);
  return c;
}
const tables = (c: Database.Database) => c.prepare("select name from sqlite_master where type = 'table'").pluck().all() as string[];

describe("database update", () => {
  it("a new database is pending, empty, and ends up current", () => {
    const c = fresh();
    const before = inspectDatabase(c, ROOT, []);
    expect(before).toMatchObject({ state: "pending", empty: true, version: 0, target: TAGS.length });
    expect(before.pending).toHaveLength(TAGS.length);
    applyDatabaseUpdate(c, ROOT, []);
    expect(inspectDatabase(c, ROOT, [])).toMatchObject({ state: "current", version: TAGS.length, pending: [] });
  });

  it("a database from an older version waits for the update and keeps its rows", () => {
    const c = olderDatabase();
    const status = inspectDatabase(c, ROOT, []);
    expect(status).toMatchObject({ state: "pending", empty: false, version: TAGS.length - 1 });
    expect(status.pending).toEqual([{ kind: "schema", id: LAST }]);
    applyDatabaseUpdate(c, ROOT, []);
    expect(inspectDatabase(c, ROOT, []).state).toBe("current");
    expect(c.prepare("select count(*) from sessions").pluck().get()).toBe(1);
  });

  it("brings a very old database up to date without losing data", () => {
    const c = olderDatabase(1);
    expect(inspectDatabase(c, ROOT, []).pending).toHaveLength(TAGS.length - 1);
    applyDatabaseUpdate(c, ROOT, []);
    expect(inspectDatabase(c, ROOT, []).state).toBe("current");
    expect(c.prepare("select name from users").pluck().all()).toEqual(["Ana"]);
    expect(c.prepare("select count(*) from sessions").pluck().get()).toBe(1);
    expect(c.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("is recorded like drizzle's migrator, so either one sees the other's work", () => {
    const c = fresh();
    migrate(drizzle(c), { migrationsFolder: ROOT });
    expect(inspectDatabase(c, ROOT, []).state).toBe("current");
    const d = olderDatabase();
    applyDatabaseUpdate(d, ROOT, []);
    expect(() => migrate(drizzle(d), { migrationsFolder: ROOT })).not.toThrow();
    expect(d.prepare("select count(*) from __drizzle_migrations").pluck().get()).toBe(TAGS.length);
  });

  it("runs data upgrades once, right after their migration", () => {
    const seen: string[][] = [];
    const upgrade: DataUpgrade = { id: "test-upgrade", after: LAST, description: "Teste", run: (c) => void seen.push(tables(c)) };
    const c = olderDatabase();
    expect(inspectDatabase(c, ROOT, [upgrade]).pending).toEqual([
      { kind: "schema", id: LAST },
      { kind: "data", id: "test-upgrade", description: "Teste" },
    ]);
    applyDatabaseUpdate(c, ROOT, [upgrade]);
    applyDatabaseUpdate(c, ROOT, [upgrade]);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("data_upgrades");
    expect(inspectDatabase(c, ROOT, [upgrade]).state).toBe("current");
  });

  it("a failing step rolls back the whole update", () => {
    const broken: DataUpgrade = {
      id: "broken",
      after: LAST,
      description: "Quebra",
      run: (c) => {
        c.prepare("delete from users").run();
        throw new Error("boom");
      },
    };
    const c = olderDatabase();
    expect(() => applyDatabaseUpdate(c, ROOT, [broken])).toThrow("boom");
    expect(inspectDatabase(c, ROOT, [broken])).toMatchObject({ state: "pending", version: TAGS.length - 1 });
    expect(tables(c)).not.toContain("data_upgrades");
    expect(c.prepare("select count(*) from users").pluck().get()).toBe(1);
  });

  it("refuses an upgrade tied to a migration it doesn't know", () => {
    const c = fresh();
    expect(() => inspectDatabase(c, ROOT, [{ id: "x", after: "9999_nope", description: "", run() {} }])).toThrow(/unknown migration/);
  });

  it("notices a database written by a newer version", () => {
    const c = fresh();
    applyDatabaseUpdate(c, ROOT, []);
    expect(inspectDatabase(c, olderFolder(TAGS.length - 1), [])).toMatchObject({ state: "newer", pending: [] });
  });

  it("saves a complete copy that can be updated later", () => {
    const file = path.join(tmp, "live.db");
    const c = olderDatabase(TAGS.length - 1, file);
    const copy = saveCopyBeforeUpdate(c, file, inspectDatabase(c, ROOT, []));
    expect(path.dirname(copy)).toBe(path.join(tmp, "backups"));
    applyDatabaseUpdate(c, ROOT, []);
    const restored = new Database(copy);
    expect(inspectDatabase(restored, ROOT, [])).toMatchObject({ state: "pending", version: TAGS.length - 1 });
    expect(restored.prepare("select name from users").pluck().all()).toEqual(["Ana"]);
  });
});
