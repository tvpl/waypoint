import { NextResponse } from "next/server";
import { canEditWorkspace, getWorkspaceContext, UserError } from "@/server/services/workspaces";
import { saveAsset } from "@/server/services/assets";

/** Upload an image (multipart field "file"). Returns { id, url }. */
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditWorkspace(ctx.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie um arquivo no campo 'file'." }, { status: 400 });
  try {
    return NextResponse.json(await saveAsset(ctx.workspace.id, ctx.user.id, file));
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
