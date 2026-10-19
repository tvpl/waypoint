"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireWorkspace, UserError, WORKSPACE_COOKIE } from "@/server/services/workspaces";
import {
  createBackup,
  deleteBackup,
  listBackups,
  listRecoverable,
  recoverItems,
  restoreAsNewWorkspace,
  restoreWorkspace,
  saveBackupSettings,
} from "@/server/services/backups";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
async function run<T>(fn: (actor: { workspaceId: string; userId: string }) => T, revalidate = false): Promise<Result<T>> {
  try {
    const ctx = await requireWorkspace();
    const data = fn({ workspaceId: ctx.workspace.id, userId: ctx.user.id });
    if (revalidate) revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos." };
    console.error("[backups]", e);
    return { ok: false, error: "Algo deu errado com o backup. Tente novamente." };
  }
}

export async function listBackupsAction() {
  return run((actor) => listBackups(actor));
}
export async function createBackupAction(note?: string) {
  return run((actor) => {
    createBackup(actor, note);
    return listBackups(actor);
  });
}
export async function deleteBackupAction(id: string) {
  return run((actor) => {
    deleteBackup(actor, id);
    return listBackups(actor);
  });
}
export async function saveBackupSettingsAction(input: unknown) {
  return run((actor) => {
    saveBackupSettings(actor, input);
    return listBackups(actor);
  });
}
export async function listRecoverableAction(id: string) {
  return run((actor) => listRecoverable(actor, id));
}
export async function recoverItemsAction(id: string, keys: string[]) {
  return run((actor) => recoverItems(actor, id, keys), true);
}
export async function restoreWorkspaceAction(id: string) {
  return run((actor) => {
    restoreWorkspace(actor, id);
    return listBackups(actor);
  }, true);
}
/** Creates the workspace and switches to it. */
export async function restoreAsNewWorkspaceAction(id: string) {
  const result = await run((actor) => restoreAsNewWorkspace(actor, id));
  if (result.ok) {
    (await cookies()).set(WORKSPACE_COOKIE, result.data.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/", "layout");
  }
  return result;
}
