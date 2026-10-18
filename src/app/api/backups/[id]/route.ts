import { NextResponse } from "next/server";
import { getWorkspaceContext, UserError } from "@/server/services/workspaces";
import { downloadBackup } from "@/server/services/backups";

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
