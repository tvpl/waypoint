import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/server/db";
import { hasDesktopKey } from "@/server/desktop";

const KEEP = 10;
const pad = (n: number) => String(n).padStart(2, "0");
/** Local time, e.g. 20261005-1430. */
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

/**
 * POST /api/desktop/backup { auto?: boolean } → { file, skipped? }
 * Desktop mode only (called by the shell with its key): writes a consistent copy of the database
 * to <data>/backups and keeps the latest ten. `auto` skips when the last backup is under a day old.
 */
export async function POST(req: Request) {
  if (!hasDesktopKey(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dataDir = process.env.WAYPOINT_DATA_DIR;
  if (!dataDir) return NextResponse.json({ error: "WAYPOINT_DATA_DIR não definido." }, { status: 500 });
  const auto = (await req.json().catch(() => null))?.auto === true;

  const dir = path.join(dataDir, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs
    .readdirSync(dir)
    .filter((f) => /^waypoint-\d{8}-\d{4}\.db$/.test(f))
    .sort();
  const latest = existing.at(-1);
  if (auto && latest && Date.now() - fs.statSync(path.join(dir, latest)).mtimeMs < 24 * 60 * 60 * 1000) {
    return NextResponse.json({ file: path.join(dir, latest), skipped: true });
  }

  const file = path.join(dir, `waypoint-${stamp(new Date())}.db`);
  await getDb().$client.backup(file);
  for (const old of [...existing.filter((f) => f !== path.basename(file)), path.basename(file)].slice(0, -KEEP)) {
    fs.rmSync(path.join(dir, old), { force: true });
  }
  return NextResponse.json({ file });
}
