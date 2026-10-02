import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/server/services/workspaces";
import { loadLinkDetail } from "@/features/links/server-data";

/** GET /api/links/:id → LinkDetail (link, collection path, "Usado em" backlinks, canEdit). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const detail = loadLinkDetail(id, ctx);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}
