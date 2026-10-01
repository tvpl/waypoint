import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceContext } from "@/server/services/workspaces";
import { checkEmbeddable } from "@/server/services/metadata";
import { normalizeUrl } from "@/server/services/links";

/**
 * GET /api/embed-check?url= → { embeddable, reason? }.
 * Used by the link preview and by the Planner's view mode before rendering an iframe.
 * Never tries to bypass X-Frame-Options / CSP — it only reports them.
 */
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let url: string;
  try {
    url = normalizeUrl((req.nextUrl.searchParams.get("url") ?? "").slice(0, 4096));
  } catch {
    return NextResponse.json({ embeddable: false, reason: "URL inválida." }, { status: 400 });
  }
  const res = await checkEmbeddable(url);
  return NextResponse.json(res, { headers: { "Cache-Control": "private, max-age=300" } });
}
