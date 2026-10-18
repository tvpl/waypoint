import { NextResponse } from "next/server";
import { getWorkspaceContext, UserError } from "@/server/services/workspaces";
import { downloadBackup } from "@/server/services/backups";
import { encryptBackup } from "@/server/lib/backup-crypto";

/** GET /api/backups/:id → the restore point as a portable .json file (owners only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { file, fileName } = downloadBackup({ workspaceId: ctx.workspace.id, userId: ctx.user.id }, id);
    return new NextResponse(JSON.stringify(file), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
}

/** POST /api/backups/:id { password } → the same file, encrypted with the password (AES-256-GCM). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const password = (await req.json().catch(() => null))?.password;
  if (typeof password !== "string" || password.length < 8 || password.length > 200)
    return NextResponse.json({ error: "A senha precisa ter de 8 a 200 caracteres." }, { status: 400 });
  try {
    const { file, fileName } = downloadBackup({ workspaceId: ctx.workspace.id, userId: ctx.user.id }, id);
    return new NextResponse(new Uint8Array(encryptBackup(Buffer.from(JSON.stringify(file)), password)), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName.replace(/\.json$/, ".protegido.json")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
}
