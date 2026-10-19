import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createSession, getCurrentUser } from "@/server/auth";
import { databaseStatus } from "@/server/db";
import { ensureDesktopUser, hasDesktopKey } from "@/server/desktop";
import { desktopSecurity } from "@/server/desktop-security";

const safeNext = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") && !/^\/(api|login)\b/.test(v) ? v : "/");

/**
 * GET /api/desktop/session?next=/path
 * Desktop mode only: signs the desktop window in as the local person and goes on to `next`, or
 * to the lock screen when the app lock is on. Requires the per-launch key the shell put on its window.
 */
export async function GET(req: Request) {
  if (!hasDesktopKey(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  // A new version waits for its database update (backup first): the dialog, before any session.
  if (databaseStatus().state === "pending") redirect(`/update?next=${encodeURIComponent(next)}`);
  if (!(await getCurrentUser())) {
    // App lock on: the person unlocks with their password on the lock screen.
    if (desktopSecurity().lock) redirect(`/login?next=${encodeURIComponent(next)}`);
    await createSession(await ensureDesktopUser());
  }
  redirect(next);
}
