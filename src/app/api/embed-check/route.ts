import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceContext } from "@/server/services/workspaces";
import { checkEmbeddable } from "@/server/services/metadata";
import { normalizeUrl } from "@/server/services/links";
import { clientKey, rateLimit } from "@/server/lib/rate-limit";

/**
 * GET /api/embed-check?url= → { embeddable, reason? }.
 * Used by the link preview and by the Planner's view mode before rendering an iframe.
 * Never tries to bypass X-Frame-Options / CSP — it only reports them.
 * Anonymous visitors of public/shared plans may call it too, rate-limited per IP
 * (the check itself goes through the SSRF-safe fetcher and only returns a boolean).
 */
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  const limit = rateLimit(`embed:${ctx?.user.id ?? clientKey(req.headers)}`, ctx ? 120 : 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  let url: string;
  try {
    url = normalizeUrl((req.nextUrl.searchParams.get("url") ?? "").slice(0, 4096));
  } catch {
    return NextResponse.json({ embeddable: false, reason: "URL inválida." }, { status: 400 });
  }
  const res = await checkEmbeddable(url);
  return NextResponse.json(res, { headers: { "Cache-Control": "private, max-age=300" } });
}
