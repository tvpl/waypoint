import { quickAccess, recentFavorites } from "@/server/services/links";
import { recentPlans } from "@/server/services/home";
import { libraryCounts, visibleTree } from "@/features/links/server-data";
import { appOrigin } from "../_lib/data";
import { json, preflight, withApi } from "../_lib/http";

export const OPTIONS = preflight;

const shape = (l: { id: string; title: string; url: string; domain: string; favicon: string | null; icon: string | null }, pinned = false) => ({
  id: l.id,
  title: l.title,
  url: l.url,
  domain: l.domain,
  favicon: l.icon || l.favicon,
  pinned,
});

/**
 * GET /api/v1/home → what the extension's new tab shows: quick-access links (pinned
 * first, then frecent), recently opened links, recent plans and the inbox count.
 */
export async function GET(req: Request) {
  return withApi(req, {}, (ctx) => {
    const origin = appOrigin(req);
    const { hidden } = visibleTree(ctx.workspaceId, ctx.user.id);
    const counts = libraryCounts(ctx.workspaceId, ctx.user.id, hidden, 0);
    return json(req, {
      workspace: { id: ctx.workspaceId, name: ctx.workspaceName },
      user: { name: ctx.user.name },
      quick: quickAccess(ctx.user.id, ctx.workspaceId, 12, { padWithRecent: true }).map((l) => shape(l, l.pinned)),
      recent: recentFavorites(ctx.user.id, ctx.workspaceId, 6).map((l) => shape(l)),
      plans: recentPlans(ctx.user.id, ctx.workspaceId, 4).map((p) => ({ id: p.id, title: p.title, url: `${origin}/plans/${p.id}${p.published ? "" : "/edit"}` })),
      inbox: { count: counts.inbox, url: `${origin}/links?scope=inbox` },
      broken: { count: counts.broken, url: `${origin}/links?scope=broken` },
      appUrl: origin,
    });
  });
}
