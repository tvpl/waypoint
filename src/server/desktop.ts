import "server-only";
import crypto from "node:crypto";
import os from "node:os";
import { asc } from "drizzle-orm";
import { getDb, schema } from "./db";
import { createUser } from "./services/workspaces";
import { DESKTOP_COOKIE, sameSecret } from "@/lib/desktop-gate";

/**
 * Desktop mode: the Electron shell (desktop/) runs this server on 127.0.0.1 for a single
 * local person and passes a per-launch secret. Only its window holds the matching cookie,
 * so other programs or browser tabs on the machine can't use the server.
 */
export function isDesktop(): boolean {
  return !!process.env.WAYPOINT_DESKTOP_SECRET;
}

/** True when the request carries the desktop window's gate cookie (or header, for the shell itself). */
export function hasDesktopKey(req: Request): boolean {
  const secret = process.env.WAYPOINT_DESKTOP_SECRET;
  if (!secret) return false;
  const fromHeader = req.headers.get("x-waypoint-desktop");
  const fromCookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === DESKTOP_COOKIE)?.[1];
  return sameSecret(fromHeader ?? fromCookie, secret);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** In-flight creation, shared by windows that sign in at the same time on first launch. */
let creating: Promise<string> | null = null;

/**
 * The person using the desktop app. Reuses the oldest account when the database already has one
 * (a copied or seeded database); otherwise creates one named after the OS user, with a random
 * password nobody needs.
 */
export async function ensureDesktopUser(): Promise<string> {
  const existing = getDb().select({ id: schema.users.id }).from(schema.users).orderBy(asc(schema.users.createdAt)).limit(1).get();
  if (existing) return existing.id;
  let name = "Você";
  try {
    name = capitalize(os.userInfo().username) || name;
  } catch {}
  creating ??= createUser({ email: "voce@waypoint.local", name, password: crypto.randomBytes(24).toString("base64url") }).finally(() => (creating = null));
  return creating;
}
