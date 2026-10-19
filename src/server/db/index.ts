import "server-only";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { applyDatabaseUpdate, inspectDatabase, saveCopyBeforeUpdate, type DatabaseStatus } from "./migrations";

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };
export type { DatabaseStatus };

export const databaseFile = () => process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "waypoint.db");
const migrationsFolder = () => path.join(process.cwd(), "drizzle");
/** Headless servers: back up and update on open instead of waiting for the update dialog. */
const autoUpdate = () => process.env.WAYPOINT_AUTO_UPDATE === "1";

/** Thrown by getDb() while an update waits for the dialog: no query ever runs against an older schema. */
export class DatabaseUpdateRequired extends Error {
  constructor() {
    super("O banco de dados precisa ser atualizado para esta versão do Waypoint. Abra o app para fazer o backup e atualizar (ou defina WAYPOINT_AUTO_UPDATE=1).");
    this.name = "DatabaseUpdateRequired";
  }
}

type Opened = { db: DB; status: DatabaseStatus };

function open(): Opened {
  const file = databaseFile();
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema }) as DB;
  let status = inspectDatabase(sqlite, migrationsFolder());
  // A new installation has nothing to back up; with WAYPOINT_AUTO_UPDATE the copy is taken here.
  if (status.state === "pending" && (status.empty || autoUpdate())) {
    if (!status.empty && file !== ":memory:") console.info(`[db] backup before the update: ${saveCopyBeforeUpdate(sqlite, file, status)}`);
    applyDatabaseUpdate(sqlite, migrationsFolder());
    status = inspectDatabase(sqlite, migrationsFolder());
  }
  if (status.state === "newer") console.warn("[db] this database was updated by a newer version of Waypoint; update the app to use every feature safely.");
  return { db, status };
}

const g = globalThis as unknown as { __waypointDb?: Opened };
const opened = () => (g.__waypointDb ??= open());

/** Lazily opened singleton (survives dev hot reloads). Throws DatabaseUpdateRequired while an update is pending. */
export function getDb(): DB {
  const o = opened();
  if (o.status.state === "pending") throw new DatabaseUpdateRequired();
  return o.db;
}

/** The raw connection, also while an update is pending: only for whole-file copies and the update itself. */
export function getClient(): Database.Database {
  return opened().db.$client;
}

export function databaseStatus(): DatabaseStatus {
  return opened().status;
}

/** Runs the pending migrations and data upgrades (one transaction: all or nothing). */
export function updateDatabase(): DatabaseStatus {
  const o = opened();
  if (o.status.state !== "pending") return o.status;
  try {
    applyDatabaseUpdate(o.db.$client, migrationsFolder());
  } finally {
    o.status = inspectDatabase(o.db.$client, migrationsFolder());
  }
  return o.status;
}

/** Closes the connection; the next getDb() reopens the file (used to restore a backup in place). */
export function closeDb() {
  g.__waypointDb?.db.$client.close();
  g.__waypointDb = undefined;
}

export { schema };
