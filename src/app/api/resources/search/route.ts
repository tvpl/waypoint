import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceContext } from "@/server/services/workspaces";
import { searchResources, type ResourceSearchType } from "@/server/services/resources";

const TYPES = new Set<ResourceSearchType>(["favorite", "collection", "plan"]);

/**
 * Resource picker search for the planner (favorites, collections, plans of the
 * active workspace). `?q=` (empty → recent), `?types=favorite,plan`, `?exclude=<planId>`.
 */
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").slice(0, 100);
  const types = (sp.get("types") ?? "")
    .split(",")
    .filter((t): t is ResourceSearchType => TYPES.has(t as ResourceSearchType));
  const limit = Math.max(1, Math.min(25, Number(sp.get("limit")) || 6));
  const items = searchResources(ctx.user.id, ctx.workspace.id, q, {
    limit,
    types: types.length ? types : undefined,
    excludePlanId: sp.get("exclude") ?? undefined,
  });
  return NextResponse.json({ items });
}
