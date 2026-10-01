import { listTags } from "@/server/services/tags";
import { json, preflight, withApi } from "../_lib/http";

export const OPTIONS = preflight;

/** GET /api/v1/tags → tag names of the workspace, most used first. */
export async function GET(req: Request) {
  return withApi(req, {}, (ctx) => {
    const tags = listTags(ctx.workspaceId)
      .map((t) => ({ name: t.name, count: t.links + t.plans }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return json(req, { tags: tags.map((t) => t.name) });
  });
}
