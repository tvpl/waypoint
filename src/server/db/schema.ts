import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  blob,
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
  /** Layers and saved views ({ layers?, views? }); null when the plan has none (src/domain/layers.ts). */
  layersJson: text("layers_json"),
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

export const LINK_HEALTH = ["unknown", "ok", "redirect", "broken", "unreachable"] as const;
export type LinkHealth = (typeof LINK_HEALTH)[number];

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
    /** Link health check (see services/link-health.ts). */
    healthStatus: text("health_status", { enum: LINK_HEALTH }).notNull().default("unknown"),
    healthCode: integer("health_code"),
    healthCheckedAt: integer("health_checked_at", { mode: "timestamp_ms" }),
    healthFinalUrl: text("health_final_url"),
    lastOpenedAt: integer("last_opened_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    /** Personal-ish notes (markdown-light), separate from the page description. */
    notes: text("notes"),
    /** Last metadata enrichment attempt (imports arrive bare; see services/link-enrich.ts). */
    enrichedAt: integer("enriched_at", { mode: "timestamp_ms" }),
    /** Set while the link waits in the inbox for triage (quick captures); null once filed. */
    inboxAt: integer("inbox_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("favorites_collection_idx").on(t.workspaceId, t.collectionId, t.sortOrder),
    index("favorites_recent_idx").on(t.workspaceId, t.updatedAt),
    index("favorites_inbox_idx").on(t.workspaceId, t.inboxAt),
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

/** Per-user marks: pinned (home / quick access) and starred (favorites filter). */
export const userMarks = sqliteTable(
  "user_marks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "task" marks are stars only ("Importante" on the home dashboard). */
    entityType: text("entity_type", { enum: ["plan", "collection", "favorite", "task"] }).notNull(),
    entityId: text("entity_id").notNull(),
    mark: text("mark", { enum: ["pin", "star"] }).notNull(),
    /** Manual order of pinned items (quick access); null sorts after, by creation. */
    position: integer("position"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entityType, t.entityId, t.mark] })],
);

/** Saved library searches ("smart collections"): a named query, per user and workspace. */
export const savedSearches = sqliteTable(
  "saved_searches",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Library filter text (see domain/link-query.ts). */
    query: text("query").notNull(),
    sort: text("sort"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("saved_searches_user_idx").on(t.userId, t.workspaceId, t.position)],
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
    /** How many times this user opened it (feeds "Mais abertos" and frecency). */
    openCount: integer("open_count").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entityType, t.entityId] }), index("recents_user_idx").on(t.userId, t.openedAt)],
);

/** Personal access tokens (browser extension, integrations). Only the hash is stored. */
export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** First characters of the token, shown in the UI to tell tokens apart. */
    prefix: text("prefix").notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

/** Comments on a plan, optionally anchored to a node or a layer. */
export const planComments = sqliteTable(
  "plan_comments",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    nodeId: text("node_id"),
    /** Layer the thread is about (plan-level threads only; a node's thread follows the node). */
    layerId: text("layer_id"),
    parentId: text("parent_id"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("plan_comments_plan_idx").on(t.planId, t.createdAt)],
);

/** "Minha biblioteca": reusable drawings of a workspace (also imported from .excalidrawlib files). */
export const libraryItems = sqliteTable(
  "library_items",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    /** The elements, at the origin (see src/domain/library.ts). */
    content: text("content").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("library_items_workspace_idx").on(t.workspaceId, t.createdAt)],
);

// ---------------------------------------------------------------- tasks

export const taskProjects = sqliteTable("task_projects", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("lavender"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("task_projects_ws_name").on(t.workspaceId, t.name)]);

export const taskBoards = sqliteTable("task_boards", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => taskProjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  columnsJson: text("columns_json").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
}, (t) => [index("task_boards_workspace_idx").on(t.workspaceId, t.projectId)]);

export const taskTemplates = sqliteTable("task_templates", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("lavender"),
  boardsJson: text("boards_json").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("task_templates_ws_name").on(t.workspaceId, t.name)]);

export const tasks = sqliteTable("tasks", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => taskProjects.id, { onDelete: "set null" }),
  blockId: text("block_id").references(() => taskBoards.id, { onDelete: "set null" }),
  columnId: text("column_id"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  pendingNote: text("pending_note").notNull().default(""),
  pendingKind: text("pending_kind").notNull().default("note"),
  status: text("status", { enum: ["todo", "doing", "waiting", "done"] }).notNull().default("todo"),
  priority: text("priority", { enum: ["none", "low", "medium", "high"] }).notNull().default("none"),
  color: text("color").notNull().default("neutral"),
  dueDate: text("due_date"),
  followUpDate: text("follow_up_date"),
  dependsOnJson: text("depends_on_json").notNull().default("[]"),
  tagsJson: text("tags_json").notNull().default("[]"),
  peopleJson: text("people_json").notNull().default("[]"),
  subtasksJson: text("subtasks_json").notNull().default("[]"),
  sortOrder: integer("sort_order").notNull().default(0),
  version: integer("version").notNull().default(1),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("tasks_workspace_order_idx").on(t.workspaceId, t.status, t.sortOrder), index("tasks_project_idx").on(t.projectId)]);

/** Personal reminders. Delivery leases survive renderer reloads and app restarts. */
export const taskReminders = sqliteTable("task_reminders", {
  id: id(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["start", "finish", "followup"] }).notNull(),
  deadlineAt: integer("deadline_at").notNull(),
  dateOnly: integer("date_only", { mode: "boolean" }).notNull().default(false),
  timeZone: text("time_zone").notNull(),
  leadMinutes: integer("lead_minutes").notNull().default(0),
  channel: text("channel", { enum: ["sound", "silent", "inbox"] }).notNull().default("sound"),
  snoozeMinutes: integer("snooze_minutes").notNull().default(15),
  nextAt: integer("next_at").notNull(),
  state: text("state", { enum: ["scheduled", "delivered", "dismissed"] }).notNull().default("scheduled"),
  deliveredAt: integer("delivered_at"),
  snoozed: integer("snoozed", { mode: "boolean" }).notNull().default(false),
  leaseUntil: integer("lease_until"),
  claimToken: text("claim_token"),
  lastError: text("last_error"),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("task_reminders_person_kind").on(t.userId, t.taskId, t.kind), index("task_reminders_due_idx").on(t.userId, t.state, t.nextAt)]);

export const TASK_EVENT_KINDS = ["created", "imported", "status", "updated", "archived", "restored", "note"] as const;
export type TaskEventKind = (typeof TASK_EVENT_KINDS)[number];

/** Task history: lifecycle events recorded by the services, plus observations people add ("note"). */
export const taskEvents = sqliteTable("task_events", {
  id: id(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind", { enum: TASK_EVENT_KINDS }).notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  /** Observation text ("note") or the changed fields' labels ("updated"). */
  body: text("body").notNull().default(""),
  createdAt: createdAt(),
}, (t) => [index("task_events_task_idx").on(t.taskId, t.createdAt), index("task_events_ws_idx").on(t.workspaceId, t.createdAt)]);

// ---------------------------------------------------------------- home, preferences, backups

/** Personal shortcuts on the home dashboard: an internal path or an external http(s) URL. */
export const homeShortcuts = sqliteTable("home_shortcuts", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  href: text("href").notNull(),
  icon: text("icon").notNull().default("link"),
  color: text("color").notNull().default("accent"),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index("home_shortcuts_user_idx").on(t.userId, t.workspaceId, t.position)]);

/** Small per-person, per-workspace settings stored as JSON (e.g. the home dashboard layout). */
export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  valueJson: text("value_json").notNull(),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.workspaceId, t.key] })]);

export const BACKUP_FREQUENCIES = ["daily", "weekly", "off"] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];

export const workspaceSettings = sqliteTable("workspace_settings", {
  workspaceId: text("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  backupFrequency: text("backup_frequency", { enum: BACKUP_FREQUENCIES }).notNull().default("daily"),
  /** How many automatic restore points to keep. */
  backupKeep: integer("backup_keep").notNull().default(14),
});

export const BACKUP_KINDS = ["auto", "manual", "safety", "upload"] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

/** Restore points: a gzip'd JSON snapshot of one workspace's data (see services/backups.ts). */
export const workspaceBackups = sqliteTable("workspace_backups", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind", { enum: BACKUP_KINDS }).notNull(),
  note: text("note"),
  /** The workspace the snapshot was taken from (differs from workspaceId for uploaded files). */
  sourceWorkspaceId: text("source_workspace_id").notNull(),
  sourceWorkspaceName: text("source_workspace_name").notNull(),
  /** When the snapshot was taken (for uploads, the original date). */
  takenAt: integer("taken_at", { mode: "timestamp_ms" }).notNull(),
  size: integer("size").notNull(),
  countsJson: text("counts_json").notNull().default("{}"),
  data: blob("data", { mode: "buffer" }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("workspace_backups_ws_idx").on(t.workspaceId, t.createdAt)]);
