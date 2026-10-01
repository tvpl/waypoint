import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceContext } from "@/server/services/workspaces";
import { fetchLinkMetadata } from "@/server/services/metadata";
import { normalizeUrl } from "@/server/services/links";

/** GET /api/metadata?url= → title, description, image, favicon, siteName, embeddable (or error). */
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = (req.nextUrl.searchParams.get("url") ?? "").slice(0, 4096);
  let url: string;
  try {
    url = normalizeUrl(raw);
  } catch {
    return NextResponse.json({ url: raw, embeddable: null, error: "URL inválida." }, { status: 400 });
  }
  const meta = await fetchLinkMetadata(url);
  return NextResponse.json(meta, { headers: { "Cache-Control": "private, max-age=300" } });
}
