import { NextResponse } from "next/server";
import { z } from "zod";
import { resourceRefSchema } from "@/domain/plan";
import { getCurrentUser } from "@/server/auth";
import { getPlanWithAccess } from "@/server/services/plans";
import { resolveRefs } from "@/server/services/resources";

const body = z.object({ planId: z.string().min(1).max(64), refs: z.array(resourceRefSchema).max(500) });

/** Resolves resource refs in the context of a plan the caller can read. POST { planId, refs } → { resources } keyed by ref key. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const res = getPlanWithAccess(parsed.data.planId, user.id);
  if (!res) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ resources: resolveRefs(parsed.data.refs, user.id, res.plan.workspaceId) });
}
