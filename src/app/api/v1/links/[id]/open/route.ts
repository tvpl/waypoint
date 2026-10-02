import { getFavorite, recordOpen } from "@/server/services/links";
import { apiLink, appOrigin } from "../../../_lib/data";
import { apiError, json, preflight, withApi } from "../../../_lib/http";

export const OPTIONS = preflight;

/** POST /api/v1/links/:id/open → records that the user opened the link (feeds "Para você"). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApi(req, {}, (ctx) => {
    const f = getFavorite(id);
    // apiLink also hides links inside someone else's private collection.
    if (!f || !apiLink(id, ctx, appOrigin(req))) return apiError(req, 404, "not_found", "Link não encontrado.");
    recordOpen(id, ctx.user.id);
    return json(req, { ok: true });
  });
}
