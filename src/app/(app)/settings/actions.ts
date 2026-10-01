"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth";
import { ROLES } from "@/server/db/schema";
import {
  findUserByEmail,
  removeMember,
  renameWorkspace,
  requireWorkspace,
  setMember,
  UserError,
} from "@/server/services/workspaces";

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function run(fn: () => Promise<Result> | Result): Promise<Result> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos." };
    throw e;
  }
}

export async function updateProfileAction(name: string): Promise<Result> {
  return run(async () => {
    const ctx = await requireWorkspace();
    const clean = z.string().trim().min(1, "Informe seu nome.").max(80).parse(name);
    getDb().update(schema.users).set({ name: clean }).where(eq(schema.users.id, ctx.user.id)).run();
    revalidatePath("/", "layout");
    return { ok: true, message: "Perfil atualizado." };
  });
}

export async function changePasswordAction(current: string, next: string): Promise<Result> {
  return run(async () => {
    const ctx = await requireWorkspace();
    z.string().min(8, "A nova senha precisa ter ao menos 8 caracteres.").max(200).parse(next);
    const row = getDb().select().from(schema.users).where(eq(schema.users.id, ctx.user.id)).get();
    if (!row || !(await verifyPassword(current, row.passwordHash))) return { ok: false, error: "Senha atual incorreta." };
    getDb().update(schema.users).set({ passwordHash: await hashPassword(next) }).where(eq(schema.users.id, ctx.user.id)).run();
    return { ok: true, message: "Senha alterada." };
  });
}

async function requireOwner() {
  const ctx = await requireWorkspace();
  if (ctx.role !== "owner") throw new UserError("Apenas owners podem gerenciar o workspace.");
  return ctx;
}

export async function renameWorkspaceAction(name: string): Promise<Result> {
  return run(async () => {
    const ctx = await requireOwner();
    renameWorkspace(ctx.workspace.id, z.string().trim().min(1, "Informe um nome.").max(80).parse(name));
    revalidatePath("/", "layout");
    return { ok: true, message: "Workspace renomeado." };
  });
}

export async function addMemberAction(email: string, role: string): Promise<Result> {
  return run(async () => {
    const ctx = await requireOwner();
    const r = z.enum(ROLES).parse(role);
    const user = findUserByEmail(z.string().trim().email("E-mail inválido.").parse(email));
    if (!user) return { ok: false, error: "Nenhuma conta com este e-mail. Peça para a pessoa criar uma conta primeiro." };
    setMember(ctx.workspace.id, user.id, r);
    revalidatePath("/settings");
    return { ok: true, message: `${user.name} adicionado como ${r}.` };
  });
}

export async function setMemberRoleAction(userId: string, role: string): Promise<Result> {
  return run(async () => {
    const ctx = await requireOwner();
    const r = z.enum(ROLES).parse(role);
    if (userId === ctx.user.id && r !== "owner") {
      const owners = getDb()
        .select()
        .from(schema.workspaceMembers)
        .where(eq(schema.workspaceMembers.workspaceId, ctx.workspace.id))
        .all()
        .filter((m) => m.role === "owner");
      if (owners.length <= 1) return { ok: false, error: "O workspace precisa de ao menos um owner." };
    }
    setMember(ctx.workspace.id, userId, r);
    revalidatePath("/settings");
    return { ok: true };
  });
}

export async function removeMemberAction(userId: string): Promise<Result> {
  return run(async () => {
    const ctx = await requireOwner();
    removeMember(ctx.workspace.id, userId);
    revalidatePath("/settings");
    return { ok: true };
  });
}
