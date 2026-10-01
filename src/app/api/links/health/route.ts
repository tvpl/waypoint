import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canEditWorkspace, getWorkspaceContext } from "@/server/services/workspaces";
import { getCollection } from "@/server/services/links";
import { checkFavorites, MAX_PER_CALL } from "@/server/services/link-health";
import { rateLimit } from "@/server/lib/rate-limit";
import { visibleTree } from "@/features/links/server-data";

const body = z.object({
  ids: z.array(z.string().min(1).max(64)).max(MAX_PER_CALL).optional(),
  collectionId: z.string().min(1).max(64).nullable().optional(),
  force: z.boolean().optional(),
  /** epoch ms of the first call of a forced run (see HealthSelector.startedAt) */
  startedAt: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(MAX_PER_CALL).optional(),
});

/**
 * POST /api/links/health { ids?, collectionId?, force?, startedAt?, limit? }
 *   → { checked, ok, broken, redirect, unreachable, remaining, results[] }
 * Checks up to `limit` (≤ 200) links per call; clients call again while `remaining > 0`.
 * Editors only; rate-limited per user. Every request goes through safeFetch.
 */
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditWorkspace(ctx.role)) return NextResponse.json({ error: "Apenas editores podem verificar links." }, { status: 403 });
  const limit = rateLimit(`health:${ctx.user.id}`, 40, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Muitas verificações seguidas. Tente de novo em instantes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const { ids, collectionId, force, startedAt } = parsed.data;

  const { hidden } = visibleTree(ctx.workspace.id, ctx.user.id);
  if (collectionId) {
    const c = getCollection(collectionId);
    if (!c || c.workspaceId !== ctx.workspace.id || hidden.has(c.id)) return NextResponse.json({ error: "Coleção não encontrada." }, { status: 404 });
  }

  const summary = await checkFavorites(
    ctx.workspace.id,
    { ids, collectionId, force, startedAt, hiddenCollections: hidden, limit: parsed.data.limit ?? (ids ? ids.length || 1 : 25) },
    { deadlineMs: 25_000 },
  );
  if (summary.checked > 0) revalidatePath("/links");
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
