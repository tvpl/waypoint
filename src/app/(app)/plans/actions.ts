"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canEditWorkspace, requireWorkspace, UserError } from "@/server/services/workspaces";
import { archivePlan, createPlan, deletePlan, duplicatePlan, getPlanWithAccess, getVersion } from "@/server/services/plans";
import { atLeast } from "@/server/services/permissions";
import { normalizeDocument } from "@/domain/plan";
import type { Role } from "@/server/db/schema";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Algo deu errado. Tente novamente." };
  }
}

async function guard(planId: string, min: Role) {
  const ctx = await requireWorkspace();
  const res = getPlanWithAccess(planId, ctx.user.id);
  if (!res || !atLeast(res.access, min)) throw new UserError("Você não tem permissão para esta ação.");
  return { ctx, ...res };
}

async function requireCreator() {
  const ctx = await requireWorkspace();
  if (!canEditWorkspace(ctx.role)) throw new UserError("Você não tem permissão para criar plans neste workspace.");
  return ctx;
}

/** Creates an empty plan (or one from a template) in the active workspace and returns its id. */
export async function createPlanAction(input: { title?: string; templateId?: string }): Promise<string> {
  const ctx = await requireCreator();
  let id: string;
  if (input.templateId) {
    const tpl = getPlanWithAccess(input.templateId, ctx.user.id);
    if (!tpl || !tpl.plan.isTemplate) throw new UserError("Template não encontrado.");
    id = duplicatePlan(tpl.plan.id, ctx.user.id, ctx.workspace.id, { title: input.title?.trim() || tpl.plan.title });
  } else {
    id = createPlan({ workspaceId: ctx.workspace.id, userId: ctx.user.id, title: input.title?.trim() || "Plan sem título" });
  }
  revalidatePath("/plans");
  return id;
}

/** Duplicates a plan (optionally a specific published version, or as a template) into the active workspace. */
export async function duplicatePlanAction(planId: string, opts: { versionId?: string; asTemplate?: boolean } = {}) {
  return run(async () => {
    const { plan, access } = await guard(planId, "viewer");
    const ctx = await requireCreator();
    // viewers only ever see the published snapshot, so that's all they can copy
    let versionId = opts.versionId;
    if (!atLeast(access, "editor") && !plan.isTemplate) {
      if (versionId && versionId !== plan.publishedVersionId) throw new UserError("Você não tem permissão para esta ação.");
      if (!plan.publishedVersionId) throw new UserError("Este plan ainda não foi publicado.");
      versionId = plan.publishedVersionId;
    }
    if (versionId && getVersion(versionId)?.planId !== planId) throw new UserError("Versão não encontrada.");
    const id = duplicatePlan(planId, ctx.user.id, ctx.workspace.id, {
      versionId,
      asTemplate: opts.asTemplate,
    });
    revalidatePath("/plans");
    return { id };
  });
}

export async function archivePlanAction(planId: string, archived: boolean) {
  return run(async () => {
    await guard(planId, "owner");
    archivePlan(planId, archived);
    revalidatePath("/plans");
    return {};
  });
}

export async function deletePlanAction(planId: string) {
  return run(async () => {
    await guard(planId, "owner");
    deletePlan(planId);
    revalidatePath("/plans");
    return {};
  });
}

const importSchema = z.union([
  z.object({
    format: z.literal("waypoint-plan").optional(),
    plan: z
      .object({
        title: z.string().max(200).optional(),
        description: z.string().max(5000).nullable().optional(),
        tags: z.array(z.string().max(64)).max(30).optional(),
      })
      .optional(),
    document: z.unknown(),
  }),
  z.object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()) }).passthrough(),
]);

/** Creates a plan from an exported JSON file (Waypoint export or a bare PlanDocument). */
export async function importPlanAction(json: string, fileName?: string) {
  return run(async () => {
    const ctx = await requireCreator();
    if (json.length > 4 * 1024 * 1024) throw new UserError("Arquivo muito grande (máx. 4 MB).");
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new UserError("O arquivo não é um JSON válido.");
    }
    const parsed = importSchema.safeParse(raw);
    if (!parsed.success) throw new UserError("Formato não reconhecido. Use um arquivo exportado pelo Waypoint.");
    const data = parsed.data;
    const docInput = "document" in data ? data.document : data;
    let document;
    try {
      document = normalizeDocument({ schemaVersion: 1, viewport: { x: 0, y: 0, zoom: 1 }, ...(docInput as object) });
    } catch {
      throw new UserError("O documento do plan é inválido ou de uma versão incompatível.");
    }
    const meta: { title?: string; description?: string | null; tags?: string[] } = "plan" in data && data.plan ? data.plan : {};
    const fallbackTitle = fileName?.replace(/\.waypoint\.json$|\.json$/i, "").trim();
    const id = createPlan({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      title: (meta.title || fallbackTitle || "Plan importado").slice(0, 200),
      description: meta.description ?? null,
      tags: meta.tags,
      document,
    });
    revalidatePath("/plans");
    return { id };
  });
}
