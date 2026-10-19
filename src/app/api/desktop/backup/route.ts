import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getClient } from "@/server/db";
import { hasDesktopKey } from "@/server/desktop";

/**
 * POST /api/desktop/backup { file } → { file, size }
 * Desktop mode only, called by the shell with its key (desktop/src/backups.ts, which owns the
 * backup folder, schedule and retention): writes a consistent snapshot of the database to `file`.
 */
export async function POST(req: Request) {
  if (!hasDesktopKey(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const file = (await req.json().catch(() => null))?.file;
  if (typeof file !== "string" || !path.isAbsolute(file) || !file.endsWith(".db") || !fs.existsSync(path.dirname(file)) || fs.existsSync(file)) {
    return NextResponse.json({ error: "Destino inválido." }, { status: 400 });
  }
  // The raw connection: also works while an update is pending (the backup taken before it).
  await getClient().backup(file);
  return NextResponse.json({ file, size: fs.statSync(file).size });
}
