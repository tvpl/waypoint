import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceContext, UserError } from "@/server/services/workspaces";
import { TASK_LINK_TYPES, tasksLinkedTo, type TaskLinkType } from "@/server/services/task-links";

/** GET /api/tasks/backlinks?type=plan|favorite|collection&id=… → tasks that reference it. */
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const type = req.nextUrl.searchParams.get("type") as TaskLinkType;
  const id = (req.nextUrl.searchParams.get("id") ?? "").slice(0, 64);
  if (!TASK_LINK_TYPES.includes(type) || !id) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    return NextResponse.json({ tasks: tasksLinkedTo({ workspaceId: ctx.workspace.id, userId: ctx.user.id }, type, id) });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
}
