import "server-only";
import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { getDb, schema } from "../db";
import type { Role } from "../db/schema";
import { newId } from "@/lib/utils";
import { UserError, workspaceRole } from "./workspaces";

/**
 * Personal access tokens: `wp_` + 40 random [0-9A-Za-z] chars (~238 bits).
 * Only sha256(token) is stored; the raw token is shown to the user once.
 * A token acts as its creator, inside the workspace it was created in, with the
 * creator's *current* role there (re-checked on every request).
 */
export const TOKEN_PREFIX = "wp_";
const TOKEN_RE = /^wp_[0-9A-Za-z]{40}$/;
const MAX_TOKENS_PER_USER = 25;
/** lastUsedAt is written at most this often per token. */
const TOUCH_EVERY_MS = 60_000;

const randomPart = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 40);

export const hashApiToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function isTokenShape(token: string) {
  return TOKEN_RE.test(token);
}

export type ApiTokenView = {
  id: string;
  name: string;
  /** e.g. "wp_ab12" — shown as "wp_ab12…" */
  prefix: string;
  workspaceId: string;
  workspaceName: string;
  createdAt: number;
  lastUsedAt: number | null;
};

export function createApiToken(userId: string, workspaceId: string, name: string): { token: string; view: ApiTokenView } {
  if (!workspaceRole(userId, workspaceId)) throw new UserError("Você não faz parte deste workspace.");
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new UserError("Dê um nome ao token.");
  const db = getDb();
  const count = db.select({ id: schema.apiTokens.id }).from(schema.apiTokens).where(eq(schema.apiTokens.userId, userId)).all().length;
  if (count >= MAX_TOKENS_PER_USER) throw new UserError(`Limite de ${MAX_TOKENS_PER_USER} tokens atingido. Revogue algum antes de criar outro.`);
  const token = TOKEN_PREFIX + randomPart();
  const id = newId();
  const prefix = token.slice(0, 7);
  db.insert(schema.apiTokens).values({ id, userId, workspaceId, name: clean, tokenHash: hashApiToken(token), prefix }).run();
  const view = listApiTokens(userId).find((t) => t.id === id)!;
  return { token, view };
}

export function listApiTokens(userId: string): ApiTokenView[] {
  return getDb()
    .select({
      id: schema.apiTokens.id,
      name: schema.apiTokens.name,
      prefix: schema.apiTokens.prefix,
      workspaceId: schema.apiTokens.workspaceId,
      workspaceName: schema.workspaces.name,
      createdAt: schema.apiTokens.createdAt,
      lastUsedAt: schema.apiTokens.lastUsedAt,
    })
    .from(schema.apiTokens)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.apiTokens.workspaceId))
    .where(eq(schema.apiTokens.userId, userId))
    .orderBy(desc(schema.apiTokens.createdAt))
    .all()
    .map((r) => ({ ...r, createdAt: r.createdAt.getTime(), lastUsedAt: r.lastUsedAt ? r.lastUsedAt.getTime() : null }));
}

/** Deletes one of the user's tokens. Returns false when it doesn't exist (or isn't theirs). */
export function revokeApiToken(userId: string, tokenId: string): boolean {
  const res = getDb()
    .delete(schema.apiTokens)
    .where(and(eq(schema.apiTokens.id, tokenId), eq(schema.apiTokens.userId, userId)))
    .run();
  return res.changes > 0;
}

export type ApiPrincipal = {
  tokenId: string;
  user: { id: string; name: string; email: string };
  workspaceId: string;
  workspaceName: string;
  role: Role;
};

/** Reads `Authorization: Bearer wp_…` and resolves the token, or null. */
export function authenticateBearer(request: Request): ApiPrincipal | null {
  const header = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!m || !isTokenShape(m[1])) return null;
  return authenticateToken(m[1]);
}

export function authenticateToken(token: string): ApiPrincipal | null {
  if (!isTokenShape(token)) return null;
  // Lookup is by the hash (unique index), so timing depends on the hash, never on how
  // many leading characters of a guess match a real token.
  const hash = hashApiToken(token);
  const db = getDb();
  const row = db
    .select({
      id: schema.apiTokens.id,
      tokenHash: schema.apiTokens.tokenHash,
      lastUsedAt: schema.apiTokens.lastUsedAt,
      workspaceId: schema.apiTokens.workspaceId,
      workspaceName: schema.workspaces.name,
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.apiTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.apiTokens.userId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.apiTokens.workspaceId))
    .where(eq(schema.apiTokens.tokenHash, hash))
    .get();
  if (!row || !crypto.timingSafeEqual(Buffer.from(row.tokenHash, "hex"), Buffer.from(hash, "hex"))) return null;
  // membership & role are re-checked on every request (removed members lose access immediately)
  const role = workspaceRole(row.userId, row.workspaceId);
  if (!role) return null;
  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    db.update(schema.apiTokens).set({ lastUsedAt: new Date(now) }).where(eq(schema.apiTokens.id, row.id)).run();
  }
  return {
    tokenId: row.id,
    user: { id: row.userId, name: row.name, email: row.email },
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    role,
  };
}
