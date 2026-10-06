import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { atLeast } from "@/server/services/permissions";
import { getDraft, getPlanWithAccess, getPublished, getVersion } from "@/server/services/plans";
import type { PlanDocument } from "@/domain/plan";

export type OverlayResponse = { title: string; document: PlanDocument; version: string };

/**
 * GET /api/plans/:id/overlay[?version=<id>] → what another plan shows when overlaid on a layer:
 * the draft for its editors, the published version for its readers. `version` (editors only)
 * gives an earlier version of the plan, for the "papel vegetal".
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const res = getPlanWithAccess(id, user.id);
  if (!res) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { plan, access } = res;
  const editor = atLeast(access, "editor");
  const headers = { "Cache-Control": "no-store" };
  const versionId = req.nextUrl.searchParams.get("version");
  if (versionId) {
    const v = editor ? getVersion(versionId) : null;
    if (!v || v.planId !== id) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ title: v.snapshot.title, document: v.snapshot.document, version: `v${v.version}` } satisfies OverlayResponse, { headers });
  }
  if (editor) {
    const d = getDraft(id);
    return NextResponse.json({ title: plan.title, document: d.document, version: `d${d.version}` } satisfies OverlayResponse, { headers });
  }
  const pub = getPublished(plan);
  if (!pub) return NextResponse.json({ error: "Este plan ainda não foi publicado." }, { status: 404 });
  return NextResponse.json({ title: pub.snapshot.title, document: pub.snapshot.document, version: `v${pub.version}` } satisfies OverlayResponse, { headers });
}
