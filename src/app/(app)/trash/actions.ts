"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireWorkspace, UserError } from "@/server/services/workspaces";
import { deleteForever, emptyTrash, restoreManyFromTrash } from "@/server/services/trash";
import { TRASH_TYPES, type TrashRef } from "@/features/trash/types";

type Result<T = object> = { ok: true; data: T } | { ok: false; error: string };

const ref = z.object({ type: z.enum(TRASH_TYPES), id: z.string().min(1).max(64) });

async function run<T>(fn: (actor: { workspaceId: string; userId: string }) => T): Promise<Result<T>> {
  try {
    const ctx = await requireWorkspace();
    const data = fn({ workspaceId: ctx.workspace.id, userId: ctx.user.id });
    revalidatePath("/trash");
    revalidatePath("/links");
    revalidatePath("/plans");
    revalidatePath("/");
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Dados inválidos." };
    console.error("[trash action]", e);
    return { ok: false, error: "Algo deu errado. Tente novamente." };
  }
}

/** Restores items from the trash (also the "Desfazer" right after a delete). */
export async function restoreFromTrashAction(items: TrashRef[]) {
  return run((actor) => restoreManyFromTrash(actor, z.array(ref).min(1).max(1000).parse(items)));
}

export async function deleteForeverAction(item: TrashRef) {
  return run((actor) => {
    const { type, id } = ref.parse(item);
    deleteForever(actor, type, id);
    return {};
  });
}

export async function emptyTrashAction() {
  return run((actor) => emptyTrash(actor));
}
