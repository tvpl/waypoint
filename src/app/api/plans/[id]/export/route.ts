import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { atLeast } from "@/server/services/permissions";
import { getDraft, getPlanWithAccess, getPublished } from "@/server/services/plans";
import { tagsForPlans } from "@/server/services/tags";
import { slugify } from "@/lib/utils";

/**
 * JSON export. Editors get the draft (or `?source=published`); viewers only
 * ever get the published snapshot.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const res = getPlanWithAccess(id, user?.id ?? null, req.nextUrl.searchParams.get("token"));
  if (!res) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { plan, access } = res;
  const wantPublished = req.nextUrl.searchParams.get("source") === "published" || !atLeast(access, "editor");
  let title = plan.title;
  let description = plan.description;
  let document;
  if (wantPublished) {
    const pub = getPublished(plan);
    if (!pub) return NextResponse.json({ error: "Este plan ainda não foi publicado." }, { status: 404 });
    title = pub.snapshot.title;
    description = pub.snapshot.description;
    document = pub.snapshot.document;
  } else {
    document = getDraft(id).document;
  }
  const payload = {
    format: "waypoint-plan",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    plan: { title, description, tags: tagsForPlans([id]).get(id) ?? [] },
    document,
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(title)}.waypoint.json"`,
      "Cache-Control": "no-store",
    },
  });
}
