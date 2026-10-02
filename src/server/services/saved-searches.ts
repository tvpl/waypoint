import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { newId } from "@/lib/utils";
import { UserError } from "./workspaces";

export type SavedSearch = typeof schema.savedSearches.$inferSelect;

const MAX_PER_USER = 50;

/** A user's saved searches in a workspace, in their manual order. */
export function listSavedSearches(userId: string, workspaceId: string): SavedSearch[] {
  return getDb()
    .select()
    .from(schema.savedSearches)
    .where(and(eq(schema.savedSearches.userId, userId), eq(schema.savedSearches.workspaceId, workspaceId)))
    .orderBy(asc(schema.savedSearches.position), asc(schema.savedSearches.createdAt))
    .all();
}

export function getSavedSearch(userId: string, id: string): SavedSearch | undefined {
  return getDb()
    .select()
    .from(schema.savedSearches)
    .where(and(eq(schema.savedSearches.id, id), eq(schema.savedSearches.userId, userId)))
    .get();
}

export function createSavedSearch(input: { userId: string; workspaceId: string; name: string; query: string; sort?: string | null }): string {
  const db = getDb();
  const query = input.query.trim().slice(0, 300);
  const name = input.name.trim().slice(0, 80);
  if (!query) throw new UserError("A busca está vazia.");
  if (!name) throw new UserError("Dê um nome à busca.");
  const count =
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.savedSearches)
      .where(and(eq(schema.savedSearches.userId, input.userId), eq(schema.savedSearches.workspaceId, input.workspaceId)))
      .get()?.n ?? 0;
  if (count >= MAX_PER_USER) throw new UserError(`Limite de ${MAX_PER_USER} buscas salvas atingido.`);
  const id = newId();
  db.insert(schema.savedSearches)
    .values({ id, workspaceId: input.workspaceId, userId: input.userId, name, query, sort: input.sort ?? null, position: count })
    .run();
  return id;
}

export function updateSavedSearch(userId: string, id: string, patch: { name?: string; query?: string; sort?: string | null }) {
  const set: Partial<SavedSearch> = {};
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 80) || "Busca";
  if (patch.query !== undefined) {
    set.query = patch.query.trim().slice(0, 300);
    if (!set.query) throw new UserError("A busca está vazia.");
  }
  if (patch.sort !== undefined) set.sort = patch.sort;
  getDb()
    .update(schema.savedSearches)
    .set(set)
    .where(and(eq(schema.savedSearches.id, id), eq(schema.savedSearches.userId, userId)))
    .run();
}

export function deleteSavedSearch(userId: string, id: string) {
  getDb()
    .delete(schema.savedSearches)
    .where(and(eq(schema.savedSearches.id, id), eq(schema.savedSearches.userId, userId)))
    .run();
}
