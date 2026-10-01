"use server";
import { revalidatePath } from "next/cache";
import { canEditWorkspace, requireWorkspace, UserError } from "@/server/services/workspaces";
import { createPlan } from "@/server/services/plans";

/** Creates an empty plan (or one from a template) in the active workspace and returns its id. */
export async function createPlanAction(input: { title?: string; templateId?: string }): Promise<string> {
  const ctx = await requireWorkspace();
  if (!canEditWorkspace(ctx.role)) throw new UserError("Você não tem permissão para criar plans neste workspace.");
  const id = createPlan({ workspaceId: ctx.workspace.id, userId: ctx.user.id, title: input.title?.trim() || "Plan sem título" });
  revalidatePath("/plans");
  return id;
}
