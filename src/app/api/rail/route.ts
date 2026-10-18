import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/server/services/workspaces";
import { recentPlans } from "@/server/services/home";
import { libraryCounts, visibleTree } from "@/features/links/server-data";
import { listTags } from "@/server/services/tags";
import type { Thumb } from "@/server/services/plans";
import { getDb, schema } from "@/server/db";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

export type RailResponse = {
  plans: { id: string; title: string; published: boolean; thumbnail: Thumb }[];
  inbox: number;
  links: number;
  tags: { name: string; color: string | null; count: number }[];
  /** Task projects with their open (not done, not archived) task counts. */
  projects: { id: string; name: string; color: string; open: number }[];
};

/** Task projects of the workspace (name order) with their open task counts. */
function taskProjects(workspaceId: string): RailResponse["projects"] {
  const p = schema.taskProjects;
  const t = schema.tasks;
  return getDb()
    .select({ id: p.id, name: p.name, color: p.color, open: sql<number>`count(${t.id})` })
    .from(p)
    .leftJoin(t, and(eq(t.projectId, p.id), isNull(t.archivedAt), ne(t.status, "done")))
    .where(eq(p.workspaceId, workspaceId))
    .groupBy(p.id)
    .orderBy(p.name)
    .all()
    .map((r) => ({ ...r, open: Number(r.open) }));
}

/** GET /api/rail → what the navigation rail's hover cards show (recent plans, inbox, top tags, task projects). */
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
  const projects = taskProjects(ctx.workspace.id);
  return NextResponse.json({ plans, inbox: counts.inbox, links: counts.all, tags, projects } satisfies RailResponse, { headers: { "Cache-Control": "no-store" } });
}
