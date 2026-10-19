import "server-only";
import path from "node:path";
import { cookies } from "next/headers";
import { databaseFile, databaseStatus, getClient, updateDatabase } from "../db";
import { saveCopyBeforeUpdate } from "../db/migrations";
import { hashToken, SESSION_COOKIE, verifyPassword } from "../auth";
import { hasDesktopKey, isDesktop } from "../desktop";
import { rateLimit } from "../lib/rate-limit";
import { UserError } from "./workspaces";

/**
 * The database update dialog (components/shell/database-update.tsx, shown by the root layout
 * while src/server/db reports pending migrations or data upgrades). Everything here reads the
 * database with plain SQL on purpose: the schema the rest of the code expects may not exist yet.
 */

export type PendingUpdate = {
  /** Data version: before → after. */
  version: number;
  target: number;
  /** Data upgrades' descriptions; schema changes are only counted. */
  changes: string[];
  schemaChanges: number;
  /** Web: whether the dialog has to ask for an account's e-mail and password. */
  needsSignIn: boolean;
};

async function signedInUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const id = getClient().prepare("select user_id from sessions where id = ? and expires_at > ?").pluck().get(hashToken(token), Date.now());
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

/** What the dialog shows, or null when the database is up to date. */
export async function pendingUpdate(): Promise<PendingUpdate | null> {
  const status = databaseStatus();
  if (status.state !== "pending") return null;
  return {
    version: status.version,
    target: status.target,
    changes: status.pending.flatMap((s) => (s.description ? [s.description] : [])),
    schemaChanges: status.pending.filter((s) => s.kind === "schema").length,
    needsSignIn: !isDesktop() && !(await signedInUserId()),
  };
}

/**
 * Who may back up and update: the desktop window (its per-launch key), or on a server anyone with
 * an account — signed in, or confirming their e-mail and password in the dialog.
 */
async function requireUpdater(req: Request, credentials: { email?: string; password?: string }) {
  if (isDesktop()) {
    if (!hasDesktopKey(req)) throw new UserError("Você não tem permissão para esta ação.");
    return;
  }
  if (await signedInUserId()) return;
  const email = credentials.email?.trim().toLowerCase();
  if (!email || !credentials.password) throw new UserError("Entre com o e-mail e a senha de uma conta deste Waypoint para atualizar.");
  if (!rateLimit("database-update", 10, 60_000).ok) throw new UserError("Muitas tentativas. Aguarde um minuto.");
  const hash = getClient().prepare("select password_hash from users where email = ?").pluck().get(email);
  if (typeof hash !== "string" || !(await verifyPassword(credentials.password, hash))) throw new UserError("E-mail ou senha incorretos.");
}

/** A full copy of the database file before the update; returns its file name (the folder stays on the server). */
export async function backupBeforeUpdate(req: Request, credentials: { email?: string; password?: string }): Promise<string> {
  await requireUpdater(req, credentials);
  const status = databaseStatus();
  if (status.state !== "pending") throw new UserError("Os dados já estão atualizados.");
  if (databaseFile() === ":memory:") throw new UserError("Este banco fica só na memória e não tem como ser copiado.");
  return path.basename(saveCopyBeforeUpdate(getClient(), databaseFile(), status));
}

export async function applyUpdate(req: Request, credentials: { email?: string; password?: string }) {
  await requireUpdater(req, credentials);
  if (databaseStatus().state !== "pending") return;
  try {
    updateDatabase();
  } catch (e) {
    console.error("[db] update failed", e);
    throw new UserError(`A atualização não foi concluída e nada foi alterado. Detalhe: ${e instanceof Error ? e.message : String(e)}`);
  }
}
