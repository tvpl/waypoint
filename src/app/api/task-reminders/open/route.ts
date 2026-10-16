import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { reminderDestination } from "@/server/services/task-reminders";
import { UserError } from "@/server/services/workspaces";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  try {
    const target = reminderDestination(
      user.id,
      new URL(req.url).searchParams.get("id") ?? "",
    );
    const query = new URL(req.url).searchParams.has("central")
      ? "reminders=1"
      : `open=${encodeURIComponent(target.taskId)}`;
    const response = NextResponse.redirect(new URL(`/tasks?${query}`, req.url));
    response.cookies.set("wp_ws", target.workspaceId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    return response;
  } catch (e) {
    if (e instanceof UserError)
      return Response.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
