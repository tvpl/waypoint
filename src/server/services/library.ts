import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { newId } from "@/lib/utils";
import { contentRev, LIBRARY_ITEM_MAX_BYTES, LIBRARY_MAX_ITEMS, libraryContentSchema, normalizeLibraryContent, type LibraryItem } from "@/domain/library";
import { UserError } from "./workspaces";

/** The workspace's library, oldest first (the order items were added). */
export function listLibrary(workspaceId: string): LibraryItem[] {
  const rows = getDb().select().from(schema.libraryItems).where(eq(schema.libraryItems.workspaceId, workspaceId)).orderBy(asc(schema.libraryItems.createdAt)).all();
  return rows.flatMap((r) => {
    try {
      const content = libraryContentSchema.parse(JSON.parse(r.content));
      return [{ id: r.id, name: r.name, content, createdAt: r.createdAt.getTime(), rev: contentRev(content) }];
    } catch {
      return [];
    }
  });
}

/** Adds items (from the canvas or an .excalidrawlib file). Invalid ones are skipped. */
export function addLibraryItems(workspaceId: string, userId: string, items: { name?: string; content: unknown }[]): string[] {
  const db = getDb();
  const count = db.select({ n: sql<number>`count(*)` }).from(schema.libraryItems).where(eq(schema.libraryItems.workspaceId, workspaceId)).get()?.n ?? 0;
  if (count + items.length > LIBRARY_MAX_ITEMS) throw new UserError(`A biblioteca comporta até ${LIBRARY_MAX_ITEMS} itens.`);
  const ids: string[] = [];
  const now = Date.now();
  db.transaction((tx) => {
    items.forEach((it, i) => {
      let content;
      try {
        content = JSON.stringify(normalizeLibraryContent(it.content));
      } catch {
        return;
      }
      if (content.length > LIBRARY_ITEM_MAX_BYTES) return;
      const id = newId();
      // Keep the given order: each item a millisecond after the previous one.
      tx.insert(schema.libraryItems).values({ id, workspaceId, name: (it.name ?? "").trim().slice(0, 80), content, createdBy: userId, createdAt: new Date(now + i) }).run();
      ids.push(id);
    });
  });
  if (!ids.length) throw new UserError("Nenhum item válido para adicionar.");
  return ids;
}

export function renameLibraryItem(workspaceId: string, id: string, name: string) {
  getDb()
    .update(schema.libraryItems)
    .set({ name: name.trim().slice(0, 80) })
    .where(and(eq(schema.libraryItems.id, id), eq(schema.libraryItems.workspaceId, workspaceId)))
    .run();
}

/** Some items of the workspace (the ones a plan links to), with their content and revision. */
export function getLibraryItems(workspaceId: string, ids: string[]): LibraryItem[] {
  const want = new Set(ids.slice(0, 200));
  return want.size ? listLibrary(workspaceId).filter((i) => want.has(i.id)) : [];
}

/** Replaces an item's drawing (a linked copy sending its changes back). Returns the new revision. */
export function updateLibraryItem(workspaceId: string, id: string, content: unknown): string {
  let normalized;
  try {
    normalized = normalizeLibraryContent(content);
  } catch {
    throw new UserError("Conteúdo inválido para a biblioteca.");
  }
  const json = JSON.stringify(normalized);
  if (json.length > LIBRARY_ITEM_MAX_BYTES) throw new UserError("O item ficou grande demais para a biblioteca.");
  const res = getDb()
    .update(schema.libraryItems)
    .set({ content: json })
    .where(and(eq(schema.libraryItems.id, id), eq(schema.libraryItems.workspaceId, workspaceId)))
    .run();
  if (!res.changes) throw new UserError("Este item não existe mais na biblioteca.");
  return contentRev(normalized);
}

export function deleteLibraryItems(workspaceId: string, ids: string[]) {
  const db = getDb();
  for (const id of ids.slice(0, LIBRARY_MAX_ITEMS)) db.delete(schema.libraryItems).where(and(eq(schema.libraryItems.id, id), eq(schema.libraryItems.workspaceId, workspaceId))).run();
}
