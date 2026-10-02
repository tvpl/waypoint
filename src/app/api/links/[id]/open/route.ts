import { NextResponse } from "next/server";
import { getWorkspaceContext, workspaceRole } from "@/server/services/workspaces";
import { getFavorite, recordOpen } from "@/server/services/links";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const fav = getFavorite(id);
  if (!fav || !workspaceRole(ctx.user.id, fav.workspaceId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  recordOpen(id, ctx.user.id);
  return NextResponse.json({ ok: true });
}
