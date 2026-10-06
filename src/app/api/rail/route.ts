import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/server/services/workspaces";
import { recentPlans } from "@/server/services/home";
import { libraryCounts, visibleTree } from "@/features/links/server-data";
import { listTags } from "@/server/services/tags";
import type { Thumb } from "@/server/services/plans";

export type RailResponse = {
  plans: { id: string; title: string; published: boolean; thumbnail: Thumb }[];
  inbox: number;
  links: number;
  tags: { name: string; color: string | null; count: number }[];
};

/** GET /api/rail → what the navigation rail's hover cards show (recent plans, inbox, top tags). */
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const plans = recentPlans(ctx.user.id, ctx.workspace.id, 5).map((p) => ({ id: p.id, title: p.title, published: p.published, thumbnail: p.thumbnail }));
  const { hidden } = visibleTree(ctx.workspace.id, ctx.user.id);
  const counts = libraryCounts(ctx.workspace.id, ctx.user.id, hidden, 0);
  const tags = listTags(ctx.workspace.id, ctx.user.id)
    .map((t) => ({ name: t.name, color: t.color, count: Number(t.links) + Number(t.plans) }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 10);
  return NextResponse.json({ plans, inbox: counts.inbox, links: counts.all, tags } satisfies RailResponse, { headers: { "Cache-Control": "no-store" } });
}
