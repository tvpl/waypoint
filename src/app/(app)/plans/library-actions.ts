"use server";
import { z } from "zod";
import { canEditWorkspace, requireWorkspace, UserError } from "@/server/services/workspaces";
import { addLibraryItems, deleteLibraryItems, getLibraryItems, listLibrary, renameLibraryItem, updateLibraryItem } from "@/server/services/library";
import type { LibraryItem } from "@/domain/library";

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

async function requireEditor() {
  const ctx = await requireWorkspace();
  if (!canEditWorkspace(ctx.role)) throw new UserError("Você não tem permissão para mudar a biblioteca deste workspace.");
  return ctx;
}

/** "Minha biblioteca" of the active workspace. */
export async function listLibraryAction(): Promise<Result<{ items: LibraryItem[] }>> {
  return run(async () => {
    const ctx = await requireWorkspace();
    return { items: listLibrary(ctx.workspace.id) };
  });
}

const addInput = z.array(z.object({ name: z.string().max(200).optional(), content: z.unknown() })).min(1).max(500);

export async function addToLibraryAction(items: unknown): Promise<Result<{ ids: string[] }>> {
  return run(async () => {
    const ctx = await requireEditor();
    const parsed = addInput.safeParse(items);
    if (!parsed.success) throw new UserError("Itens inválidos.");
    return { ids: addLibraryItems(ctx.workspace.id, ctx.user.id, parsed.data) };
  });
}

export async function renameLibraryItemAction(id: string, name: string): Promise<Result> {
  return run(async () => {
    const ctx = await requireEditor();
    renameLibraryItem(ctx.workspace.id, String(id), String(name));
    return {};
  });
}

export async function deleteLibraryItemsAction(ids: string[]): Promise<Result> {
  return run(async () => {
    const ctx = await requireEditor();
    deleteLibraryItems(ctx.workspace.id, z.array(z.string().max(64)).max(1000).parse(ids));
    return {};
  });
}

/** The items a plan's linked copies come from (to show and apply their updates). */
export async function getLibraryItemsAction(ids: string[]): Promise<Result<{ items: LibraryItem[] }>> {
  return run(async () => {
    const ctx = await requireWorkspace();
    return { items: getLibraryItems(ctx.workspace.id, z.array(z.string().max(64)).max(200).parse(ids)) };
  });
}

/** A linked copy sends its drawing back to the item (every other copy can then update). */
export async function updateLibraryItemAction(id: string, content: unknown): Promise<Result<{ rev: string }>> {
  return run(async () => {
    const ctx = await requireEditor();
    return { rev: updateLibraryItem(ctx.workspace.id, String(id), content) };
  });
}
