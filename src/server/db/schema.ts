import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const ROLES = ["owner", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const VISIBILITIES = ["private", "workspace", "specific", "link", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

// ---------------------------------------------------------------- platform

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    // sha256 of the token stored in the cookie; the raw token never hits the DB
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const workspaces = sqliteTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull().default("viewer"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

// ---------------------------------------------------------------- planner

export const plans = sqliteTable(
  "plans",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    icon: text("icon"),
    visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("workspace"),
    isTemplate: integer("is_template", { mode: "boolean" }).notNull().default(false),
    publishedVersionId: text("published_version_id").references((): AnySQLiteColumn => planVersions.id, {
      onDelete: "set null",
    }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("plans_ws_idx").on(t.workspaceId, t.updatedAt), uniqueIndex("plans_ws_slug").on(t.workspaceId, t.slug)],
);

/** The editable draft. One row per plan; JSON document with optimistic concurrency. */
export const planDocuments = sqliteTable("plan_documents", {
  planId: text("plan_id")
    .primaryKey()
    .references(() => plans.id, { onDelete: "cascade" }),
  schemaVersion: integer("schema_version").notNull().default(1),
  version: integer("version").notNull().default(1),
  nodesJson: text("nodes_json").notNull().default("[]"),
  edgesJson: text("edges_json").notNull().default("[]"),
  viewportJson: text("viewport_json").notNull().default('{"x":0,"y":0,"zoom":1}'),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

/** Immutable snapshots created on publish. */
export const planVersions = sqliteTable(
  "plan_versions",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references((): AnySQLiteColumn => plans.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    snapshotJson: text("snapshot_json").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("plan_versions_plan_version").on(t.planId, t.version)],
);

export const planMembers = sqliteTable(
  "plan_members",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull().default("viewer"),
  },
  (t) => [primaryKey({ columns: [t.planId, t.userId] })],
);

// ---------------------------------------------------------------- links

export const collections = sqliteTable(
  "collections",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnySQLiteColumn => collections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    color: text("color"),
    sortOrder: integer("sort_order").notNull().default(0),
    defaultView: text("default_view", { enum: ["cards", "compact", "list"] }).notNull().default("cards"),
    visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("workspace"),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("collections_parent_idx").on(t.workspaceId, t.parentId, t.sortOrder)],
);

export const OPEN_BEHAVIORS = ["new_tab", "preview", "ask"] as const;
export type OpenBehavior = (typeof OPEN_BEHAVIORS)[number];
export const SUMMARY_BEHAVIORS = ["always", "hover", "hidden"] as const;
export type SummaryBehavior = (typeof SUMMARY_BEHAVIORS)[number];

export const favorites = sqliteTable(
  "favorites",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    collectionId: text("collection_id").references(() => collections.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    description: text("description"),
    keywords: text("keywords"),
    favicon: text("favicon"),
    coverImage: text("cover_image"),
    icon: text("icon"),
    openBehavior: text("open_behavior", { enum: OPEN_BEHAVIORS }).notNull().default("new_tab"),
    summaryBehavior: text("summary_behavior", { enum: SUMMARY_BEHAVIORS }).notNull().default("always"),
    sortOrder: integer("sort_order").notNull().default(0),
    openCount: integer("open_count").notNull().default(0),
    lastOpenedAt: integer("last_opened_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("favorites_collection_idx").on(t.workspaceId, t.collectionId, t.sortOrder),
    index("favorites_recent_idx").on(t.workspaceId, t.updatedAt),
  ],
);

/** Cache of fetched URL metadata (title, og:image, favicon…). */
export const linkMetadata = sqliteTable("link_metadata", {
  url: text("url").primaryKey(),
  title: text("title"),
  description: text("description"),
  image: text("image"),
  favicon: text("favicon"),
  siteName: text("site_name"),
  embeddable: integer("embeddable", { mode: "boolean" }),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});

// ---------------------------------------------------------------- tags

export const tags = sqliteTable(
  "tags",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_ws_name").on(t.workspaceId, t.name)],
);

export const favoriteTags = sqliteTable(
  "favorite_tags",
  {
    favoriteId: text("favorite_id")
      .notNull()
      .references(() => favorites.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.favoriteId, t.tagId] }), index("favorite_tags_tag_idx").on(t.tagId)],
);

export const planTags = sqliteTable(
  "plan_tags",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.planId, t.tagId] }), index("plan_tags_tag_idx").on(t.tagId)],
);

// ---------------------------------------------------------------- cross-cutting

export const RESOURCE_TYPES = ["url", "plan", "favorite", "collection", "file", "page"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/**
 * Index of resource references held inside plan documents (node.data.resource).
 * Rebuilt on every draft save; powers "Usado em" backlinks and keeps the door
 * open for a knowledge graph later.
 */
export const resourceRefs = sqliteTable(
  "resource_refs",
  {
    sourcePlanId: text("source_plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    sourceNodeId: text("source_node_id").notNull(),
    sourceNodeTitle: text("source_node_title"),
    targetType: text("target_type", { enum: RESOURCE_TYPES }).notNull(),
    targetId: text("target_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sourcePlanId, t.sourceNodeId] }),
    index("resource_refs_target_idx").on(t.targetType, t.targetId),
  ],
);

export const assets = sqliteTable("assets", {
  id: id(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const shareLinks = sqliteTable(
  "share_links",
  {
    token: text("token").primaryKey(),
    resourceType: text("resource_type", { enum: ["plan", "collection"] }).notNull(),
    resourceId: text("resource_id").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("share_links_resource").on(t.resourceType, t.resourceId)],
);

/** Per-user marks: pinned (home) and starred (favorites filter). */
export const userMarks = sqliteTable(
  "user_marks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type", { enum: ["plan", "collection", "favorite"] }).notNull(),
    entityId: text("entity_id").notNull(),
    mark: text("mark", { enum: ["pin", "star"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entityType, t.entityId, t.mark] })],
);

/** Recently opened plans / links per user. */
export const recents = sqliteTable(
  "recents",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type", { enum: ["plan", "collection", "favorite"] }).notNull(),
    entityId: text("entity_id").notNull(),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entityType, t.entityId] }), index("recents_user_idx").on(t.userId, t.openedAt)],
);
