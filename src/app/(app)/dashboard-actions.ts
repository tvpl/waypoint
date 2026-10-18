"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireWorkspace, UserError } from "@/server/services/workspaces";
import { deleteShortcut, listShortcuts, reorderShortcuts, saveHomeLayout, saveShortcut } from "@/server/services/dashboard";
import { toggleImportant } from "@/server/services/marks";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
async function run<T>(fn: (actor: { workspaceId: string; userId: string }) => T, path = "/"): Promise<Result<T>> {
  try {
    const ctx = await requireWorkspace();
    const data = fn({ workspaceId: ctx.workspace.id, userId: ctx.user.id });
    revalidatePath(path);
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos." };
    console.error("[dashboard]", e);
    return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  }
}

export async function saveShortcutAction(input: unknown, id?: string) {
  return run((actor) => {
    saveShortcut(actor, input, id);
    return listShortcuts(actor);
  });
}
export async function deleteShortcutAction(id: string) {
  return run((actor) => {
    deleteShortcut(actor, id);
    return listShortcuts(actor);
  });
}
export async function reorderShortcutsAction(ids: string[]) {
  return run((actor) => {
    reorderShortcuts(actor, ids);
    return listShortcuts(actor);
  });
}
export async function saveHomeLayoutAction(layout: unknown) {
  return run((actor) => saveHomeLayout(actor, layout));
}
/** Personal "Importante" star on a task, plan or collection (links use their own star). */
export async function toggleImportantAction(type: "task" | "plan" | "collection", id: string) {
  return run((actor) => toggleImportant(actor, z.enum(["task", "plan", "collection"]).parse(type), id), "/");
}
