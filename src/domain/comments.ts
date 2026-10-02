/**
 * Plan comments — shared (client + server) shapes and pure helpers.
 * Persistence and permissions live in src/server/services/comments.ts.
 */

export const COMMENT_MAX_LENGTH = 4000;

export type CommentView = {
  id: string;
  planId: string;
  /** Node the thread is about; null = the plan itself ("No plan"). */
  nodeId: string | null;
  /** Thread root (one level of replies). */
  parentId: string | null;
  body: string;
  resolvedAt: number | null;
  createdAt: number;
  updatedAt: number;
  author: { id: string; name: string };
};

export type CommentThread = { root: CommentView; replies: CommentView[] };

/** Groups a flat, oldest-first list into threads (replies whose root is gone are dropped). */
export function toThreads(list: CommentView[]): CommentThread[] {
  const threads = new Map<string, CommentThread>();
  for (const c of list) if (!c.parentId) threads.set(c.id, { root: c, replies: [] });
  for (const c of list) if (c.parentId) threads.get(c.parentId)?.replies.push(c);
  return [...threads.values()];
}

/**
 * Per node: comments in unresolved threads (badge on the canvas).
 * Overall: unresolved threads (badge on the panel toggle).
 */
export function countComments(list: Pick<CommentView, "id" | "nodeId" | "parentId" | "resolvedAt">[]) {
  const roots = new Map(list.filter((c) => !c.parentId).map((c) => [c.id, c]));
  const byNode: Record<string, number> = {};
  let unresolvedThreads = 0;
  for (const r of roots.values()) if (!r.resolvedAt) unresolvedThreads++;
  for (const c of list) {
    const root = c.parentId ? roots.get(c.parentId) : c;
    if (!root || root.resolvedAt || !root.nodeId) continue;
    byNode[root.nodeId] = (byNode[root.nodeId] ?? 0) + 1;
  }
  return { byNode, unresolvedThreads };
}

/** Splits a body into plain text and `@Name` mentions of known people (longest names first). */
export function splitMentions(body: string, names: string[]): { text: string; mention: boolean }[] {
  const known = [...new Set(names.filter((n) => n.trim()))].sort((a, b) => b.length - a.length);
  const out: { text: string; mention: boolean }[] = [];
  let buf = "";
  let i = 0;
  while (i < body.length) {
    if (body[i] === "@" && (i === 0 || /[\s(\[{"'“]/.test(body[i - 1]))) {
      const rest = body.slice(i + 1);
      const hit = known.find((n) => rest.toLowerCase().startsWith(n.toLowerCase()) && !/[\p{L}\p{N}]/u.test(rest[n.length] ?? ""));
      if (hit) {
        if (buf) out.push({ text: buf, mention: false });
        buf = "";
        out.push({ text: body.slice(i, i + 1 + hit.length), mention: true });
        i += 1 + hit.length;
        continue;
      }
    }
    buf += body[i];
    i++;
  }
  if (buf) out.push({ text: buf, mention: false });
  return out;
}
