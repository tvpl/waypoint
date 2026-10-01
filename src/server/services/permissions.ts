import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Role, Visibility } from "../db/schema";
import { workspaceRole } from "./workspaces";

export type Access = Role | null;

const rank: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };
export const atLeast = (access: Access, role: Role) => access != null && rank[access] >= rank[role];
const max = (a: Access, b: Access): Access => (a == null ? b : b == null ? a : rank[a] >= rank[b] ? a : b);

export function shareTokenFor(resourceType: "plan" | "collection", resourceId: string) {
  return (
    getDb()
      .select({ token: schema.shareLinks.token })
      .from(schema.shareLinks)
      .where(and(eq(schema.shareLinks.resourceType, resourceType), eq(schema.shareLinks.resourceId, resourceId)))
      .get()?.token ?? null
  );
}

type Shareable = { id: string; workspaceId: string; visibility: Visibility; createdBy: string | null };

/**
 * Effective access to a plan.
 * - private:   creator + explicitly added people
 * - workspace: workspace role (+ explicit people)
 * - specific:  creator + explicitly added people (+ workspace owners)
 * - link:      as workspace, plus read-only for anyone holding the share token
 * - public:    as workspace, plus read-only for everyone
 */
export function planAccess(userId: string | null, plan: Shareable, shareToken?: string | null): Access {
  let access: Access = null;
  if (userId) {
    if (plan.createdBy === userId) access = "owner";
    const member = getDb()
      .select({ role: schema.planMembers.role })
      .from(schema.planMembers)
      .where(and(eq(schema.planMembers.planId, plan.id), eq(schema.planMembers.userId, userId)))
      .get();
    access = max(access, member?.role ?? null);
    const ws = workspaceRole(userId, plan.workspaceId);
    if (ws === "owner" && plan.visibility !== "private") access = max(access, "owner");
    if (ws && (plan.visibility === "workspace" || plan.visibility === "link" || plan.visibility === "public")) {
      access = max(access, ws);
    }
  }
  if (plan.visibility === "public") access = max(access, "viewer");
  if (plan.visibility === "link" && shareToken && shareToken === shareTokenFor("plan", plan.id)) {
    access = max(access, "viewer");
  }
  return access;
}

/** Collections are workspace-scoped; share links give read-only access to a subtree. */
export function collectionAccess(userId: string | null, col: Shareable, shareToken?: string | null): Access {
  let access: Access = null;
  if (userId) {
    const ws = workspaceRole(userId, col.workspaceId);
    if (col.visibility === "private") access = col.createdBy === userId ? "owner" : null;
    else access = ws;
  }
  if (col.visibility === "public") access = max(access, "viewer");
  if ((col.visibility === "link" || col.visibility === "public") && shareToken && shareToken === shareTokenFor("collection", col.id)) {
    access = max(access, "viewer");
  }
  return access;
}
