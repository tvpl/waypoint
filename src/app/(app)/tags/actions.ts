"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canEditWorkspace, requireWorkspace } from "@/server/services/workspaces";
import { deleteTag, renameTag } from "@/server/services/tags";
import { normalizeTag } from "@/lib/utils";

type Result = { ok: true } | { ok: false; error: string };

export async function renameTagAction(tagId: string, name: string): Promise<Result> {
  const ctx = await requireWorkspace();
  if (!canEditWorkspace(ctx.role)) return { ok: false, error: "Sem permissão." };
  const clean = normalizeTag(z.string().max(64).parse(name));
  if (!clean) return { ok: false, error: "Nome inválido." };
  try {
    renameTag(ctx.workspace.id, tagId, clean);
  } catch {
    return { ok: false, error: "Já existe uma tag com esse nome." };
  }
  revalidatePath("/tags");
  return { ok: true };
}

export async function deleteTagAction(tagId: string): Promise<Result> {
  const ctx = await requireWorkspace();
  if (!canEditWorkspace(ctx.role)) return { ok: false, error: "Sem permissão." };
  deleteTag(ctx.workspace.id, tagId);
  revalidatePath("/tags");
  return { ok: true };
}
