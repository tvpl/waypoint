import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OPEN_BEHAVIORS } from "@/server/db/schema";
import { createFavorite, normalizeUrl } from "@/server/services/links";
import { fetchLinkMetadata } from "@/server/services/metadata";
import { apiLink, appOrigin, flatCollections } from "../_lib/data";
import { apiError, json, preflight, withApi } from "../_lib/http";

export const OPTIONS = preflight;

const body = z.object({
  url: z.string({ error: "Informe a URL." }).trim().min(1, "Informe a URL.").max(4096, "URL muito longa."),
  title: z.string().trim().max(500).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  collectionId: z.string().min(1).max(64).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(48)).max(40, "No máximo 40 tags.").optional(),
  openBehavior: z.enum(OPEN_BEHAVIORS).optional(),
});

const httpOnly = (v: string | undefined) => (v && /^https?:\/\//i.test(v) && v.length <= 2048 ? v : null);

/**
 * POST /api/v1/links { url, title?, description?, collectionId?, tags?, openBehavior? } → 201 { link }
 * Missing title / description / favicon / cover are filled from the page (SSRF-safe fetch).
 * Editors and owners only.
 */
export async function POST(req: Request) {
  return withApi(req, { write: true }, async (ctx) => {
    const raw = await req.json().catch(() => undefined);
    if (raw === undefined) return apiError(req, 400, "invalid", "Envie um corpo JSON.");
    const data = body.parse(raw);
    const url = normalizeUrl(data.url);
    const collections = flatCollections(ctx.workspaceId, ctx.user.id);
    if (data.collectionId && !collections.some((c) => c.id === data.collectionId)) {
      return apiError(req, 404, "collection_not_found", "Coleção não encontrada.");
    }
    const meta = await fetchLinkMetadata(url);
    const id = createFavorite(ctx.workspaceId, ctx.user.id, {
      url,
      title: data.title || meta.title?.slice(0, 500),
      description: data.description || meta.description?.slice(0, 5000) || null,
      favicon: httpOnly(meta.favicon),
      coverImage: httpOnly(meta.image),
      collectionId: data.collectionId ?? null,
      tags: data.tags,
      openBehavior: data.openBehavior,
    });
    revalidatePath("/links");
    revalidatePath("/");
    return json(req, { link: apiLink(id, ctx, appOrigin(req), collections) }, { status: 201 });
  });
}
