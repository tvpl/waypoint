import { NextResponse } from "next/server";
import { getWorkspaceContext, UserError } from "@/server/services/workspaces";
import { importBackupFile } from "@/server/services/backups";

const MAX_BYTES = 80 * 1024 * 1024;

/** POST /api/backups/upload (raw file body) → stores it as a restore point of the current workspace. */
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return NextResponse.json({ error: "Arquivo grande demais (máx. 80 MB)." }, { status: 413 });
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > MAX_BYTES) return NextResponse.json({ error: "Arquivo grande demais (máx. 80 MB)." }, { status: 413 });
  try {
    const backup = importBackupFile({ workspaceId: ctx.workspace.id, userId: ctx.user.id }, body);
    return NextResponse.json({ backup });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[backups] upload failed", e);
    return NextResponse.json({ error: "Não foi possível ler o backup." }, { status: 500 });
  }
}
