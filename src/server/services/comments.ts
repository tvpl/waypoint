import "server-only";
/**
 * Plan comments: threads on the plan itself or on a node, with replies.
 *
 * Every function takes the acting user (and the share token the page was
 * opened with) and re-checks access through getPlanWithAccess:
 * - read / comment / reply: any signed-in user with viewer access or above
 *   (anonymous visitors get nothing, not even the list)
 * - edit: author only
 * - delete: author, or a plan owner
 * - resolve / reopen: editors and owners, plus the author of the thread
 */
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { newId } from "@/lib/utils";
import { COMMENT_MAX_LENGTH, countComments, type CommentView } from "@/domain/comments";
import { atLeast, planAccess, type Access } from "./permissions";
import { getPlanWithAccess, listPlanMembers, type PlanRow } from "./plans";
import { listMembers, UserError, workspaceRole } from "./workspaces";

export { COMMENT_MAX_LENGTH, type CommentView };

export type CommentActor = { userId: string | null; token?: string | null };

type CommentRow = typeof schema.planComments.$inferSelect;

// ------------------------------------------------------------------ access

/** Access to a plan's comments. Throws a UserError when the actor can't read them. */
export function commentAccess(planId: string, actor: CommentActor): { plan: PlanRow; access: NonNullable<Access>; userId: string } {
  if (!actor.userId) throw new UserError("Entre para ver e escrever comentários.");
  // Comments are internal discussion: only people who belong to the plan
  // (workspace members per its visibility, invited people, the owner) take
  // part. Public visitors and share-link holders get a read-only page.
  const res = getPlanWithAccess(planId, actor.userId, null);
  if (res) {
    const insider =
      res.plan.visibility === "public" || res.plan.visibility === "link"
        ? planAccess(actor.userId, { ...res.plan, visibility: "workspace" })
        : res.access;
    if (!insider) throw new UserError("Você não tem acesso a este plan.");
    res.access = insider;
  }
  // archived plans are only reachable by editors (same rule as the view page)
  if (!res || !res.access || (res.plan.archivedAt && !atLeast(res.access, "editor"))) {
    throw new UserError("Você não tem acesso a este plan.");
  }
  return { plan: res.plan, access: res.access, userId: actor.userId };
}

function getComment(id: string): CommentRow | undefined {
  return getDb().select().from(schema.planComments).where(eq(schema.planComments.id, id)).get();
}

function requireComment(id: string, actor: CommentActor) {
  const c = typeof id === "string" && id.length <= 64 ? getComment(id) : undefined;
  if (!c) throw new UserError("Comentário não encontrado.");
  const a = commentAccess(c.planId, actor);
  return { comment: c, ...a };
}

function cleanBody(body: unknown): string {
  if (typeof body !== "string") throw new UserError("Escreva um comentário.");
  const text = body.replace(/\r\n?/g, "\n").trim();
  if (!text) throw new UserError("Escreva um comentário.");
  if (text.length > COMMENT_MAX_LENGTH) throw new UserError(`O comentário pode ter no máximo ${COMMENT_MAX_LENGTH} caracteres.`);
  return text;
}

function toView(r: CommentRow, authorName: string | null): CommentView {
  return {
    id: r.id,
    planId: r.planId,
    nodeId: r.nodeId,
    layerId: r.layerId ?? null,
    parentId: r.parentId,
    body: r.body,
    resolvedAt: r.resolvedAt ? r.resolvedAt.getTime() : null,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
    author: { id: r.userId, name: authorName ?? "Alguém" },
  };
}

// ------------------------------------------------------------------ queries

/** Every comment of the plan (oldest first) with author names. */
export function listComments(planId: string, actor: CommentActor): CommentView[] {
  commentAccess(planId, actor);
  return getDb()
    .select({ c: schema.planComments, name: schema.users.name })
    .from(schema.planComments)
    .leftJoin(schema.users, eq(schema.users.id, schema.planComments.userId))
    .where(eq(schema.planComments.planId, planId))
    .orderBy(asc(schema.planComments.createdAt), asc(schema.planComments.id))
    .all()
    .map((r) => toView(r.c, r.name));
}

/**
 * Comment counts: per node, the number of comments in unresolved threads,
 * plus the number of unresolved threads overall.
 */
export function commentCounts(planId: string, actor: CommentActor) {
  return countComments(listComments(planId, actor));
}


/**
 * People that can be @mentioned: workspace members and people added to the
 * plan — only for actors who belong there. Someone reading through a public
 * link or share token only sees the names of people who already commented.
 */
export function mentionCandidates(planId: string, actor: CommentActor): { id: string; name: string }[] {
  const { plan, userId } = commentAccess(planId, actor);
  const people = new Map<string, string>();
  const planMembers = listPlanMembers(planId);
  const insider = plan.createdBy === userId || !!workspaceRole(userId, plan.workspaceId) || planMembers.some((m) => m.userId === userId);
  if (insider) {
    for (const m of listMembers(plan.workspaceId)) people.set(m.userId, m.name);
    for (const m of planMembers) people.set(m.userId, m.name);
  }
  for (const c of listComments(planId, actor)) people.set(c.author.id, c.author.name);
  return [...people].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// ------------------------------------------------------------------ mutations

export function createComment(
  planId: string,
  actor: CommentActor,
  input: { body: unknown; nodeId?: string | null; layerId?: string | null; parentId?: string | null },
): CommentView {
  const { userId } = commentAccess(planId, actor);
  const body = cleanBody(input.body);
  let nodeId = input.nodeId ?? null;
  let parentId = input.parentId ?? null;
  if (nodeId !== null && (typeof nodeId !== "string" || !nodeId || nodeId.length > 64)) throw new UserError("Elemento inválido.");
  let layerId = input.layerId ?? null;
  if (layerId !== null && (typeof layerId !== "string" || !layerId || layerId.length > 64)) throw new UserError("Camada inválida.");
  // A thread is about one thing: a node's thread follows the node's layer.
  if (nodeId !== null) layerId = null;
  if (parentId !== null) {
    const parent = typeof parentId === "string" && parentId.length <= 64 ? getComment(parentId) : undefined;
    if (!parent || parent.planId !== planId) throw new UserError("Comentário não encontrado.");
    // one level of replies: answering a reply answers its thread
    const root = parent.parentId ? getComment(parent.parentId) : parent;
    if (!root || root.planId !== planId) throw new UserError("Comentário não encontrado.");
    parentId = root.id;
    nodeId = root.nodeId;
    layerId = root.layerId ?? null;
  }
  const now = new Date();
  const row: CommentRow = { id: newId(), planId, nodeId, layerId, parentId, userId, body, resolvedAt: null, createdAt: now, updatedAt: now };
  const db = getDb();
  db.transaction((tx) => {
    tx.insert(schema.planComments).values(row).run();
    // a new reply reopens a resolved thread
    if (parentId) tx.update(schema.planComments).set({ resolvedAt: null }).where(eq(schema.planComments.id, parentId)).run();
  });
  const name = db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId)).get()?.name ?? null;
  return toView(row, name);
}

export function editComment(commentId: string, actor: CommentActor, body: unknown): CommentView {
  const { comment, userId } = requireComment(commentId, actor);
  if (comment.userId !== userId) throw new UserError("Só quem escreveu pode editar este comentário.");
  const text = cleanBody(body);
  const now = new Date();
  getDb().update(schema.planComments).set({ body: text, updatedAt: now }).where(eq(schema.planComments.id, comment.id)).run();
  const name = getDb().select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId)).get()?.name ?? null;
  return toView({ ...comment, body: text, updatedAt: now }, name);
}

/** Deletes a comment; deleting the first comment of a thread deletes its replies. */
export function deleteComment(commentId: string, actor: CommentActor): { deleted: string[] } {
  const { comment, userId, access } = requireComment(commentId, actor);
  if (comment.userId !== userId && !atLeast(access, "owner")) throw new UserError("Você não pode excluir este comentário.");
  const db = getDb();
  const replies = comment.parentId
    ? []
    : db.select({ id: schema.planComments.id }).from(schema.planComments).where(eq(schema.planComments.parentId, comment.id)).all().map((r) => r.id);
  const ids = [comment.id, ...replies];
  db.delete(schema.planComments).where(inArray(schema.planComments.id, ids)).run();
  return { deleted: ids };
}

/** Resolves or reopens the thread a comment belongs to. */
export function setCommentResolved(commentId: string, actor: CommentActor, resolved: boolean): { id: string; resolvedAt: number | null } {
  const { comment, userId, access } = requireComment(commentId, actor);
  const root = comment.parentId ? getComment(comment.parentId) : comment;
  if (!root) throw new UserError("Comentário não encontrado.");
  if (!atLeast(access, "editor") && root.userId !== userId) throw new UserError("Só editores e quem abriu a conversa podem resolvê-la.");
  const at = resolved ? new Date() : null;
  getDb().update(schema.planComments).set({ resolvedAt: at }).where(eq(schema.planComments.id, root.id)).run();
  return { id: root.id, resolvedAt: at ? at.getTime() : null };
}
