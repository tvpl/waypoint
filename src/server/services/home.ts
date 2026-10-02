import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import { planAccess } from "./permissions";
import { listPlans, type Thumb } from "./plans";

export type HomePlan = { id: string; title: string; published: boolean; updatedAt: Date; thumbnail: Thumb };

/** Recently opened plans, padded with recently updated ones. */
export function recentPlans(userId: string, workspaceId: string, limit = 3): HomePlan[] {
  const all = listPlans(userId, workspaceId, "all").filter((p) => !p.isTemplate);
  const byId = new Map(all.map((p) => [p.id, p]));
  const opened = getDb()
    .select({ id: schema.recents.entityId })
    .from(schema.recents)
    .where(and(eq(schema.recents.userId, userId), eq(schema.recents.entityType, "plan")))
    .orderBy(desc(schema.recents.openedAt))
    .limit(20)
    .all()
    .map((r) => byId.get(r.id))
    .filter((p): p is (typeof all)[number] => !!p);
  const seen = new Set(opened.map((p) => p.id));
  const rest = all.filter((p) => !seen.has(p.id));
  return [...opened, ...rest].slice(0, limit).map((p) => ({
    id: p.id,
    title: p.title,
    published: p.publishedVersionId != null,
    updatedAt: p.updatedAt,
    thumbnail: p.thumbnail,
  }));
}

export function pinnedPlans(userId: string, workspaceId: string) {
  const ids = getDb()
    .select({ id: schema.userMarks.entityId })
    .from(schema.userMarks)
    .where(and(eq(schema.userMarks.userId, userId), eq(schema.userMarks.entityType, "plan"), eq(schema.userMarks.mark, "pin")))
    .all()
    .map((r) => r.id);
  if (ids.length === 0) return [];
  return getDb()
    .select()
    .from(schema.plans)
    .where(and(inArray(schema.plans.id, ids), eq(schema.plans.workspaceId, workspaceId), isNull(schema.plans.archivedAt)))
    .all()
    .filter((p) => planAccess(userId, p));
}
