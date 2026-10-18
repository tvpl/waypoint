import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Role, Visibility } from "../db/schema";
import {
  EMPTY_DOCUMENT,
  documentResourceRefs,
  documentSearchEntries,
  normalizeDocument,
  type PlanDocument,
} from "@/domain/plan";
import { newId, newToken, slugify } from "@/lib/utils";
import { planAccess, type Access } from "./permissions";
import { indexEntity, reindexPlanNodes, removePlanFromIndex } from "./search";
import { setPlanTags, tagsForPlans } from "./tags";
import { UserError } from "./workspaces";
import { planThumb } from "@/domain/plan-thumb";
import { layersOf } from "@/domain/layers";

export type PlanRow = typeof schema.plans.$inferSelect;

export type PlanListFilter = "mine" | "shared" | "templates" | "archived" | "all";

function uniqueSlug(workspaceId: string, base: string, exceptId?: string) {
  const db = getDb();
  const root = slugify(base);
  let slug = root;
  for (let i = 2; ; i++) {
    const hit = db
      .select({ id: schema.plans.id })
      .from(schema.plans)
      .where(
        and(
          eq(schema.plans.workspaceId, workspaceId),
          eq(schema.plans.slug, slug),
          exceptId ? ne(schema.plans.id, exceptId) : undefined,
        ),
      )
      .get();
    if (!hit) return slug;
    slug = `${root}-${i}`;
  }
}

type DocRow = { nodesJson: string; edgesJson: string; viewportJson: string; layersJson?: string | null };

export function parseDoc(row: DocRow): PlanDocument {
  const extra = row.layersJson ? (JSON.parse(row.layersJson) as Pick<PlanDocument, "layers" | "views" | "palette">) : {};
  return normalizeDocument({
    schemaVersion: 1,
    nodes: JSON.parse(row.nodesJson),
    edges: JSON.parse(row.edgesJson),
    viewport: JSON.parse(row.viewportJson),
    ...(extra.layers ? { layers: extra.layers } : {}),
    ...(extra.views ? { views: extra.views } : {}),
    ...(extra.palette?.length ? { palette: extra.palette } : {}),
  });
}

/** Layers, views and the palette stored beside the nodes (null when the plan uses none). */
const layersJsonOf = (doc: PlanDocument) =>
  doc.layers || doc.views || doc.palette?.length ? JSON.stringify({ layers: doc.layers, views: doc.views, ...(doc.palette?.length ? { palette: doc.palette } : {}) }) : null;

export type { Thumb, ThumbNode } from "@/domain/plan-thumb";

// ------------------------------------------------------------------ queries

export function getPlan(id: string): PlanRow | undefined {
  return getDb().select().from(schema.plans).where(eq(schema.plans.id, id)).get();
}

export function getPlanWithAccess(id: string, userId: string | null, shareToken?: string | null) {
  const plan = getPlan(id);
  if (!plan) return null;
  const access = planAccess(userId, plan, shareToken);
  if (!access) return null;
  return { plan, access };
}

export function listPlans(userId: string, workspaceId: string, filter: PlanListFilter = "mine") {
  const db = getDb();
  const memberPlanIds = db
    .select({ planId: schema.planMembers.planId })
    .from(schema.planMembers)
    .where(eq(schema.planMembers.userId, userId))
    .all()
    .map((r) => r.planId);

  const scope = or(
    eq(schema.plans.workspaceId, workspaceId),
    memberPlanIds.length ? inArray(schema.plans.id, memberPlanIds) : undefined,
  );
  const conds = [scope];
  if (filter === "archived") conds.push(isNotNull(schema.plans.archivedAt));
  else conds.push(isNull(schema.plans.archivedAt));
  if (filter === "templates") conds.push(eq(schema.plans.isTemplate, true));
  if (filter === "mine") conds.push(eq(schema.plans.createdBy, userId), eq(schema.plans.isTemplate, false));
  if (filter === "shared") conds.push(ne(schema.plans.createdBy, userId), eq(schema.plans.isTemplate, false));

  const rows = db
    .select({
      plan: schema.plans,
      nodesJson: schema.planDocuments.nodesJson,
      edgesJson: schema.planDocuments.edgesJson,
      viewportJson: schema.planDocuments.viewportJson,
      layersJson: schema.planDocuments.layersJson,
      publishedVersion: schema.planVersions.version,
    })
    .from(schema.plans)
    .leftJoin(schema.planDocuments, eq(schema.planDocuments.planId, schema.plans.id))
    .leftJoin(schema.planVersions, eq(schema.planVersions.id, schema.plans.publishedVersionId))
    .where(and(...conds))
    .orderBy(desc(schema.plans.updatedAt))
    .all()
    .filter((r) => planAccess(userId, r.plan) != null);

  const tagMap = tagsForPlans(rows.map((r) => r.plan.id));
  return rows.map((r) => {
    const doc = r.nodesJson ? parseDoc(r as DocRow) : null;
    return {
      ...r.plan,
      tags: tagMap.get(r.plan.id) ?? [],
      publishedVersion: r.publishedVersion ?? null,
      access: planAccess(userId, r.plan) as Access,
      thumbnail: doc ? planThumb(doc) : { nodes: [], edges: [] },
      layerCount: doc ? layersOf(doc).length : 1,
      viewCount: doc?.views?.length ?? 0,
    };
  });
}

export function getDraft(planId: string): { document: PlanDocument; version: number; updatedAt: Date } {
  const row = getDb().select().from(schema.planDocuments).where(eq(schema.planDocuments.planId, planId)).get();
  if (!row) return { document: EMPTY_DOCUMENT, version: 0, updatedAt: new Date(0) };
  return { document: parseDoc(row), version: row.version, updatedAt: row.updatedAt };
}

export type PlanSnapshot = { title: string; description: string | null; document: PlanDocument };

export function getVersion(versionId: string) {
  const row = getDb().select().from(schema.planVersions).where(eq(schema.planVersions.id, versionId)).get();
  if (!row) return null;
  return { ...row, snapshot: JSON.parse(row.snapshotJson) as PlanSnapshot };
}

export function getPublished(plan: PlanRow) {
  return plan.publishedVersionId ? getVersion(plan.publishedVersionId) : null;
}

export function listVersions(planId: string) {
  return getDb()
    .select({
      id: schema.planVersions.id,
      version: schema.planVersions.version,
      title: schema.planVersions.title,
      createdAt: schema.planVersions.createdAt,
      authorName: schema.users.name,
    })
    .from(schema.planVersions)
    .leftJoin(schema.users, eq(schema.users.id, schema.planVersions.createdBy))
    .where(eq(schema.planVersions.planId, planId))
    .orderBy(desc(schema.planVersions.version))
    .all();
}

/** True if the draft differs from the published snapshot. */
export function hasUnpublishedChanges(plan: PlanRow): boolean {
  const pub = getPublished(plan);
  if (!pub) return true;
  const draft = getDraft(plan.id).document;
  return (
    JSON.stringify(draft) !== JSON.stringify(pub.snapshot.document) ||
    plan.title !== pub.snapshot.title ||
    (plan.description ?? null) !== (pub.snapshot.description ?? null)
  );
}

// ------------------------------------------------------------------ mutations

export function createPlan(input: {
  workspaceId: string;
  userId: string;
  title: string;
  description?: string | null;
  document?: PlanDocument;
  visibility?: Visibility;
  isTemplate?: boolean;
  tags?: string[];
}) {
  const db = getDb();
  const id = newId();
  const title = input.title.trim() || "Plan sem título";
  const doc = normalizeDocument(input.document ?? EMPTY_DOCUMENT);
  db.transaction((tx) => {
    tx.insert(schema.plans)
      .values({
        id,
        workspaceId: input.workspaceId,
        title,
        slug: uniqueSlug(input.workspaceId, title),
        description: input.description ?? null,
        visibility: input.visibility ?? "workspace",
        isTemplate: input.isTemplate ?? false,
        createdBy: input.userId,
      })
      .run();
    tx.insert(schema.planDocuments)
      .values({
        planId: id,
        nodesJson: JSON.stringify(doc.nodes),
        edgesJson: JSON.stringify(doc.edges),
        viewportJson: JSON.stringify(doc.viewport),
        layersJson: layersJsonOf(doc),
        updatedBy: input.userId,
      })
      .run();
    if (input.tags?.length) setPlanTags(tx, input.workspaceId, id, input.tags);
  });
  indexPlan(id);
  syncDocumentIndexes(id, input.workspaceId, doc);
  return id;
}

export function updatePlanMeta(
  planId: string,
  patch: { title?: string; description?: string | null; visibility?: Visibility; tags?: string[]; icon?: string | null; isTemplate?: boolean },
) {
  const db = getDb();
  const plan = getPlan(planId);
  if (!plan) throw new UserError("Plan não encontrado.");
  db.transaction((tx) => {
    const set: Partial<typeof schema.plans.$inferInsert> = { updatedAt: new Date() };
    if (patch.title !== undefined) {
      set.title = patch.title.trim() || "Plan sem título";
      set.slug = uniqueSlug(plan.workspaceId, set.title, planId);
    }
    if (patch.description !== undefined) set.description = patch.description?.trim() || null;
    if (patch.visibility !== undefined) set.visibility = patch.visibility;
    if (patch.icon !== undefined) set.icon = patch.icon;
    if (patch.isTemplate !== undefined) set.isTemplate = patch.isTemplate;
    tx.update(schema.plans).set(set).where(eq(schema.plans.id, planId)).run();
    if (patch.tags) setPlanTags(tx, plan.workspaceId, planId, patch.tags);
  });
  indexPlan(planId);
}

export type SaveResult =
  | { ok: true; version: number; updatedAt: number }
  | { ok: false; conflict: true; version: number; document: PlanDocument };

/**
 * Optimistic-concurrency draft save: succeeds only if `expectedVersion`
 * matches the stored version, then bumps it.
 */
export function saveDraft(planId: string, userId: string, expectedVersion: number, input: unknown): SaveResult {
  const doc = normalizeDocument(input);
  const db = getDb();
  const plan = getPlan(planId);
  if (!plan) throw new UserError("Plan não encontrado.");
  const now = new Date();
  const res = db
    .update(schema.planDocuments)
    .set({
      nodesJson: JSON.stringify(doc.nodes),
      edgesJson: JSON.stringify(doc.edges),
      viewportJson: JSON.stringify(doc.viewport),
      layersJson: layersJsonOf(doc),
      version: sql`${schema.planDocuments.version} + 1`,
      updatedBy: userId,
      updatedAt: now,
    })
    .where(and(eq(schema.planDocuments.planId, planId), eq(schema.planDocuments.version, expectedVersion)))
    .run();
  if (res.changes === 0) {
    const current = getDraft(planId);
    return { ok: false, conflict: true, version: current.version, document: current.document };
  }
  db.update(schema.plans).set({ updatedAt: now }).where(eq(schema.plans.id, planId)).run();
  syncDocumentIndexes(planId, plan.workspaceId, doc);
  return { ok: true, version: expectedVersion + 1, updatedAt: now.getTime() };
}

/** Overwrites the draft regardless of version (used by restore / conflict "keep mine"). */
export function forceDraft(planId: string, userId: string, input: unknown) {
  const current = getDraft(planId);
  return saveDraft(planId, userId, current.version, input);
}

function syncDocumentIndexes(planId: string, workspaceId: string, doc: PlanDocument) {
  const db = getDb();
  db.transaction((tx) => {
    reindexPlanNodes(workspaceId, planId, documentSearchEntries(doc));
    tx.delete(schema.resourceRefs).where(eq(schema.resourceRefs.sourcePlanId, planId)).run();
    for (const r of documentResourceRefs(doc)) {
      tx.insert(schema.resourceRefs)
        .values({
          sourcePlanId: planId,
          sourceNodeId: r.nodeId,
          sourceNodeTitle: r.nodeTitle,
          targetType: r.type,
          targetId: r.targetId,
        })
        .run();
    }
  });
}

/** Rebuilds the search entries (plan, nodes) and resource refs of these plans (e.g. after a restore). */
export function reindexPlans(ids: string[]) {
  for (const id of ids) indexPlan(id);
}

function indexPlan(planId: string) {
  const plan = getPlan(planId);
  if (!plan) return;
  if (plan.archivedAt) {
    removePlanFromIndex(planId);
    return;
  }
  const tags = tagsForPlans([planId]).get(planId) ?? [];
  indexEntity({
    workspaceId: plan.workspaceId,
    type: "plan",
    id: plan.id,
    title: plan.title,
    body: plan.description,
    tags: tags.join(" "),
  });
  if (plan.archivedAt == null) syncDocumentIndexes(planId, plan.workspaceId, getDraft(planId).document);
}

export function publishPlan(planId: string, userId: string) {
  const db = getDb();
  const plan = getPlan(planId);
  if (!plan) throw new UserError("Plan não encontrado.");
  const draft = getDraft(planId);
  const snapshot: PlanSnapshot = { title: plan.title, description: plan.description, document: draft.document };
  const id = newId();
  db.transaction((tx) => {
    const last = tx
      .select({ v: sql<number>`coalesce(max(${schema.planVersions.version}), 0)` })
      .from(schema.planVersions)
      .where(eq(schema.planVersions.planId, planId))
      .get();
    const version = (last?.v ?? 0) + 1;
    tx.insert(schema.planVersions)
      .values({
        id,
        planId,
        version,
        title: plan.title,
        description: plan.description,
        snapshotJson: JSON.stringify(snapshot),
        createdBy: userId,
      })
      .run();
    tx.update(schema.plans).set({ publishedVersionId: id }).where(eq(schema.plans.id, planId)).run();
  });
  return getVersion(id)!;
}

export function unpublishPlan(planId: string) {
  getDb().update(schema.plans).set({ publishedVersionId: null }).where(eq(schema.plans.id, planId)).run();
}

/** Copies a snapshot into the draft. The published version is untouched. */
export function restoreVersion(planId: string, versionId: string, userId: string) {
  const v = getVersion(versionId);
  if (!v || v.planId !== planId) throw new UserError("Versão não encontrada.");
  updatePlanMeta(planId, { title: v.snapshot.title, description: v.snapshot.description });
  return forceDraft(planId, userId, v.snapshot.document);
}

export function duplicatePlan(planId: string, userId: string, workspaceId: string, opts: { versionId?: string; asTemplate?: boolean; title?: string } = {}) {
  const plan = getPlan(planId);
  if (!plan) throw new UserError("Plan não encontrado.");
  const src = opts.versionId ? getVersion(opts.versionId)?.snapshot : { title: plan.title, description: plan.description, document: getDraft(planId).document };
  if (!src) throw new UserError("Versão não encontrada.");
  return createPlan({
    workspaceId,
    userId,
    title: opts.title ?? (plan.isTemplate && !opts.asTemplate ? src.title : `${src.title} (cópia)`),
    description: src.description,
    document: src.document,
    isTemplate: opts.asTemplate ?? false,
    tags: tagsForPlans([planId]).get(planId) ?? [],
  });
}

export function archivePlan(planId: string, archived: boolean) {
  getDb()
    .update(schema.plans)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(schema.plans.id, planId))
    .run();
  indexPlan(planId);
}

export function deletePlan(planId: string) {
  removePlanFromIndex(planId);
  getDb().delete(schema.plans).where(eq(schema.plans.id, planId)).run();
}

// ------------------------------------------------------------------ sharing

export function listPlanMembers(planId: string) {
  return getDb()
    .select({ userId: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.planMembers.role })
    .from(schema.planMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.planMembers.userId))
    .where(eq(schema.planMembers.planId, planId))
    .all();
}

export function setPlanMember(planId: string, userId: string, role: Role | null) {
  const db = getDb();
  if (role == null) {
    db.delete(schema.planMembers).where(and(eq(schema.planMembers.planId, planId), eq(schema.planMembers.userId, userId))).run();
    return;
  }
  db.insert(schema.planMembers)
    .values({ planId, userId, role })
    .onConflictDoUpdate({ target: [schema.planMembers.planId, schema.planMembers.userId], set: { role } })
    .run();
}

export function ensureShareLink(resourceType: "plan" | "collection", resourceId: string, userId: string) {
  const db = getDb();
  const existing = db
    .select({ token: schema.shareLinks.token })
    .from(schema.shareLinks)
    .where(and(eq(schema.shareLinks.resourceType, resourceType), eq(schema.shareLinks.resourceId, resourceId)))
    .get();
  if (existing) return existing.token;
  const token = newToken();
  db.insert(schema.shareLinks).values({ token, resourceType, resourceId, createdBy: userId }).run();
  return token;
}

export function revokeShareLink(resourceType: "plan" | "collection", resourceId: string) {
  getDb()
    .delete(schema.shareLinks)
    .where(and(eq(schema.shareLinks.resourceType, resourceType), eq(schema.shareLinks.resourceId, resourceId)))
    .run();
}

export function resolveShareToken(token: string) {
  return getDb().select().from(schema.shareLinks).where(eq(schema.shareLinks.token, token)).get() ?? null;
}

// ------------------------------------------------------------------ backlinks

/** Plans/nodes whose resource points to the given target ("Usado em"). */
export function backlinks(targetType: "plan" | "favorite" | "collection", targetId: string, userId: string) {
  return getDb()
    .select({
      planId: schema.plans.id,
      planTitle: schema.plans.title,
      nodeId: schema.resourceRefs.sourceNodeId,
      nodeTitle: schema.resourceRefs.sourceNodeTitle,
      plan: schema.plans,
    })
    .from(schema.resourceRefs)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.resourceRefs.sourcePlanId))
    .where(and(eq(schema.resourceRefs.targetType, targetType), eq(schema.resourceRefs.targetId, targetId), isNull(schema.plans.archivedAt)))
    .all()
    .filter((r) => planAccess(userId, r.plan) != null)
    .map(({ plan: _p, ...rest }) => rest);
}
