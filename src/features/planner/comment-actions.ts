"use server";
/**
 * Comment server actions. Each one resolves the current user and re-checks
 * access to the plan through the comments service (getPlanWithAccess) — the
 * panel being hidden for anonymous visitors is never the only guard.
 *
 * Mutations return the fresh comment list so the client revalidates its
 * state in the same round-trip; the panel also polls `loadCommentsAction`.
 */
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import type { Role } from "@/server/db/schema";
import {
  commentAccess,
  createComment,
  deleteComment,
  editComment,
  listComments,
  mentionCandidates,
  setCommentResolved,
  type CommentActor,
} from "@/server/services/comments";
import { UserError } from "@/server/services/workspaces";
import type { CommentView } from "@/domain/comments";

export type CommentsResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type CommentsSnapshot = {
  comments: CommentView[];
  me: { id: string; name: string };
  /** Effective access to the plan (decides resolve/delete affordances; the server re-checks). */
  role: Role;
  people: { id: string; name: string }[];
};

const idSchema = z.string().min(1).max(64);
const tokenSchema = z.string().max(128).nullish();

async function actor(token: unknown): Promise<CommentActor & { name: string }> {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Entre para ver e escrever comentários.");
  return { userId: user.id, token: tokenSchema.parse(token) ?? null, name: user.name };
}

async function run<T extends object>(fn: () => Promise<T> | T): Promise<CommentsResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Dados inválidos." };
    console.error(e);
    return { ok: false, error: "Algo deu errado. Tente novamente." };
  }
}

function snapshot(planId: string, a: CommentActor & { name: string }): CommentsSnapshot {
  const { access } = commentAccess(planId, a);
  return {
    comments: listComments(planId, a),
    me: { id: a.userId!, name: a.name },
    role: access,
    people: mentionCandidates(planId, a),
  };
}

export async function loadCommentsAction(planId: string, token?: string | null) {
  return run(async () => {
    const a = await actor(token);
    return { snapshot: snapshot(idSchema.parse(planId), a) };
  });
}

const createSchema = z.object({
  body: z.string().max(20000),
  nodeId: idSchema.nullish(),
  layerId: idSchema.nullish(),
  parentId: idSchema.nullish(),
});

export async function createCommentAction(planId: string, token: string | null | undefined, input: z.infer<typeof createSchema>) {
  return run(async () => {
    const a = await actor(token);
    const pid = idSchema.parse(planId);
    const data = createSchema.parse(input);
    const comment = createComment(pid, a, { body: data.body, nodeId: data.nodeId ?? null, layerId: data.layerId ?? null, parentId: data.parentId ?? null });
    return { comment, snapshot: snapshot(pid, a) };
  });
}

export async function editCommentAction(planId: string, token: string | null | undefined, commentId: string, body: string) {
  return run(async () => {
    const a = await actor(token);
    editComment(idSchema.parse(commentId), a, z.string().max(20000).parse(body));
    return { snapshot: snapshot(idSchema.parse(planId), a) };
  });
}

export async function deleteCommentAction(planId: string, token: string | null | undefined, commentId: string) {
  return run(async () => {
    const a = await actor(token);
    deleteComment(idSchema.parse(commentId), a);
    return { snapshot: snapshot(idSchema.parse(planId), a) };
  });
}

export async function resolveCommentAction(planId: string, token: string | null | undefined, commentId: string, resolved: boolean) {
  return run(async () => {
    const a = await actor(token);
    setCommentResolved(idSchema.parse(commentId), a, z.boolean().parse(resolved));
    return { snapshot: snapshot(idSchema.parse(planId), a) };
  });
}
