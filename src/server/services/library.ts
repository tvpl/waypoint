import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { newId } from "@/lib/utils";
import { LIBRARY_ITEM_MAX_BYTES, LIBRARY_MAX_ITEMS, libraryContentSchema, normalizeLibraryContent, type LibraryItem } from "@/domain/library";
import { UserError } from "./workspaces";

/** The workspace's library, oldest first (the order items were added). */
export function listLibrary(workspaceId: string): LibraryItem[] {
  const rows = getDb().select().from(schema.libraryItems).where(eq(schema.libraryItems.workspaceId, workspaceId)).orderBy(asc(schema.libraryItems.createdAt)).all();
  return rows.flatMap((r) => {
    try {
      const content = libraryContentSchema.parse(JSON.parse(r.content));
      return [{ id: r.id, name: r.name, content, createdAt: r.createdAt.getTime() }];
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

export function deleteLibraryItems(workspaceId: string, ids: string[]) {
  const db = getDb();
  for (const id of ids.slice(0, LIBRARY_MAX_ITEMS)) db.delete(schema.libraryItems).where(and(eq(schema.libraryItems.id, id), eq(schema.libraryItems.workspaceId, workspaceId))).run();
}
