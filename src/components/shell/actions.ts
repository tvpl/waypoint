"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession } from "@/server/auth";
import { createWorkspace, requireWorkspace, WORKSPACE_COOKIE } from "@/server/services/workspaces";

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function switchWorkspaceAction(workspaceId: string) {
  const ctx = await requireWorkspace();
  if (!ctx.workspaces.some((w) => w.id === workspaceId)) return;
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function createWorkspaceAction(name: string) {
  const ctx = await requireWorkspace();
  const clean = name.trim().slice(0, 80);
  if (!clean) return;
  const id = createWorkspace(ctx.user.id, clean);
  await switchWorkspaceAction(id);
}
