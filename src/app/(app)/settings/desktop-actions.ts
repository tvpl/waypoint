"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/server/db";
import { destroySession, hashPassword, requireUser, verifyPassword } from "@/server/auth";
import { isDesktop } from "@/server/desktop";
import { AUTO_LOCK_OPTIONS, desktopSecurity, saveDesktopSecurity, type DesktopSecurity } from "@/server/desktop-security";
import { rateLimit } from "@/server/lib/rate-limit";

type Result = { ok: true; message?: string; security?: DesktopSecurity } | { ok: false; error: string };

const password = z.string().min(6, "Use ao menos 6 caracteres.").max(200, "Senha muito longa.");

/** Desktop app only, signed in; the person is the only account of the local database. */
async function desktopUser() {
  if (!isDesktop()) throw new Error("Disponível apenas no aplicativo de desktop.");
  return requireUser();
}

async function checkPassword(userId: string, given: string): Promise<boolean> {
  if (!rateLimit(`desktop-lock:${userId}`, 8, 60_000).ok) return false;
  const row = getDb().select({ hash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, userId)).get();
  return !!row && (await verifyPassword(given, row.hash));
}

function done(security: DesktopSecurity, message: string): Result {
  revalidatePath("/", "layout");
  return { ok: true, message, security };
}

/** Turns the app lock on with a new password (the local account had none anyone knew). */
export async function enableLockAction(pw: string, confirm: string): Promise<Result> {
  const user = await desktopUser();
  if (desktopSecurity().lock) return { ok: false, error: "O bloqueio já está ativo." };
  const parsed = password.safeParse(pw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  if (pw !== confirm) return { ok: false, error: "As senhas não conferem." };
  getDb().update(schema.users).set({ passwordHash: await hashPassword(pw) }).where(eq(schema.users.id, user.id)).run();
  return done(saveDesktopSecurity({ lock: true }), "Bloqueio ativado. A senha será pedida ao abrir o Waypoint.");
}

export async function changeLockPasswordAction(current: string, pw: string, confirm: string): Promise<Result> {
  const user = await desktopUser();
  if (!desktopSecurity().lock) return { ok: false, error: "Ative o bloqueio primeiro." };
  if (!(await checkPassword(user.id, current))) return { ok: false, error: "Senha atual incorreta." };
  const parsed = password.safeParse(pw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  if (pw !== confirm) return { ok: false, error: "As senhas não conferem." };
  getDb().update(schema.users).set({ passwordHash: await hashPassword(pw) }).where(eq(schema.users.id, user.id)).run();
  return done(desktopSecurity(), "Senha alterada.");
}

export async function disableLockAction(current: string): Promise<Result> {
  const user = await desktopUser();
  if (!desktopSecurity().lock) return done(desktopSecurity(), "O bloqueio já estava desativado.");
  if (!(await checkPassword(user.id, current))) return { ok: false, error: "Senha incorreta." };
  return done(saveDesktopSecurity({ lock: false }), "Bloqueio desativado.");
}

export async function updateLockPrefsAction(input: { autoLockMinutes?: number; lockOnSleep?: boolean }): Promise<Result> {
  await desktopUser();
  const prefs = z
    .object({
      autoLockMinutes: z
        .number()
        .refine((n) => (AUTO_LOCK_OPTIONS as readonly number[]).includes(n))
        .optional(),
      lockOnSleep: z.boolean().optional(),
    })
    .parse(input);
  return done(saveDesktopSecurity(prefs), "Preferência salva.");
}

/** Ends this window's session; the page then goes to the lock screen. */
export async function lockNowAction(): Promise<Result> {
  await desktopUser();
  if (!desktopSecurity().lock) return { ok: false, error: "Ative o bloqueio em Configurações → Segurança para usar esta opção." };
  await destroySession();
  return { ok: true };
}
