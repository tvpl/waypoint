import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceContext, UserError } from "@/server/services/workspaces";
import { listNotifications, markNotificationsSeen, type NotificationsResult } from "@/server/services/notifications";
import { localDate } from "@/domain/tasks";

export type NotificationsResponse = NotificationsResult;

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/notifications?today=YYYY-MM-DD → the notification center of the current person and
 * workspace (items newest first + unread count). `today` is the browser's local day.
 */
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = req.nextUrl.searchParams.get("today");
  const today = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : localDate();
  try {
    const res = listNotifications({ workspaceId: ctx.workspace.id, userId: ctx.user.id }, { userName: ctx.user.name, today });
    return NextResponse.json(res satisfies NotificationsResponse, { headers: noStore });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 403, headers: noStore });
    throw e;
  }
}

/** POST /api/notifications → "Marcar tudo como visto" ({ seenAt }). */
export async function POST() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const seenAt = markNotificationsSeen({ workspaceId: ctx.workspace.id, userId: ctx.user.id });
    return NextResponse.json({ seenAt }, { headers: noStore });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 403, headers: noStore });
    throw e;
  }
}
