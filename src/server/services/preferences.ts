import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { UserError, workspaceRole } from "./workspaces";

type Actor = { workspaceId: string; userId: string };

/** Keys a client may write; values are validated by their owners when read back. */
export const PREFERENCE_KEYS = ["tasks.board"] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number] | "home.layout" | "notifications.seenAt";
const MAX_BYTES = 200_000;

const where = (actor: Actor, key: string) =>
  and(eq(schema.userPreferences.userId, actor.userId), eq(schema.userPreferences.workspaceId, actor.workspaceId), eq(schema.userPreferences.key, key));

/** The stored JSON value, or null. */
export function getPreference(actor: Actor, key: PreferenceKey): unknown {
  const row = getDb().select().from(schema.userPreferences).where(where(actor, key)).get();
  if (!row) return null;
  try {
    return JSON.parse(row.valueJson);
  } catch {
    return null;
  }
}

/** Personal, per workspace: any member (viewers too) keeps their own. */
export function setPreference(actor: Actor, key: PreferenceKey, value: unknown) {
  if (!workspaceRole(actor.userId, actor.workspaceId)) throw new UserError("Você não tem permissão para esta ação.");
  const json = JSON.stringify(z.record(z.string(), z.unknown()).or(z.array(z.unknown())).or(z.number()).parse(value));
  if (json.length > MAX_BYTES) throw new UserError("Preferências grandes demais.");
  const now = new Date();
  getDb()
    .insert(schema.userPreferences)
    .values({ userId: actor.userId, workspaceId: actor.workspaceId, key, valueJson: json, updatedAt: now })
    .onConflictDoUpdate({
      target: [schema.userPreferences.userId, schema.userPreferences.workspaceId, schema.userPreferences.key],
      set: { valueJson: json, updatedAt: now },
    })
    .run();
}
