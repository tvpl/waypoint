import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getCurrentUser, hashPassword, type SessionUser } from "../auth";
import type { Role } from "../db/schema";
import { newId } from "@/lib/utils";

export const WORKSPACE_COOKIE = "wp_ws";

export class UserError extends Error {}

export async function createUser(input: { email: string; name: string; password: string }) {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const exists = db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).get();
  if (exists) throw new UserError("Já existe uma conta com este e-mail.");
  const userId = newId();
  const passwordHash = await hashPassword(input.password);
  db.transaction((tx) => {
    tx.insert(schema.users).values({ id: userId, email, name: input.name.trim(), passwordHash }).run();
    const wsId = newId();
    tx.insert(schema.workspaces).values({ id: wsId, name: "Pessoal", color: "#2F4FD8", createdBy: userId }).run();
    tx.insert(schema.workspaceMembers).values({ workspaceId: wsId, userId, role: "owner" }).run();
  });
  return userId;
}

export function listWorkspaces(userId: string) {
  return getDb()
    .select({
      id: schema.workspaces.id,
      name: schema.workspaces.name,
      color: schema.workspaces.color,
      icon: schema.workspaces.icon,
      role: schema.workspaceMembers.role,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(eq(schema.workspaceMembers.userId, userId))
    .orderBy(asc(schema.workspaces.createdAt))
    .all();
}

export function workspaceRole(userId: string, workspaceId: string): Role | null {
  const row = getDb()
    .select({ role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.userId, userId), eq(schema.workspaceMembers.workspaceId, workspaceId)))
    .get();
  return row?.role ?? null;
}

export type WorkspaceContext = {
  user: SessionUser;
  workspace: { id: string; name: string; color: string | null; icon: string | null };
  role: Role;
  workspaces: ReturnType<typeof listWorkspaces>;
};

/** Current user + active workspace (cookie, falling back to the first). Cached per request. */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const all = listWorkspaces(user.id);
  if (all.length === 0) return null;
  const jar = await cookies();
  const wanted = jar.get(WORKSPACE_COOKIE)?.value;
  const active = all.find((w) => w.id === wanted) ?? all[0];
  return {
    user,
    workspace: { id: active.id, name: active.name, color: active.color, icon: active.icon },
    role: active.role,
    workspaces: all,
  };
});

export async function requireWorkspace(): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export function canEditWorkspace(role: Role) {
  return role === "owner" || role === "editor";
}

export function createWorkspace(userId: string, name: string) {
  const id = newId();
  getDb().transaction((tx) => {
    tx.insert(schema.workspaces).values({ id, name: name.trim(), createdBy: userId }).run();
    tx.insert(schema.workspaceMembers).values({ workspaceId: id, userId, role: "owner" }).run();
  });
  return id;
}

export function renameWorkspace(workspaceId: string, name: string) {
  getDb().update(schema.workspaces).set({ name: name.trim() }).where(eq(schema.workspaces.id, workspaceId)).run();
}

export function listMembers(workspaceId: string) {
  return getDb()
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.workspaceMembers.role,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(schema.users.name))
    .all();
}

export function findUserByEmail(email: string) {
  return getDb()
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, email.trim().toLowerCase()))
    .get();
}

export function setMember(workspaceId: string, userId: string, role: Role) {
  getDb()
    .insert(schema.workspaceMembers)
    .values({ workspaceId, userId, role })
    .onConflictDoUpdate({
      target: [schema.workspaceMembers.workspaceId, schema.workspaceMembers.userId],
      set: { role },
    })
    .run();
}

export function removeMember(workspaceId: string, userId: string) {
  const owners = listMembers(workspaceId).filter((m) => m.role === "owner");
  if (owners.length === 1 && owners[0].userId === userId) throw new UserError("O workspace precisa de ao menos um owner.");
  getDb()
    .delete(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, userId)))
    .run();
}
