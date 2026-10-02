/** Client-safe resource display types (resolved on the server by src/server/services/resources.ts). */
import type { ResourceRef } from "@/domain/plan";
import { domainOf } from "@/lib/utils";

export type ResolvedResource = {
  kind: ResourceRef["type"];
  title: string;
  subtitle: string;
  /** null when the viewer can't open it (restricted or missing). */
  href: string | null;
  external: boolean;
  favicon?: string | null;
  description?: string | null;
};

export type ResourceSearchItem = { ref: ResourceRef; resource: ResolvedResource };

export const RESOURCE_KIND_LABEL: Record<ResourceRef["type"], string> = {
  url: "Link",
  favorite: "Favorito",
  collection: "Coleção",
  plan: "Plan",
  file: "Arquivo",
  page: "Página",
};

export function refKey(ref: ResourceRef): string {
  switch (ref.type) {
    case "url":
      return `url:${ref.url}`;
    case "page":
      return `page:${ref.path}`;
    default:
      return `${ref.type}:${ref.id}`;
  }
}

/** Best-effort display info when the server hasn't resolved a ref (e.g. just typed in). */
export function fallbackResource(ref: ResourceRef): ResolvedResource {
  switch (ref.type) {
    case "url": {
      const d = domainOf(ref.url);
      return { kind: "url", title: d || ref.url, subtitle: d || "Link externo", href: ref.url, external: true };
    }
    case "page":
      return { kind: "page", title: ref.path, subtitle: "Página do Waypoint", href: ref.path, external: false };
    case "plan":
      return { kind: "plan", title: "Plan", subtitle: "Plan", href: `/plans/${ref.id}`, external: false };
    case "collection":
      return { kind: "collection", title: "Coleção", subtitle: "Coleção", href: `/links?c=${ref.id}`, external: false };
    case "file":
      return { kind: "file", title: "Arquivo", subtitle: "Arquivo", href: `/api/assets/${ref.id}`, external: false };
    case "favorite":
      return { kind: "favorite", title: "Favorito", subtitle: "Favorito", href: null, external: true };
  }
}

/** Accepts "example.com/x" or full http(s) URLs; returns null when invalid. */
export function parseUserUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith("/")) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Builds a ref→resource map from a node→resource map (server output) and the document. */
export function byRefFromByNode(nodes: { id: string; data: { resource?: ResourceRef | null } }[], byNode: Record<string, ResolvedResource>) {
  const out: Record<string, ResolvedResource> = {};
  for (const n of nodes) {
    const r = n.data.resource;
    if (r && byNode[n.id]) out[refKey(r)] = byNode[n.id];
  }
  return out;
}
