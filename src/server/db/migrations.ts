import "server-only";
import type Database from "better-sqlite3";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import fs from "node:fs";
import path from "node:path";
import { DATA_UPGRADES, type DataUpgrade } from "./upgrades";

/**
 * The database update: the SQL migrations in drizzle/ plus the data upgrades (./upgrades.ts).
 * Applied migrations are recorded the way drizzle's own migrator does (`__drizzle_migrations`,
 * by journal timestamp), so both stay interchangeable. An existing database is never changed
 * on open: ./index.ts asks first (the update dialog), so a backup can be taken before.
 */

const MIGRATIONS_TABLE = "__drizzle_migrations";

export type PendingStep = { kind: "schema" | "data"; id: string; description?: string };

export type DatabaseStatus = {
  /** `newer`: written by a later version of Waypoint than this one. */
  state: "current" | "pending" | "newer";
  /** Nothing stored yet (a new installation): updated without asking. */
  empty: boolean;
  /** Migrations applied / migrations this version ships. */
  version: number;
  target: number;
  /** Oldest first. */
  pending: PendingStep[];
};

type Migration = MigrationMeta & { tag: string };
type Step = { kind: "schema"; migration: Migration } | { kind: "data"; upgrade: DataUpgrade };

function readMigrations(folder: string): Migration[] {
  const journal = JSON.parse(fs.readFileSync(path.join(folder, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
  return readMigrationFiles({ migrationsFolder: folder }).map((m, i) => ({ ...m, tag: journal.entries[i].tag }));
}

const hasTable = (c: Database.Database, name: string) => !!c.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(name);

function plan(c: Database.Database, folder: string, upgrades: DataUpgrade[]) {
  const migrations = readMigrations(folder);
  const tags = new Set(migrations.map((m) => m.tag));
  for (const u of upgrades) if (!tags.has(u.after)) throw new Error(`Data upgrade "${u.id}" runs after an unknown migration: ${u.after}`);

  const at = hasTable(c, MIGRATIONS_TABLE) ? (c.prepare(`select max(created_at) as at from ${MIGRATIONS_TABLE}`).get() as { at: number | null }).at : null;
  const last = at == null ? null : Number(at);
  const done = new Set(hasTable(c, "data_upgrades") ? (c.prepare("select id from data_upgrades").pluck().all() as string[]) : []);

  const steps: Step[] = [];
  for (const m of migrations) {
    if (last == null || last < m.folderMillis) steps.push({ kind: "schema", migration: m });
    for (const u of upgrades) if (u.after === m.tag && !done.has(u.id)) steps.push({ kind: "data", upgrade: u });
  }
  return { migrations, last, steps };
}

export function inspectDatabase(c: Database.Database, folder: string, upgrades = DATA_UPGRADES): DatabaseStatus {
  const { migrations, last, steps } = plan(c, folder, upgrades);
  const empty = !c.prepare("select 1 from sqlite_master where type = 'table' and name not like 'sqlite_%' and name != ? limit 1").get(MIGRATIONS_TABLE);
  const newest = migrations.at(-1)?.folderMillis ?? 0;
  return {
    state: steps.length ? "pending" : last != null && last > newest ? "newer" : "current",
    empty,
    version: last == null ? 0 : migrations.filter((m) => m.folderMillis <= last).length,
    target: migrations.length,
    pending: steps.map((s) => (s.kind === "schema" ? { kind: "schema", id: s.migration.tag } : { kind: "data", id: s.upgrade.id, description: s.upgrade.description })),
  };
}

/**
 * A complete, consistent copy of the database as it is before the update, in `backups/` next to
 * it and in WAYPOINT_BACKUP_DIR when set. Going back is putting the copy in place of the database
 * (this version will offer the update again). Returns the copy's path.
 */
export function saveCopyBeforeUpdate(c: Database.Database, dbFile: string, status: DatabaseStatus): string {
  const dir = path.join(path.dirname(path.resolve(dbFile)), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const name = `pre-update-${new Date().toISOString().replace(/[:.]/g, "-")}-v${status.version}.db`;
  const file = path.join(dir, name);
  c.prepare("vacuum into ?").run(file);
  const extra = process.env.WAYPOINT_BACKUP_DIR?.trim();
  if (extra && path.isAbsolute(extra)) {
    try {
      fs.mkdirSync(path.join(extra, "database"), { recursive: true });
      fs.copyFileSync(file, path.join(extra, "database", name));
    } catch (e) {
      console.error("[db] could not copy the pre-update backup to WAYPOINT_BACKUP_DIR", e);
    }
  }
  return file;
}

const foreignKeyProblems =(c: Database.Database) => c.prepare("pragma foreign_key_check").all().length;

/**
 * Applies every pending step in one transaction: on any error nothing changes. Foreign keys are
 * off meanwhile (SQLite's recipe for schema changes: a table rebuilt by a migration must not
 * cascade deletes into the rows that point at it) and checked before committing.
 */
export function applyDatabaseUpdate(c: Database.Database, folder: string, upgrades = DATA_UPGRADES) {
  const { steps } = plan(c, folder, upgrades);
  if (!steps.length) return;
  c.exec(`CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`);
  const fk = c.pragma("foreign_keys", { simple: true }) === 1;
  const before = fk ? foreignKeyProblems(c) : 0;
  c.pragma("foreign_keys = OFF");
  try {
    c.transaction(() => {
      for (const s of steps) {
        if (s.kind === "schema") {
          for (const stmt of s.migration.sql) c.exec(stmt);
          c.prepare(`insert into "${MIGRATIONS_TABLE}" ("hash", "created_at") values (?, ?)`).run(s.migration.hash, s.migration.folderMillis);
        } else {
          s.upgrade.run(c);
          c.prepare("insert into data_upgrades (id, applied_at) values (?, ?)").run(s.upgrade.id, Date.now());
        }
      }
      if (fk && foreignKeyProblems(c) > before) throw new Error("A atualização deixaria referências inválidas entre os dados.");
    })();
  } finally {
    if (fk) c.pragma("foreign_keys = ON");
  }
}
