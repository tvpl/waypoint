"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { OPEN_BEHAVIORS, SUMMARY_BEHAVIORS } from "@/server/db/schema";
import { canEditWorkspace, requireWorkspace, UserError, type WorkspaceContext } from "@/server/services/workspaces";
import {
  archiveCollection,
  archiveFavorite,
  createCollection,
  createFavorite,
  deleteCollection,
  deleteFavorite,
  getCollection,
  getFavorite,
  moveCollection,
  moveFavorite,
  toggleMark,
  updateCollection,
  updateFavorite,
} from "@/server/services/links";
import { tagsForFavorites } from "@/server/services/tags";
import { ensureShareLink, revokeShareLink } from "@/server/services/plans";
import { favoritesInWorkspace } from "@/features/links/server-data";
import type { ActionResult } from "@/features/links/types";

// ------------------------------------------------------------------ helpers

function fail(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  if (e instanceof UserError) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos." };
  if (e instanceof TypeError && /URL/i.test(e.message)) return { ok: false, error: "URL inválida." };
  console.error("[links action]", e);
  return { ok: false, error: "Algo deu errado. Tente novamente." };
}

async function editor(): Promise<WorkspaceContext> {
  const ctx = await requireWorkspace();
  if (!canEditWorkspace(ctx.role)) throw new UserError("Você não tem permissão para editar este workspace.");
  return ctx;
}

function done() {
  revalidatePath("/links");
  revalidatePath("/");
}

/** Collection must belong to the workspace and be visible to the user. */
function assertCollection(ctx: WorkspaceContext, id: string | null | undefined) {
  if (!id) return null;
  const c = getCollection(id);
  if (!c || c.workspaceId !== ctx.workspace.id || (c.visibility === "private" && c.createdBy !== ctx.user.id)) {
    throw new UserError("Coleção não encontrada.");
  }
  return c;
}

function assertFavorite(ctx: WorkspaceContext, id: string) {
  const f = getFavorite(id);
  if (!f || f.workspaceId !== ctx.workspace.id) throw new UserError("Link não encontrado.");
  return f;
}

const id = z.string().min(1).max(64);
const imageUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || /^https?:\/\//i.test(v) || /^\/api\/assets\/[a-z0-9]+$/i.test(v), "Imagem inválida: use um endereço http(s) ou envie um arquivo.")
  .transform((v) => v || null);

const linkInput = z.object({
  url: z.string().trim().min(1, "Informe a URL.").max(4096, "URL muito longa."),
  title: z.string().max(500).optional(),
  collectionId: id.nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  keywords: z.string().max(1000).nullable().optional(),
  favicon: imageUrl.nullable().optional(),
  coverImage: imageUrl.nullable().optional(),
  icon: imageUrl.nullable().optional(),
  openBehavior: z.enum(OPEN_BEHAVIORS).optional(),
  summaryBehavior: z.enum(SUMMARY_BEHAVIORS).optional(),
  tags: z.array(z.string().max(48)).max(40).optional(),
});
export type LinkInput = z.input<typeof linkInput>;

// ------------------------------------------------------------------ links

export async function createLinkAction(input: LinkInput): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await editor();
    const data = linkInput.parse(input);
    assertCollection(ctx, data.collectionId);
    const newId = createFavorite(ctx.workspace.id, ctx.user.id, data);
    done();
    return { ok: true, data: { id: newId } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateLinkAction(linkId: string, input: Partial<LinkInput>): Promise<ActionResult> {
  try {
    const ctx = await editor();
    assertFavorite(ctx, id.parse(linkId));
    const data = linkInput.partial().parse(input);
    if (data.collectionId !== undefined) assertCollection(ctx, data.collectionId);
    updateFavorite(linkId, data);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Starring is personal, so viewers may star too. */
export async function toggleStarAction(linkId: string): Promise<ActionResult<{ starred: boolean }>> {
  try {
    const ctx = await requireWorkspace();
    assertFavorite(ctx, id.parse(linkId));
    const starred = toggleMark(ctx.user.id, "favorite", linkId, "star");
    done();
    return { ok: true, data: { starred } };
  } catch (e) {
    return fail(e);
  }
}

const moveInput = z.object({ ids: z.array(id).min(1).max(1000), collectionId: id.nullable(), index: z.number().int().min(0).optional() });

/** Moves links to a collection (null = "Sem coleção"); with one id and an index it reorders. */
export async function moveLinksAction(input: z.input<typeof moveInput>): Promise<ActionResult> {
  try {
    const ctx = await editor();
    const { ids, collectionId, index } = moveInput.parse(input);
    assertCollection(ctx, collectionId);
    const allowed = favoritesInWorkspace(ctx.workspace.id, ids);
    allowed.forEach((fid, i) => moveFavorite(fid, collectionId, index == null ? undefined : index + i));
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const bulkInput = z.discriminatedUnion("op", [
  z.object({ op: z.literal("archive"), ids: z.array(id).min(1).max(1000), archived: z.boolean() }),
  z.object({ op: z.literal("delete"), ids: z.array(id).min(1).max(1000) }),
  z.object({ op: z.literal("addTag"), ids: z.array(id).min(1).max(1000), tag: z.string().trim().min(1).max(48) }),
]);

export async function bulkLinksAction(input: z.input<typeof bulkInput>): Promise<ActionResult<{ count: number }>> {
  try {
    const ctx = await editor();
    const data = bulkInput.parse(input);
    const ids = favoritesInWorkspace(ctx.workspace.id, data.ids);
    if (data.op === "archive") ids.forEach((fid) => archiveFavorite(fid, data.archived));
    if (data.op === "delete") ids.forEach((fid) => deleteFavorite(fid));
    if (data.op === "addTag") {
      const current = tagsForFavorites(ids);
      ids.forEach((fid) => updateFavorite(fid, { tags: [...(current.get(fid) ?? []), data.tag] }));
    }
    done();
    return { ok: true, data: { count: ids.length } };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ collections

const COLORS = ["blue", "purple", "teal", "orange", "pink", "green", "yellow", "slate"] as const;
const collectionInput = z.object({
  name: z.string().trim().min(1, "Dê um nome à coleção.").max(120),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(32).nullable().optional(),
  color: z.enum(COLORS).nullable().optional(),
  defaultView: z.enum(["cards", "compact", "list"]).optional(),
  visibility: z.enum(["workspace", "private", "link", "public"]).optional(),
});
export type CollectionInput = z.input<typeof collectionInput>;

export async function createCollectionAction(input: CollectionInput & { parentId?: string | null }): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await editor();
    const data = collectionInput.parse(input);
    const parentId = input.parentId ? id.parse(input.parentId) : null;
    assertCollection(ctx, parentId);
    const newId = createCollection({ workspaceId: ctx.workspace.id, userId: ctx.user.id, parentId, ...data });
    if (data.defaultView || data.visibility) updateCollection(newId, { defaultView: data.defaultView, visibility: data.visibility });
    done();
    return { ok: true, data: { id: newId } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCollectionAction(collectionId: string, input: Partial<CollectionInput>): Promise<ActionResult> {
  try {
    const ctx = await editor();
    assertCollection(ctx, id.parse(collectionId));
    const patch = collectionInput.partial().parse(input);
    updateCollection(collectionId, patch);
    if (patch.visibility && patch.visibility !== "link" && patch.visibility !== "public") revokeShareLink("collection", collectionId);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const moveColInput = z.object({ id, parentId: id.nullable(), index: z.number().int().min(0).optional() });

export async function moveCollectionAction(input: z.input<typeof moveColInput>): Promise<ActionResult> {
  try {
    const ctx = await editor();
    const data = moveColInput.parse(input);
    assertCollection(ctx, data.id);
    assertCollection(ctx, data.parentId);
    moveCollection(data.id, data.parentId, data.index);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveCollectionAction(collectionId: string, archived: boolean): Promise<ActionResult> {
  try {
    const ctx = await editor();
    assertCollection(ctx, id.parse(collectionId));
    archiveCollection(collectionId, z.boolean().parse(archived));
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCollectionAction(collectionId: string): Promise<ActionResult> {
  try {
    const ctx = await editor();
    assertCollection(ctx, id.parse(collectionId));
    deleteCollection(collectionId);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Pins are personal (shown on Início). */
export async function togglePinCollectionAction(collectionId: string): Promise<ActionResult<{ pinned: boolean }>> {
  try {
    const ctx = await requireWorkspace();
    assertCollection(ctx, id.parse(collectionId));
    const pinned = toggleMark(ctx.user.id, "collection", collectionId, "pin");
    done();
    return { ok: true, data: { pinned } };
  } catch (e) {
    return fail(e);
  }
}

/** Sets visibility and creates (or revokes) the share token accordingly. */
export async function shareCollectionAction(
  collectionId: string,
  visibility: "workspace" | "private" | "link" | "public",
): Promise<ActionResult<{ token: string | null }>> {
  try {
    const ctx = await editor();
    assertCollection(ctx, id.parse(collectionId));
    const v = z.enum(["workspace", "private", "link", "public"]).parse(visibility);
    updateCollection(collectionId, { visibility: v });
    let token: string | null = null;
    if (v === "link" || v === "public") token = ensureShareLink("collection", collectionId, ctx.user.id);
    else revokeShareLink("collection", collectionId);
    done();
    return { ok: true, data: { token } };
  } catch (e) {
    return fail(e);
  }
}

/** Invalidates the current share link and issues a new one. */
export async function regenerateShareLinkAction(collectionId: string): Promise<ActionResult<{ token: string }>> {
  try {
    const ctx = await editor();
    const c = assertCollection(ctx, id.parse(collectionId))!;
    if (c.visibility !== "link" && c.visibility !== "public") throw new UserError("Ative o compartilhamento por link primeiro.");
    revokeShareLink("collection", collectionId);
    const token = ensureShareLink("collection", collectionId, ctx.user.id);
    done();
    return { ok: true, data: { token } };
  } catch (e) {
    return fail(e);
  }
}
