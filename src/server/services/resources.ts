import "server-only";
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { PlanDocument, ResourceRef } from "@/domain/plan";
import { domainOf } from "@/lib/utils";
import { planAccess } from "./permissions";
import { workspaceRole } from "./workspaces";
import { refKey, type ResolvedResource, type ResourceSearchItem } from "@/features/planner/resource-types";

export type { ResolvedResource, ResourceSearchItem };

const unavailable = (kind: ResourceRef["type"], title: string, subtitle = "Sem acesso"): ResolvedResource => ({
  kind,
  title,
  subtitle,
  href: null,
  external: false,
});

/** A workspace's items are visible inside its own plans, or to its members. */
function canSeeWorkspace(itemWorkspaceId: string, userId: string | null, contextWorkspaceId: string) {
  if (itemWorkspaceId === contextWorkspaceId) return true;
  return userId != null && workspaceRole(userId, itemWorkspaceId) != null;
}

function collectionLinkCount(ids: string[]): Map<string, number> {
  if (!ids.length) return new Map();
  const rows = getDb()
    .select({ id: schema.favorites.collectionId, n: sql<number>`count(*)` })
    .from(schema.favorites)
    .where(and(inArray(schema.favorites.collectionId, ids), isNull(schema.favorites.archivedAt)))
    .groupBy(schema.favorites.collectionId)
    .all();
  return new Map(rows.map((r) => [r.id ?? "", r.n]));
}

/**
 * Resolves a node's resource reference to display info, enforcing access:
 * library items must belong to the plan's workspace (or one the viewer is a
 * member of); linked plans must be readable by the viewer; collections only
 * link through for workspace members.
 */
export function resolveResource(ref: ResourceRef, userId: string | null, workspaceId: string): ResolvedResource {
  const db = getDb();
  switch (ref.type) {
    case "url": {
      const d = domainOf(ref.url);
      return { kind: "url", title: d || ref.url, subtitle: d || "Link externo", href: ref.url, external: true };
    }
    case "page":
      return { kind: "page", title: ref.path, subtitle: "Página do Waypoint", href: ref.path, external: false };
    case "favorite": {
      const f = db.select().from(schema.favorites).where(eq(schema.favorites.id, ref.id)).get();
      if (!f) return unavailable("favorite", "Link removido", "Favorito");
      if (!canSeeWorkspace(f.workspaceId, userId, workspaceId)) return unavailable("favorite", "Link restrito", "Favorito");
      return {
        kind: "favorite",
        title: f.title,
        subtitle: `Favorito · ${f.domain}`,
        href: f.url,
        external: true,
        favicon: f.favicon,
        description: f.description,
      };
    }
    case "collection": {
      const c = db.select().from(schema.collections).where(eq(schema.collections.id, ref.id)).get();
      if (!c) return unavailable("collection", "Coleção removida", "Coleção");
      if (!canSeeWorkspace(c.workspaceId, userId, workspaceId)) return unavailable("collection", "Coleção restrita", "Coleção");
      const n = collectionLinkCount([c.id]).get(c.id) ?? 0;
      const member = userId != null && workspaceRole(userId, c.workspaceId) != null;
      return {
        kind: "collection",
        title: c.name,
        subtitle: `Coleção · ${n} ${n === 1 ? "link" : "links"}`,
        href: member ? `/links?c=${c.id}` : null,
        external: false,
        description: c.description,
      };
    }
    case "plan": {
      const p = db.select().from(schema.plans).where(eq(schema.plans.id, ref.id)).get();
      if (!p) return unavailable("plan", "Plan removido", "Plan");
      if (!planAccess(userId, p)) return unavailable("plan", "Plan restrito", "Plan");
      return { kind: "plan", title: p.title, subtitle: p.archivedAt ? "Plan · arquivado" : "Plan", href: `/plans/${p.id}`, external: false, description: p.description };
    }
    case "file": {
      const a = db.select().from(schema.assets).where(eq(schema.assets.id, ref.id)).get();
      if (!a) return unavailable("file", "Arquivo removido", "Arquivo");
      if (!canSeeWorkspace(a.workspaceId, userId, workspaceId)) return unavailable("file", "Arquivo restrito", "Arquivo");
      return { kind: "file", title: a.fileName, subtitle: "Arquivo", href: `/api/assets/${a.id}`, external: false };
    }
  }
}

/** Resolves every node resource of a document. Keyed by node id. */
export function resolveDocumentResources(doc: PlanDocument, userId: string | null, workspaceId: string): Record<string, ResolvedResource> {
  const cache = new Map<string, ResolvedResource>();
  const out: Record<string, ResolvedResource> = {};
  for (const n of doc.nodes) {
    const r = n.data.resource;
    if (!r) continue;
    const k = refKey(r);
    let v = cache.get(k);
    if (!v) {
      v = resolveResource(r, userId, workspaceId);
      cache.set(k, v);
    }
    out[n.id] = v;
  }
  return out;
}

/** Same as resolveDocumentResources but keyed by ref key (used by the editor cache). */
export function resolveRefs(refs: ResourceRef[], userId: string | null, workspaceId: string): Record<string, ResolvedResource> {
  const out: Record<string, ResolvedResource> = {};
  for (const r of refs.slice(0, 500)) {
    const k = refKey(r);
    if (!out[k]) out[k] = resolveResource(r, userId, workspaceId);
  }
  return out;
}

// ------------------------------------------------------------------ search

function likeAny(q: string, ...cols: AnyColumn[]): SQL | undefined {
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return or(...cols.map((c) => sql`${c} LIKE ${pattern} ESCAPE '\\'`));
}

export type ResourceSearchType = "favorite" | "collection" | "plan";

/** Favorites, collections and plans of the active workspace matching `q` (recent items when empty). */
export function searchResources(
  userId: string,
  workspaceId: string,
  q: string,
  opts: { limit?: number; types?: ResourceSearchType[]; excludePlanId?: string } = {},
): ResourceSearchItem[] {
  const db = getDb();
  const limit = Math.min(opts.limit ?? 6, 25);
  const types = new Set(opts.types ?? ["favorite", "collection", "plan"]);
  const term = q.trim().slice(0, 100);
  const out: ResourceSearchItem[] = [];

  if (types.has("favorite")) {
    const rows = db
      .select()
      .from(schema.favorites)
      .where(
        and(
          eq(schema.favorites.workspaceId, workspaceId),
          isNull(schema.favorites.archivedAt),
          term ? likeAny(term, schema.favorites.title, schema.favorites.url, schema.favorites.description) : undefined,
        ),
      )
      .orderBy(desc(schema.favorites.updatedAt))
      .limit(limit)
      .all();
    for (const f of rows) {
      out.push({
        ref: { type: "favorite", id: f.id },
        resource: { kind: "favorite", title: f.title, subtitle: `Favorito · ${f.domain}`, href: f.url, external: true, favicon: f.favicon, description: f.description },
      });
    }
  }

  if (types.has("collection")) {
    const rows = db
      .select()
      .from(schema.collections)
      .where(
        and(
          eq(schema.collections.workspaceId, workspaceId),
          isNull(schema.collections.archivedAt),
          term ? likeAny(term, schema.collections.name, schema.collections.description) : undefined,
        ),
      )
      .orderBy(desc(schema.collections.updatedAt))
      .limit(limit)
      .all();
    const counts = collectionLinkCount(rows.map((r) => r.id));
    for (const c of rows) {
      const n = counts.get(c.id) ?? 0;
      out.push({
        ref: { type: "collection", id: c.id },
        resource: { kind: "collection", title: c.name, subtitle: `Coleção · ${n} ${n === 1 ? "link" : "links"}`, href: `/links?c=${c.id}`, external: false, description: c.description },
      });
    }
  }

  if (types.has("plan")) {
    const rows = db
      .select()
      .from(schema.plans)
      .where(
        and(
          eq(schema.plans.workspaceId, workspaceId),
          isNull(schema.plans.archivedAt),
          eq(schema.plans.isTemplate, false),
          term ? likeAny(term, schema.plans.title, schema.plans.description) : undefined,
        ),
      )
      .orderBy(desc(schema.plans.updatedAt))
      .limit(limit + 1)
      .all()
      .filter((p) => p.id !== opts.excludePlanId && planAccess(userId, p) != null)
      .slice(0, limit);
    for (const p of rows) {
      out.push({ ref: { type: "plan", id: p.id }, resource: { kind: "plan", title: p.title, subtitle: "Plan", href: `/plans/${p.id}`, external: false, description: p.description } });
    }
  }
  return out;
}

/** Names shown around a plan (breadcrumb / byline). */
export function planContextInfo(plan: { workspaceId: string; createdBy: string | null }) {
  const db = getDb();
  const ws = db.select({ name: schema.workspaces.name }).from(schema.workspaces).where(eq(schema.workspaces.id, plan.workspaceId)).get();
  const owner = plan.createdBy
    ? db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, plan.createdBy)).get()
    : undefined;
  return { workspaceName: ws?.name ?? "Workspace", owner: owner ?? null };
}
