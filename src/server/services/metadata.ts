import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { safeFetch, UnsafeUrlError } from "../lib/safe-fetch";
import { extractMeta, isEmbeddable, type PageMeta } from "../lib/html-meta";

const TTL_MS = 24 * 60 * 60 * 1000;

export type LinkMeta = PageMeta & { url: string; finalUrl?: string; embeddable: boolean | null; error?: string };

/** Fetches (or reads cached) title, description, og:image and favicon for a URL. */
export async function fetchLinkMetadata(url: string, { force = false } = {}): Promise<LinkMeta> {
  const db = getDb();
  const cached = db.select().from(schema.linkMetadata).where(eq(schema.linkMetadata.url, url)).get();
  if (cached && !force && Date.now() - cached.fetchedAt.getTime() < TTL_MS) {
    return {
      url,
      title: cached.title ?? undefined,
      description: cached.description ?? undefined,
      image: cached.image ?? undefined,
      favicon: cached.favicon ?? undefined,
      siteName: cached.siteName ?? undefined,
      embeddable: cached.embeddable,
    };
  }
  try {
    const res = await safeFetch(url, { accept: /^(text\/html|application\/xhtml\+xml)$/, maxBytes: 768_000 });
    const meta = res.body ? extractMeta(res.body, res.url) : {};
    const embeddable = res.status < 400 ? isEmbeddable(res.headers) : null;
    const row = {
      url,
      title: meta.title ?? null,
      description: meta.description ?? null,
      image: meta.image ?? null,
      favicon: meta.favicon ?? null,
      siteName: meta.siteName ?? null,
      embeddable,
      fetchedAt: new Date(),
    };
    db.insert(schema.linkMetadata).values(row).onConflictDoUpdate({ target: schema.linkMetadata.url, set: row }).run();
    return { url, finalUrl: res.url, ...meta, embeddable };
  } catch (e) {
    const error = e instanceof UnsafeUrlError ? e.message : "Não foi possível acessar a página.";
    return { url, embeddable: null, error };
  }
}

/** Whether a page may be shown inside the app's preview iframe. */
export async function checkEmbeddable(url: string): Promise<{ embeddable: boolean; reason?: string }> {
  const meta = await fetchLinkMetadata(url);
  if (meta.error) return { embeddable: false, reason: meta.error };
  if (meta.embeddable === false) return { embeddable: false, reason: "O site bloqueia exibição dentro de outras páginas." };
  return { embeddable: meta.embeddable ?? true };
}
