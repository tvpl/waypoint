import { normalizeUrl } from "@/server/services/links";
import { findByUrl } from "@/features/links/server-data";
import { apiLink, appOrigin } from "../../_lib/data";
import { apiError, json, preflight, withApi } from "../../_lib/http";

export const OPTIONS = preflight;

/** GET /api/v1/links/lookup?url= → { link } already saved for that URL in the token's workspace, or { link: null }. */
export async function GET(req: Request) {
  return withApi(req, {}, (ctx) => {
    const raw = (new URL(req.url).searchParams.get("url") ?? "").slice(0, 4096);
    if (!raw.trim()) return apiError(req, 400, "invalid", "Informe a URL (?url=).");
    let url: string;
    try {
      url = normalizeUrl(raw);
    } catch {
      return json(req, { link: null });
    }
    const hit = findByUrl(ctx.workspaceId, ctx.user.id, url);
    return json(req, { link: hit ? apiLink(hit.id, ctx, appOrigin(req)) : null });
  });
}
