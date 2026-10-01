import "server-only";
import { getDb } from "../db";

export type SearchEntityType = "plan" | "node" | "collection" | "favorite";

type Conn = { $client: import("better-sqlite3").Database };

function client(conn?: Conn) {
  return (conn ?? getDb()).$client;
}

export function indexEntity(
  entry: {
    workspaceId: string;
    type: SearchEntityType;
    id: string;
    parentId?: string | null;
    title: string;
    body?: string | null;
    tags?: string | null;
  },
  conn?: Conn,
) {
  const c = client(conn);
  c.prepare("DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?").run(entry.type, entry.id);
  c.prepare(
    "INSERT INTO search_index (workspace_id, entity_type, entity_id, parent_id, title, body, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(entry.workspaceId, entry.type, entry.id, entry.parentId ?? "", entry.title, entry.body ?? "", entry.tags ?? "");
}

export function removeEntity(type: SearchEntityType, id: string, conn?: Conn) {
  client(conn).prepare("DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?").run(type, id);
}

/** Replace all node entries of a plan (node ids are only unique within a plan). */
export function reindexPlanNodes(
  workspaceId: string,
  planId: string,
  nodes: { nodeId: string; title: string; body: string; tags: string }[],
  conn?: Conn,
) {
  const c = client(conn);
  c.prepare("DELETE FROM search_index WHERE entity_type = 'node' AND parent_id = ?").run(planId);
  const ins = c.prepare(
    "INSERT INTO search_index (workspace_id, entity_type, entity_id, parent_id, title, body, tags) VALUES (?, 'node', ?, ?, ?, ?, ?)",
  );
  for (const n of nodes) ins.run(workspaceId, `${planId}:${n.nodeId}`, planId, n.title, n.body, n.tags);
}

export function removePlanFromIndex(planId: string, conn?: Conn) {
  const c = client(conn);
  c.prepare("DELETE FROM search_index WHERE (entity_type = 'plan' AND entity_id = ?) OR (entity_type = 'node' AND parent_id = ?)").run(
    planId,
    planId,
  );
}

/** Builds a safe FTS5 query: every term quoted, prefix-matched, AND-ed. */
export function toFtsQuery(input: string): string | null {
  const terms = input
    .normalize("NFKC")
    .split(/\s+/)
    .map((t) => t.replace(/^#/, "").replace(/"/g, "").trim())
    .filter(Boolean)
    .slice(0, 8);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t}"*`).join(" ");
}

export type SearchHit = {
  type: SearchEntityType;
  id: string;
  parentId: string | null;
  title: string;
  snippet: string;
};

export function searchIndex(workspaceId: string, query: string, limit = 40): SearchHit[] {
  const q = toFtsQuery(query);
  if (!q) return [];
  const rows = client()
    .prepare(
      `SELECT entity_type AS type, entity_id AS id, parent_id AS parentId, title,
              snippet(search_index, 5, '[[', ']]', '…', 12) AS snippet
         FROM search_index
        WHERE search_index MATCH ? AND workspace_id = ?
        ORDER BY bm25(search_index, 0, 0, 0, 0, 8.0, 1.0, 4.0)
        LIMIT ?`,
    )
    .all(q, workspaceId, limit) as SearchHit[];
  return rows.map((r) => ({ ...r, parentId: r.parentId || null }));
}
