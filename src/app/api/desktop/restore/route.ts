import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { closeDb, getClient } from "@/server/db";
import { hasDesktopKey } from "@/server/desktop";

const SQLITE_MAGIC = "SQLite format 3\0";

/** A Waypoint database: SQLite with the core tables. */
function looksLikeWaypoint(file: string): boolean {
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  if (head.toString("latin1") !== SQLITE_MAGIC) return false;
  const probe = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const tables = probe.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[];
    const names = new Set(tables.map((t) => t.name));
    return ["users", "workspaces", "plans", "favorites"].every((t) => names.has(t));
  } finally {
    probe.close();
  }
}

/**
 * POST /api/desktop/restore { file } → { ok }
 * Desktop mode only, called by the shell with its key after it saved a safety backup: replaces
 * the live database with `file` and reopens it. An older backup then waits for the update dialog
 * (the shell reloads the windows), which offers a backup of it before updating.
 */
export async function POST(req: Request) {
  if (!hasDesktopKey(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const file = (await req.json().catch(() => null))?.file;
  const target = process.env.DATABASE_PATH;
  if (!target) return NextResponse.json({ error: "DATABASE_PATH não definido." }, { status: 500 });
  if (typeof file !== "string" || !path.isAbsolute(file) || !fs.existsSync(file)) return NextResponse.json({ error: "Backup não encontrado." }, { status: 400 });
  if (!looksLikeWaypoint(file)) return NextResponse.json({ error: "Este arquivo não é um backup do Waypoint." }, { status: 400 });

  closeDb();
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(target + suffix, { force: true });
  fs.copyFileSync(file, target);
  getClient();
  return NextResponse.json({ ok: true });
}
