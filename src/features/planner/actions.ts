"use server";
/**
 * Editor / publish / share / history server actions. Every action re-checks
 * access on the server (getPlanWithAccess + atLeast); the UI hiding a button
 * is never the only guard.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import type { Role, Visibility } from "@/server/db/schema";
import { VISIBILITIES } from "@/server/db/schema";
import { atLeast } from "@/server/services/permissions";
import {
  ensureShareLink,
  getDraft,
  getPlanWithAccess,
  getPublished,
  hasUnpublishedChanges,
  listPlanMembers,
  listVersions,
  publishPlan,
  restoreVersion,
  revokeShareLink,
  setPlanMember,
  unpublishPlan,
  updatePlanMeta,
} from "@/server/services/plans";
import { shareTokenFor } from "@/server/services/permissions";
import { findUserByEmail, UserError } from "@/server/services/workspaces";
import { planContextInfo } from "@/server/services/resources";
import type { PlanDocument } from "@/domain/plan";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function guard(planId: string, min: Role) {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Sua sessão expirou. Entre novamente.");
  const res = getPlanWithAccess(planId, user.id);
  if (!res || !atLeast(res.access, min)) throw new UserError("Você não tem permissão para esta ação.");
  return { user, ...res };
}

async function run<T extends object>(fn: () => Promise<T> | T): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Dados inválidos." };
    console.error(e);
    return { ok: false, error: "Algo deu errado. Tente novamente." };
  }
}

function revalidatePlan(id: string) {
  revalidatePath("/plans");
  revalidatePath(`/plans/${id}`);
}

// ------------------------------------------------------------------ meta

const metaSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().max(64)).max(30).optional(),
});

export async function updatePlanMetaAction(planId: string, patch: z.infer<typeof metaSchema>) {
  return run(async () => {
    await guard(planId, "editor");
    updatePlanMeta(planId, metaSchema.parse(patch));
    revalidatePlan(planId);
    return {};
  });
}

// ------------------------------------------------------------------ publish

export async function publishPlanAction(planId: string) {
  return run(async () => {
    const { user } = await guard(planId, "editor");
    const v = publishPlan(planId, user.id);
    revalidatePlan(planId);
    return { version: v.version, versionId: v.id, createdAt: v.createdAt.getTime() };
  });
}

export async function unpublishPlanAction(planId: string) {
  return run(async () => {
    await guard(planId, "owner");
    unpublishPlan(planId);
    revalidatePlan(planId);
    return {};
  });
}

export async function restoreVersionAction(planId: string, versionId: string) {
  return run(async () => {
    const { user } = await guard(planId, "editor");
    const r = restoreVersion(planId, versionId, user.id);
    if (!r.ok) throw new UserError("Não foi possível restaurar. Tente novamente.");
    const draft = getDraft(planId);
    const res = getPlanWithAccess(planId, user.id)!;
    revalidatePlan(planId);
    return {
      document: draft.document as PlanDocument,
      version: draft.version,
      title: res.plan.title,
      description: res.plan.description,
    };
  });
}

// ------------------------------------------------------------------ share state

export type ShareState = {
  plan: { id: string; title: string; visibility: Visibility; isTemplate: boolean };
  access: Role;
  owner: { name: string; email: string } | null;
  members: { userId: string; name: string; email: string; role: Role }[];
  versions: { id: string; version: number; title: string; createdAt: number; authorName: string | null }[];
  publishedVersionId: string | null;
  publishedVersion: number | null;
  unpublished: boolean;
  shareToken: string | null;
  meId: string;
};

export async function getShareStateAction(planId: string) {
  return run(async (): Promise<{ state: ShareState }> => {
    const { user, plan, access } = await guard(planId, "editor");
    const versions = listVersions(planId).map((v) => ({ ...v, createdAt: v.createdAt.getTime() }));
    const pub = getPublished(plan);
    return {
      state: {
        plan: { id: plan.id, title: plan.title, visibility: plan.visibility, isTemplate: plan.isTemplate },
        access: access!,
        owner: planContextInfo(plan).owner,
        members: listPlanMembers(planId).filter((m) => m.userId !== plan.createdBy),
        versions,
        publishedVersionId: plan.publishedVersionId,
        publishedVersion: pub?.version ?? null,
        unpublished: hasUnpublishedChanges(plan),
        shareToken: plan.visibility === "link" ? (shareTokenFor("plan", planId) ?? ensureShareLink("plan", planId, user.id)) : null,
        meId: user.id,
      },
    };
  });
}

export async function setVisibilityAction(planId: string, visibility: Visibility) {
  return run(async () => {
    const { user } = await guard(planId, "owner");
    if (!(VISIBILITIES as readonly string[]).includes(visibility)) throw new UserError("Visibilidade inválida.");
    updatePlanMeta(planId, { visibility });
    const token = visibility === "link" ? ensureShareLink("plan", planId, user.id) : null;
    revalidatePlan(planId);
    return { token };
  });
}

export async function regenerateShareLinkAction(planId: string) {
  return run(async () => {
    const { user } = await guard(planId, "owner");
    revokeShareLink("plan", planId);
    return { token: ensureShareLink("plan", planId, user.id) };
  });
}

const roleSchema = z.enum(["owner", "editor", "viewer"]);

export async function inviteMemberAction(planId: string, email: string, role: Role) {
  return run(async () => {
    const { plan } = await guard(planId, "owner");
    const r = roleSchema.parse(role);
    const target = findUserByEmail(z.string().email().max(320).parse(email.trim()));
    if (!target) throw new UserError("Nenhuma conta encontrada com este e-mail. Só é possível convidar quem já usa o Waypoint.");
    if (target.id === plan.createdBy) throw new UserError("Esta pessoa já é dona do plan.");
    setPlanMember(planId, target.id, r);
    revalidatePlan(planId);
    return { member: { userId: target.id, name: target.name, email: target.email, role: r } };
  });
}

export async function setMemberRoleAction(planId: string, userId: string, role: Role | null) {
  return run(async () => {
    const { plan } = await guard(planId, "owner");
    if (userId === plan.createdBy) throw new UserError("Não é possível alterar o dono do plan.");
    setPlanMember(planId, userId, role == null ? null : roleSchema.parse(role));
    revalidatePlan(planId);
    return {};
  });
}
