import { z } from "zod";
import { hasDesktopKey } from "@/server/desktop";
import { getCurrentUser } from "@/server/auth";
import {
  claimTaskReminders,
  nativeReminderResult,
  activeNativeReminderTokens,
} from "@/server/services/task-reminders";
import { UserError } from "@/server/services/workspaces";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("poll") }),
  z.object({
    action: z.enum(["shown", "failed", "snooze", "dismiss"]),
    id: z.string().min(1).max(64),
    token: z.string().uuid(),
  }),
]);
export async function POST(req: Request) {
  if (!hasDesktopKey(req))
    return Response.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const value = parsed.data;
  try {
    return Response.json(
      value.action === "poll"
        ? {
            reminders: claimTaskReminders(user.id),
            active: activeNativeReminderTokens(user.id),
          }
        : {
            ok: nativeReminderResult(
              user.id,
              value.id,
              value.token,
              value.action,
            ),
          },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof UserError)
      return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
