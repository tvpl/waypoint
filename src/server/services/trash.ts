import "server-only";
import { and, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { getDb, schema } from "../db";
import { atLeast, planAccess } from "./permissions";
import { getPlanRow, purgePlan, restorePlan } from "./plans";
import {
  getCollectionRow,
  getFavoriteRow,
  hiddenCollectionIds,
  purgeCollection,
  purgeFavorite,
  restoreCollection,
  restoreFavorite,
} from "./links";
import { canEditWorkspace, UserError, workspaceRole } from "./workspaces";
import { TRASH_RETENTION_MS, type TrashItem, type TrashRef, type TrashType } from "@/features/trash/types";

/**
 * Lixeira: deleted plans, collections and links wait here for 30 days (soft delete via
 * `deletedAt`) before purgeTrash removes them for good. Who may restore or delete an item
 * for good is who could delete it: the plan's owner (planAccess), editors for the library.
 */

type Actor = { workspaceId: string; userId: string };

const NOT_FOUND = "Item não encontrado na lixeira.";
const FORBIDDEN = "Você não tem permissão para esta ação.";

function memberRole(actor: Actor) {
  const role = workspaceRole(actor.userId, actor.workspaceId);
  if (!role) throw new UserError(FORBIDDEN);
  return role;
}

/** Plans the user reaches from this workspace: its own plus the ones they were added to (as listPlans). */
function trashedPlans(actor: Actor) {
  const db = getDb();
  const memberPlanIds = db
    .select({ planId: schema.planMembers.planId })
    .from(schema.planMembers)
    .where(eq(schema.planMembers.userId, actor.userId))
    .all()
    .map((r) => r.planId);
  return db
    .select()
    .from(schema.plans)
    .where(
      and(
        isNotNull(schema.plans.deletedAt),
        or(eq(schema.plans.workspaceId, actor.workspaceId), memberPlanIds.length ? inArray(schema.plans.id, memberPlanIds) : undefined),
      ),
    )
    .all()
    .filter((p) => atLeast(planAccess(actor.userId, p), "owner"));
}

const purgeAt = (d: Date) => d.getTime() + TRASH_RETENTION_MS;

/** Everything in the trash this person can restore, newest first. */
export function listTrash(actor: Actor): TrashItem[] {
  const role = memberRole(actor);
  const db = getDb();
  const items: TrashItem[] = [];

  for (const p of trashedPlans(actor)) {
    items.push({ type: "plan", id: p.id, title: p.title, deletedAt: p.deletedAt!.getTime(), purgeAt: purgeAt(p.deletedAt!), icon: p.icon, color: null, detail: p.description });
  }

  if (canEditWorkspace(role)) {
    // Only privacy hides here: other people's private collections stay out of this person's trash.
    const hidden = hiddenCollectionIds(actor.workspaceId, actor.userId, { trashed: false });
    const cols = db.select().from(schema.collections).where(eq(schema.collections.workspaceId, actor.workspaceId)).all();
    const byId = new Map(cols.map((c) => [c.id, c]));
    const children = new Map<string, typeof cols>();
    for (const c of cols) if (c.parentId) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
    const trashedIds = cols.filter((c) => c.deletedAt).map((c) => c.id);
    const links = new Map<string, number>();
    if (trashedIds.length) {
      for (const f of db
        .select({ collectionId: schema.favorites.collectionId })
        .from(schema.favorites)
        .where(and(inArray(schema.favorites.collectionId, trashedIds), isNull(schema.favorites.deletedAt)))
        .all()) {
        links.set(f.collectionId!, (links.get(f.collectionId!) ?? 0) + 1);
      }
    }
    const sameStamp = (a: Date | null, b: Date | null) => !!a && !!b && a.getTime() === b.getTime();
    for (const c of cols) {
      if (!c.deletedAt || hidden.has(c.id)) continue;
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      // Trashed together with its parent: it travels inside the parent's row.
      if (parent && sameStamp(parent.deletedAt, c.deletedAt)) continue;
      let linkCount = 0;
      let collectionCount = 0;
      const walk = (id: string) => {
        linkCount += links.get(id) ?? 0;
        for (const k of children.get(id) ?? []) {
          if (!sameStamp(k.deletedAt, c.deletedAt)) continue;
          collectionCount++;
          walk(k.id);
        }
      };
      walk(c.id);
      items.push({
        type: "collection",
        id: c.id,
        title: c.name,
        deletedAt: c.deletedAt.getTime(),
        purgeAt: purgeAt(c.deletedAt),
        icon: c.icon,
        color: c.color,
        detail: c.description,
        linkCount,
        collectionCount,
        destination: parent?.name ?? null,
      });
    }

    for (const f of db
      .select()
      .from(schema.favorites)
      .where(and(eq(schema.favorites.workspaceId, actor.workspaceId), isNotNull(schema.favorites.deletedAt)))
      .all()) {
      if (f.collectionId && hidden.has(f.collectionId)) continue;
      const col = f.collectionId ? byId.get(f.collectionId) : undefined;
      items.push({
        type: "favorite",
        id: f.id,
        title: f.title,
        deletedAt: f.deletedAt!.getTime(),
        purgeAt: purgeAt(f.deletedAt!),
        icon: f.icon,
        color: null,
        detail: f.domain,
        url: f.url,
        favicon: f.favicon,
        destination: col && !col.deletedAt ? col.name : null,
      });
    }
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt || a.title.localeCompare(b.title, "pt-BR"));
}

/** Number of rows in this person's trash (settings card). */
export function countTrash(actor: Actor): number {
  return listTrash(actor).length;
}

/** Checks the item is in the trash and the actor may act on it (same rule that allowed deleting it). */
function assertTrashed(actor: Actor, type: TrashType, id: string) {
  const role = memberRole(actor);
  if (type === "plan") {
    const plan = getPlanRow(id);
    const access = plan ? planAccess(actor.userId, plan) : null;
    if (!plan?.deletedAt || !access) throw new UserError(NOT_FOUND);
    if (!atLeast(access, "owner")) throw new UserError(FORBIDDEN);
    return;
  }
  if (!canEditWorkspace(role)) throw new UserError(FORBIDDEN);
  const hidden = hiddenCollectionIds(actor.workspaceId, actor.userId, { trashed: false });
  if (type === "collection") {
    const col = getCollectionRow(id);
    if (!col?.deletedAt || col.workspaceId !== actor.workspaceId || hidden.has(col.id)) throw new UserError(NOT_FOUND);
    return;
  }
  const fav = getFavoriteRow(id);
  if (!fav?.deletedAt || fav.workspaceId !== actor.workspaceId || (fav.collectionId && hidden.has(fav.collectionId))) throw new UserError(NOT_FOUND);
}

/** Brings an item back where it was (a collection with what was trashed with it; a link whose collection is gone lands in "Sem coleção"). */
export function restoreFromTrash(actor: Actor, type: TrashType, id: string) {
  assertTrashed(actor, type, id);
  if (type === "plan") restorePlan(id);
  else if (type === "collection") restoreCollection(id);
  else restoreFavorite(id);
}

/**
 * Restores several items (the "Desfazer" of a bulk delete). Items that aren't in the trash, or
 * that this person can't restore, are skipped; it fails only when none can come back.
 */
export function restoreManyFromTrash(actor: Actor, refs: TrashRef[]) {
  let restored = 0;
  let firstError: unknown = null;
  for (const r of refs) {
    try {
      restoreFromTrash(actor, r.type, r.id);
      restored++;
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      firstError ??= e;
    }
  }
  if (!restored && firstError) throw firstError;
  return restored;
}

function purge(type: TrashType, id: string) {
  if (type === "plan") purgePlan(id);
  else if (type === "collection") purgeCollection(id);
  else purgeFavorite(id);
}

/**
 * Deletes an item for good — the old hard delete: a collection's sub-collections go with it
 * and its links move up to the parent collection (or "Sem coleção"); none is lost.
 */
export function deleteForever(actor: Actor, type: TrashType, id: string) {
  assertTrashed(actor, type, id);
  purge(type, id);
}

/** Deletes for good everything in this person's trash. Returns how many rows went. */
export function emptyTrash(actor: Actor) {
  const items = listTrash(actor);
  for (const it of items) purge(it.type, it.id);
  return items.length;
}

/**
 * Deletes for good what has been in the workspace's trash for more than 30 days. Cheap enough
 * to run after each app render (see the (app) layout).
 */
export function purgeTrash(workspaceId: string, now = Date.now()) {
  const db = getDb();
  const cutoff = new Date(now - TRASH_RETENTION_MS);
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  const p = schema.plans;
  const plans = ids(db.select({ id: p.id }).from(p).where(and(eq(p.workspaceId, workspaceId), isNotNull(p.deletedAt), lte(p.deletedAt, cutoff))).all());
  for (const id of plans) purgePlan(id);
  const c = schema.collections;
  const collections = ids(db.select({ id: c.id }).from(c).where(and(eq(c.workspaceId, workspaceId), isNotNull(c.deletedAt), lte(c.deletedAt, cutoff))).all());
  // Sub-collections trashed with a parent go with it (cascade): skip the ones already gone.
  for (const id of collections) if (getCollectionRow(id)) purgeCollection(id);
  const f = schema.favorites;
  const favorites = ids(db.select({ id: f.id }).from(f).where(and(eq(f.workspaceId, workspaceId), isNotNull(f.deletedAt), lte(f.deletedAt, cutoff))).all());
  for (const id of favorites) purgeFavorite(id);
  return { plans: plans.length, collections: collections.length, favorites: favorites.length };
}
