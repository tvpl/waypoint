import { flatCollections } from "../_lib/data";
import { json, preflight, withApi } from "../_lib/http";

export const OPTIONS = preflight;

/** GET /api/v1/collections → flat list in tree order, each with a readable `path` ("Development / Frontend"). */
export async function GET(req: Request) {
  return withApi(req, {}, (ctx) => json(req, { collections: flatCollections(ctx.workspaceId, ctx.user.id) }));
}
