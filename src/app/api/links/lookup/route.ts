import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceContext } from "@/server/services/workspaces";
import { normalizeUrl } from "@/server/services/links";
import { findByUrl } from "@/features/links/server-data";

/** GET /api/links/lookup?url= → { duplicate: { id, title, archived } | null } within the active workspace. */
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let url: string;
  try {
    url = normalizeUrl((req.nextUrl.searchParams.get("url") ?? "").slice(0, 4096));
  } catch {
    return NextResponse.json({ duplicate: null });
  }
  const hit = findByUrl(ctx.workspace.id, url);
  return NextResponse.json({ duplicate: hit ? { id: hit.id, title: hit.title, archived: hit.archivedAt != null } : null });
}
