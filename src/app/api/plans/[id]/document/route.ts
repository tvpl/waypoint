import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeDocument } from "@/domain/plan";
import { getCurrentUser } from "@/server/auth";
import { atLeast } from "@/server/services/permissions";
import { getDraft, getPlanWithAccess, saveDraft } from "@/server/services/plans";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 4 * 1024 * 1024;

async function editorAccess(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  const res = getPlanWithAccess(id, user.id);
  if (!res) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) } as const;
  if (!atLeast(res.access, "editor")) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) } as const;
  return { user, ...res } as const;
}

/** Current draft + its version (editors only). */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const a = await editorAccess(id);
  if ("error" in a) return a.error;
  const d = getDraft(id);
  return NextResponse.json({ document: d.document, version: d.version, updatedAt: d.updatedAt.getTime() });
}

const putBody = z.object({ expectedVersion: z.number().int().min(0), document: z.unknown() });

/**
 * Saves the draft with optimistic concurrency.
 * 200 { version, updatedAt } · 409 { conflict, version, document } · 400 invalid · 403 not an editor.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const a = await editorAccess(id);
  if ("error" in a) return a.error;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return NextResponse.json({ error: "Documento muito grande." }, { status: 413 });
  const parsed = putBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  let doc;
  try {
    doc = normalizeDocument(parsed.data.document);
  } catch {
    return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
  }
  const result = saveDraft(id, a.user.id, parsed.data.expectedVersion, doc);
  if (!result.ok) return NextResponse.json({ conflict: true, version: result.version, document: result.document }, { status: 409 });
  return NextResponse.json({ version: result.version, updatedAt: result.updatedAt });
}
