import { canEditWorkspace } from "@/server/services/workspaces";
import { json, preflight, withApi } from "../_lib/http";

export const OPTIONS = preflight;

/** GET /api/v1/me → who the token acts as, and where. */
export async function GET(req: Request) {
  return withApi(req, {}, (ctx) =>
    json(req, {
      user: ctx.user,
      workspace: { id: ctx.workspaceId, name: ctx.workspaceName },
      role: ctx.role,
      canWrite: canEditWorkspace(ctx.role),
    }),
  );
}
