"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createSession, verifyPassword } from "@/server/auth";
import { getDb, schema } from "@/server/db";
import { createUser, UserError } from "@/server/services/workspaces";
import { ensureDesktopUser, isDesktop } from "@/server/desktop";
import { desktopSecurity } from "@/server/desktop-security";
import { rateLimit } from "@/server/lib/rate-limit";

export type AuthState = { error?: string } | undefined;

const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
};

export async function loginAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = getDb().select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (!user || !(await verifyPassword(password, user.passwordHash))) return { error: "E-mail ou senha incorretos." };
  await createSession(user.id);
  redirect(safeNext(form.get("next")));
}

const signupSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome.").max(80),
  email: z.string().trim().email("E-mail inválido."),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres.").max(200),
});

export async function signupAction(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse({ name: form.get("name"), email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    const id = await createUser(parsed.data);
    await createSession(id);
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
  redirect("/");
}

/**
 * Desktop app lock screen: the local person unlocks with their password. Five tries a minute;
 * a wrong password never says more than that.
 */
export async function unlockAction(_: AuthState, form: FormData): Promise<AuthState> {
  if (!isDesktop() || !desktopSecurity().lock) redirect("/");
  const limit = rateLimit("desktop-unlock", 5, 60_000);
  if (!limit.ok) return { error: `Muitas tentativas. Tente de novo em ${limit.retryAfter} s.` };
  const userId = await ensureDesktopUser();
  const user = getDb().select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user || !(await verifyPassword(String(form.get("password") ?? ""), user.passwordHash))) return { error: "Senha incorreta." };
  await createSession(user.id);
  const next = safeNext(form.get("next"));
  redirect(next.startsWith("/login") ? "/" : next);
}
