import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createSession, getCurrentUser } from "@/server/auth";
import { ensureDesktopUser, hasDesktopKey } from "@/server/desktop";

const safeNext = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/api/") ? v : "/");

/**
 * GET /api/desktop/session?next=/path
 * Desktop mode only: signs the desktop window in as the local person (no login screen) and
 * goes on to `next`. Requires the per-launch key the shell put on its window.
 */
export async function GET(req: Request) {
  if (!hasDesktopKey(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await getCurrentUser())) await createSession(await ensureDesktopUser());
  redirect(safeNext(new URL(req.url).searchParams.get("next")));
}
