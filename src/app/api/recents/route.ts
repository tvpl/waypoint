import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/server/services/workspaces";
import { recentPlans } from "@/server/services/home";
import { quickAccess, recentFavorites } from "@/server/services/links";

export type RecentsResponse = {
  plans: { id: string; title: string; published: boolean }[];
  links: { id: string; title: string; url: string; domain: string; favicon: string | null; openBehavior: string; pinned: boolean }[];
};

/** GET /api/recents → what the user opened lately and their quick-access links (⌘K empty state). */
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const plans = recentPlans(ctx.user.id, ctx.workspace.id, 4).map((p) => ({ id: p.id, title: p.title, published: p.published }));
  const seen = new Set<string>();
  const links: RecentsResponse["links"] = [];
  for (const l of [...quickAccess(ctx.user.id, ctx.workspace.id, 4), ...recentFavorites(ctx.user.id, ctx.workspace.id, 6)]) {
    if (seen.has(l.id) || links.length >= 6) continue;
    seen.add(l.id);
    links.push({
      id: l.id,
      title: l.title,
      url: l.url,
      domain: l.domain,
      favicon: l.icon || l.favicon,
      openBehavior: l.openBehavior,
      pinned: "pinned" in l ? !!l.pinned : false,
    });
  }
  return NextResponse.json({ plans, links } satisfies RecentsResponse, { headers: { "Cache-Control": "no-store" } });
}
