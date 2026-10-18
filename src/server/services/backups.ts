import "server-only";
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { decryptBackup, isEncryptedBackup } from "../lib/backup-crypto";
import type { Statement } from "better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import type { BackupFrequency, BackupKind } from "../db/schema";
import { newId, slugify } from "@/lib/utils";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileSchema,
  recoverSelectionSchema,
  type BackupCounts,
  type BackupFile,
  type BackupRow,
  type BackupSummary,
  type RecoverableItem,
  type RecoverableType,
} from "@/domain/backup";
import { STATUS_LABELS, type TaskStatus } from "@/domain/tasks";
import { canEditWorkspace, UserError, workspaceRole } from "./workspaces";
import { createPlan, parseDoc, reindexPlans } from "./plans";
import { hiddenCollectionIds, reindexCollections, reindexFavorites } from "./links";
import { ensureTags } from "./tags";
import { reindexTasks, validateWorkspaceDependencies } from "./tasks";
import { recordTaskArchive } from "./task-history";
import type { Visibility } from "../db/schema";

type Actor = { workspaceId: string; userId: string };
type Client = ReturnType<typeof getDb>["$client"];

// ---------------------------------------------------------------- what a workspace backup holds

type Ref = { table: string; required?: boolean };
type Spec = {
  table: string;
  /** Rows of the workspace; `@ws` is the workspace id. */
  where: string;
  /** Has a workspace_id column (always rewritten to the target workspace). */
  ws?: boolean;
  /** Columns pointing at other rows of the backup: invalid ones become null, or drop the row when required. */
  refs?: Record<string, Ref>;
  /** Columns pointing at people: nullable (cleared when the person is gone), existing (any account) or member (of the target). */
  users?: Record<string, "nullable" | "existing" | "member">;
  /** JSON text that embeds ids of other rows (rewritten when ids are remapped). */
  json?: string[];
};

const ofPlans = "plan_id in (select id from plans where workspace_id = @ws)";
const MARKED = { plan: "plans", collection: "collections", favorite: "favorites", task: "tasks" } as const;

/** In insertion order: referenced tables come first (foreign keys are deferred anyway). */
const SPECS: Spec[] = [
  { table: "task_projects", where: "workspace_id = @ws", ws: true },
  { table: "task_boards", where: "workspace_id = @ws", ws: true, refs: { project_id: { table: "task_projects" } } },
  { table: "task_templates", where: "workspace_id = @ws", ws: true },
  { table: "tags", where: "workspace_id = @ws", ws: true },
  { table: "collections", where: "workspace_id = @ws", ws: true, refs: { parent_id: { table: "collections" } }, users: { created_by: "nullable" } },
  { table: "favorites", where: "workspace_id = @ws", ws: true, refs: { collection_id: { table: "collections" } }, users: { created_by: "nullable" } },
  {
    table: "favorite_tags",
    where: "favorite_id in (select id from favorites where workspace_id = @ws)",
    refs: { favorite_id: { table: "favorites", required: true }, tag_id: { table: "tags", required: true } },
  },
  { table: "plans", where: "workspace_id = @ws", ws: true, refs: { published_version_id: { table: "plan_versions" } }, users: { created_by: "nullable" } },
  {
    table: "plan_documents",
    where: ofPlans,
    refs: { plan_id: { table: "plans", required: true } },
    users: { updated_by: "nullable" },
    json: ["nodes_json", "edges_json", "layers_json"],
  },
  { table: "plan_versions", where: ofPlans, refs: { plan_id: { table: "plans", required: true } }, users: { created_by: "nullable" }, json: ["snapshot_json"] },
  { table: "plan_members", where: ofPlans, refs: { plan_id: { table: "plans", required: true } }, users: { user_id: "member" } },
  { table: "plan_tags", where: ofPlans, refs: { plan_id: { table: "plans", required: true }, tag_id: { table: "tags", required: true } } },
  {
    table: "plan_comments",
    where: ofPlans,
    refs: { plan_id: { table: "plans", required: true }, parent_id: { table: "plan_comments" } },
    users: { user_id: "existing" },
  },
  { table: "resource_refs", where: "source_plan_id in (select id from plans where workspace_id = @ws)", refs: { source_plan_id: { table: "plans", required: true } } },
  { table: "library_items", where: "workspace_id = @ws", ws: true, users: { created_by: "nullable" } },
  {
    table: "tasks",
    where: "workspace_id = @ws",
    ws: true,
    refs: { project_id: { table: "task_projects" }, block_id: { table: "task_boards" } },
    users: { created_by: "nullable" },
    json: ["depends_on_json"],
  },
  { table: "task_events", where: "workspace_id = @ws", ws: true, refs: { task_id: { table: "tasks", required: true } }, users: { user_id: "nullable" } },
  { table: "task_links", where: "workspace_id = @ws", ws: true, refs: { task_id: { table: "tasks", required: true } } },
  { table: "task_reminders", where: "workspace_id = @ws", ws: true, refs: { task_id: { table: "tasks", required: true } }, users: { user_id: "member" } },
  { table: "saved_searches", where: "workspace_id = @ws", ws: true, users: { user_id: "member" } },
  { table: "home_shortcuts", where: "workspace_id = @ws", ws: true, users: { user_id: "member" } },
  { table: "user_preferences", where: "workspace_id = @ws", ws: true, users: { user_id: "member" } },
  {
    table: "user_marks",
    where: Object.entries(MARKED)
      .map(([type, table]) => `(entity_type = '${type}' and entity_id in (select id from ${table} where workspace_id = @ws))`)
      .join(" or "),
    users: { user_id: "member" },
  },
  { table: "assets", where: "workspace_id = @ws", ws: true, users: { created_by: "nullable" } },
];
const TABLES = new Set(SPECS.map((s) => s.table));

const client = (): Client => getDb().$client;

function columnsOf(c: Client, table: string): Set<string> {
  return new Set((c.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map((r) => r.name));
}

function countsOf(tables: BackupFile["tables"]): BackupCounts {
  return {
    plans: tables.plans?.length ?? 0,
    collections: tables.collections?.length ?? 0,
    favorites: tables.favorites?.length ?? 0,
    taskProjects: tables.task_projects?.length ?? 0,
    tasks: tables.tasks?.length ?? 0,
    tags: tables.tags?.length ?? 0,
    libraryItems: tables.library_items?.length ?? 0,
  };
}

/** Reads every row of a workspace into the portable format. */
export function takeSnapshot(workspaceId: string, c: Client = client()): BackupFile {
  const ws = c.prepare("select id, name, icon, color from workspaces where id = ?").get(workspaceId) as BackupFile["workspace"] | undefined;
  if (!ws) throw new UserError("Workspace não encontrado.");
  const tables: BackupFile["tables"] = {};
  for (const spec of SPECS) tables[spec.table] = c.prepare(`select * from ${spec.table} where ${spec.where}`).all({ ws: workspaceId }) as BackupRow[];
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: Date.now(), workspace: ws, tables };
}

// ---------------------------------------------------------------- access

function roleOf(actor: Actor) {
  const role = workspaceRole(actor.userId, actor.workspaceId);
  if (!role) throw new UserError("Você não tem permissão para esta ação.");
  return role;
}
function requireEditor(actor: Actor) {
  if (!canEditWorkspace(roleOf(actor))) throw new UserError("Só owners e editors acessam os backups.");
}
function requireOwner(actor: Actor) {
  if (roleOf(actor) !== "owner") throw new UserError("Só owners do workspace podem fazer isso.");
}

// ---------------------------------------------------------------- storage, schedule and retention

const MAX_MANUAL = 50;
const KEEP_OTHER = 10;

export function backupSettings(workspaceId: string): { frequency: BackupFrequency; keep: number } {
  const row = getDb().select().from(schema.workspaceSettings).where(eq(schema.workspaceSettings.workspaceId, workspaceId)).get();
  return { frequency: row?.backupFrequency ?? "daily", keep: row?.backupKeep ?? 14 };
}

export function saveBackupSettings(actor: Actor, raw: unknown) {
  requireOwner(actor);
  const input = z.object({ frequency: z.enum(["daily", "weekly", "off"]), keep: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(60)]) }).parse(raw);
  getDb()
    .insert(schema.workspaceSettings)
    .values({ workspaceId: actor.workspaceId, backupFrequency: input.frequency, backupKeep: input.keep })
    .onConflictDoUpdate({ target: schema.workspaceSettings.workspaceId, set: { backupFrequency: input.frequency, backupKeep: input.keep } })
    .run();
  prune(actor.workspaceId);
}

function store(workspaceId: string, file: BackupFile, kind: BackupKind, userId: string | null, note?: string | null) {
  const data = zlib.gzipSync(JSON.stringify(file));
  const id = newId();
  getDb()
    .insert(schema.workspaceBackups)
    .values({
      id,
      workspaceId,
      createdBy: userId,
      kind,
      note: note?.trim().slice(0, 140) || null,
      sourceWorkspaceId: file.workspace.id,
      sourceWorkspaceName: file.workspace.name,
      takenAt: new Date(file.createdAt),
      size: data.length,
      countsJson: JSON.stringify(countsOf(file.tables)),
      data,
      createdAt: new Date(),
    })
    .run();
  if (kind !== "upload") mirrorToFolder(workspaceId, id, file, kind, data);
  return id;
}

// ---------------------------------------------------------------- copy outside the database

/** `WAYPOINT_BACKUP_DIR`: a folder (ideally synced or on another disk) that receives each restore point. */
export function backupFolder(): string | null {
  const dir = process.env.WAYPOINT_BACKUP_DIR?.trim();
  return dir && path.isAbsolute(dir) ? dir : null;
}
const folderFor = (root: string, workspaceId: string) => path.join(root, `workspace-${workspaceId}`);

function mirrorToFolder(workspaceId: string, id: string, file: BackupFile, kind: BackupKind, gz: Buffer) {
  const root = backupFolder();
  if (!root) return;
  try {
    const dir = folderFor(root, workspaceId);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date(file.createdAt).toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(dir, `${stamp}-${kind}-${id}.json.gz`), gz);
  } catch (e) {
    console.error("[backups] could not copy to WAYPOINT_BACKUP_DIR", e);
  }
}

/** Files of restore points that no longer exist are removed with them. */
function pruneFolder(workspaceId: string, keepIds: Set<string>) {
  const root = backupFolder();
  if (!root) return;
  try {
    const dir = folderFor(root, workspaceId);
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const m = /-([0-9a-z]{16})\.json\.gz$/.exec(name);
      if (m && !keepIds.has(m[1])) fs.rmSync(path.join(dir, name), { force: true });
    }
  } catch (e) {
    console.error("[backups] could not prune WAYPOINT_BACKUP_DIR", e);
  }
}

/** Drops the oldest automatic restore points beyond the setting, and old safety copies and uploads. */
function prune(workspaceId: string) {
  const db = getDb();
  const { keep } = backupSettings(workspaceId);
  for (const [kind, limit] of [
    ["auto", keep],
    ["safety", KEEP_OTHER],
    ["upload", KEEP_OTHER],
  ] as const) {
    const rows = db
      .select({ id: schema.workspaceBackups.id })
      .from(schema.workspaceBackups)
      .where(and(eq(schema.workspaceBackups.workspaceId, workspaceId), eq(schema.workspaceBackups.kind, kind)))
      .orderBy(desc(schema.workspaceBackups.createdAt))
      .all();
    for (const r of rows.slice(limit)) db.delete(schema.workspaceBackups).where(eq(schema.workspaceBackups.id, r.id)).run();
  }
  syncFolder(workspaceId);
}

function syncFolder(workspaceId: string) {
  if (!backupFolder()) return;
  const ids = getDb().select({ id: schema.workspaceBackups.id }).from(schema.workspaceBackups).where(eq(schema.workspaceBackups.workspaceId, workspaceId)).all();
  pruneFolder(workspaceId, new Set(ids.map((r) => r.id)));
}

export function createBackup(actor: Actor, note?: string) {
  requireEditor(actor);
  const manual = getDb()
    .select({ id: schema.workspaceBackups.id })
    .from(schema.workspaceBackups)
    .where(and(eq(schema.workspaceBackups.workspaceId, actor.workspaceId), eq(schema.workspaceBackups.kind, "manual")))
    .all().length;
  if (manual >= MAX_MANUAL) throw new UserError(`Há ${MAX_MANUAL} backups manuais. Exclua os antigos para criar outro.`);
  return store(actor.workspaceId, takeSnapshot(actor.workspaceId), "manual", actor.userId, z.string().max(140).optional().parse(note));
}

/** Called after page loads: takes the scheduled restore point when one is due. Never throws. */
export function maybeAutoBackup(workspaceId: string, now = Date.now()) {
  try {
    const { frequency } = backupSettings(workspaceId);
    if (frequency === "off") return false;
    const last = getDb()
      .select({ createdAt: schema.workspaceBackups.createdAt })
      .from(schema.workspaceBackups)
      .where(and(eq(schema.workspaceBackups.workspaceId, workspaceId), eq(schema.workspaceBackups.kind, "auto")))
      .orderBy(desc(schema.workspaceBackups.createdAt))
      .get();
    const interval = (frequency === "daily" ? 1 : 7) * 86_400_000;
    // A little slack so a daily habit at about the same time still gets its daily copy.
    if (last && now - last.createdAt.valueOf() < interval - 3_600_000) return false;
    store(workspaceId, takeSnapshot(workspaceId), "auto", null);
    prune(workspaceId);
    return true;
  } catch (e) {
    console.error("[backups] automatic backup failed", e);
    return false;
  }
}

export function listBackups(actor: Actor): BackupSummary[] {
  requireEditor(actor);
  return getDb()
    .select({
      id: schema.workspaceBackups.id,
      kind: schema.workspaceBackups.kind,
      note: schema.workspaceBackups.note,
      takenAt: schema.workspaceBackups.takenAt,
      createdAt: schema.workspaceBackups.createdAt,
      size: schema.workspaceBackups.size,
      countsJson: schema.workspaceBackups.countsJson,
      sourceWorkspaceId: schema.workspaceBackups.sourceWorkspaceId,
      sourceWorkspaceName: schema.workspaceBackups.sourceWorkspaceName,
      createdByName: schema.users.name,
    })
    .from(schema.workspaceBackups)
    .leftJoin(schema.users, eq(schema.users.id, schema.workspaceBackups.createdBy))
    .where(eq(schema.workspaceBackups.workspaceId, actor.workspaceId))
    .orderBy(desc(schema.workspaceBackups.createdAt))
    .all()
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      note: r.note,
      takenAt: r.takenAt.valueOf(),
      createdAt: r.createdAt.valueOf(),
      size: r.size,
      counts: JSON.parse(r.countsJson) as BackupCounts,
      createdByName: r.createdByName,
      foreign: r.sourceWorkspaceId !== actor.workspaceId,
      sourceWorkspaceName: r.sourceWorkspaceName,
    }));
}

export function deleteBackup(actor: Actor, id: string) {
  requireOwner(actor);
  const res = getDb()
    .delete(schema.workspaceBackups)
    .where(and(eq(schema.workspaceBackups.id, z.string().max(64).parse(id)), eq(schema.workspaceBackups.workspaceId, actor.workspaceId)))
    .run();
  if (!res.changes) throw new UserError("Backup não encontrado.");
  syncFolder(actor.workspaceId);
}

function loadBackup(actor: Actor, id: string): { file: BackupFile; takenAt: number } {
  const row = getDb()
    .select()
    .from(schema.workspaceBackups)
    .where(and(eq(schema.workspaceBackups.id, z.string().max(64).parse(id)), eq(schema.workspaceBackups.workspaceId, actor.workspaceId)))
    .get();
  if (!row) throw new UserError("Backup não encontrado.");
  return { file: backupFileSchema.parse(JSON.parse(zlib.gunzipSync(row.data).toString("utf8"))), takenAt: row.takenAt.valueOf() };
}

// ---------------------------------------------------------------- privacy

/** Other people's private plans and collections (with what is inside them), by id. */
function hiddenFrom(file: BackupFile, userId: string) {
  const plans = new Set((file.tables.plans ?? []).filter((p) => p.visibility === "private" && p.created_by !== userId).map((p) => String(p.id)));
  const cols = file.tables.collections ?? [];
  const collections = new Set(cols.filter((c) => c.visibility === "private" && c.created_by !== userId).map((c) => String(c.id)));
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of cols)
      if (c.parent_id && collections.has(String(c.parent_id)) && !collections.has(String(c.id))) {
        collections.add(String(c.id));
        grew = true;
      }
  }
  const favorites = new Set((file.tables.favorites ?? []).filter((f) => f.collection_id && collections.has(String(f.collection_id))).map((f) => String(f.id)));
  return { plans, collections, favorites };
}

/** The file a person may download: everything except other people's private items. */
export function downloadBackup(actor: Actor, id: string): { file: BackupFile; fileName: string } {
  requireOwner(actor);
  const { file } = loadBackup(actor, id);
  const hidden = hiddenFrom(file, actor.userId);
  const keep = (table: string, row: BackupRow) => {
    if (table === "plans") return !hidden.plans.has(String(row.id));
    if (["plan_documents", "plan_versions", "plan_members", "plan_tags", "plan_comments"].includes(table)) return !hidden.plans.has(String(row.plan_id));
    if (table === "resource_refs") return !hidden.plans.has(String(row.source_plan_id));
    if (table === "collections") return !hidden.collections.has(String(row.id));
    if (table === "favorites") return !hidden.favorites.has(String(row.id));
    if (table === "favorite_tags") return !hidden.favorites.has(String(row.favorite_id));
    if (table === "user_marks") {
      const set = row.entity_type === "plan" ? hidden.plans : row.entity_type === "collection" ? hidden.collections : row.entity_type === "favorite" ? hidden.favorites : null;
      return !set?.has(String(row.entity_id));
    }
    return true;
  };
  const partial = hidden.plans.size + hidden.collections.size > 0;
  const tables = Object.fromEntries(Object.entries(file.tables).map(([t, rows]) => [t, rows.filter((r) => keep(t, r))]));
  const day = new Date(file.createdAt).toISOString().slice(0, 10);
  return {
    file: { ...file, tables, ...(partial ? { partial: true } : {}) },
    fileName: `waypoint-${slugify(file.workspace.name) || "workspace"}-${day}.json`,
  };
}

/** Stores an uploaded file as a restore point of this workspace. */
export function importBackupFile(actor: Actor, raw: Buffer, password?: string | null): BackupSummary {
  requireOwner(actor);
  if (isEncryptedBackup(raw)) {
    if (!password) throw new UserError("Este backup está protegido por senha. Informe a senha para enviar.");
    try {
      raw = decryptBackup(raw, password);
    } catch (e) {
      throw new UserError(e instanceof Error && !(e instanceof z.ZodError) ? e.message : "Arquivo criptografado inválido.");
    }
  }
  let parsed: unknown;
  try {
    const text = raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw).toString("utf8") : raw.toString("utf8");
    parsed = JSON.parse(text);
  } catch {
    throw new UserError("Este arquivo não é um backup do Waypoint (.json).");
  }
  const result = backupFileSchema.safeParse(parsed);
  if (!result.success) throw new UserError("Este arquivo não é um backup do Waypoint ou foi alterado.");
  const unknown = Object.keys(result.data.tables).filter((t) => !TABLES.has(t));
  const tables = Object.fromEntries(Object.entries(result.data.tables).filter(([t]) => TABLES.has(t)));
  if (unknown.length) console.warn("[backups] ignoring unknown tables", unknown);
  const id = store(actor.workspaceId, { ...result.data, tables }, "upload", actor.userId, null);
  return listBackups(actor).find((b) => b.id === id)!;
}

// ---------------------------------------------------------------- writing rows back

type Prepared = Map<string, BackupRow[]>;
type PrepareOptions = {
  workspaceId: string;
  /** Give every row a new id (restoring as a new workspace). */
  remap: boolean;
  members: Set<string>;
  /** Rows that already exist and must stay as they are, by table. */
  keep?: Map<string, Set<string>>;
};

const QUOTED_ID = /"([0-9a-z]{16})"/g;

/** Validates and rewrites a backup's rows for the target workspace (see Spec). */
function prepare(file: BackupFile, o: PrepareOptions, c: Client): Prepared {
  const known = new Map<string, boolean>();
  const userExists = (id: string) => {
    if (!known.has(id)) known.set(id, !!c.prepare("select 1 from users where id = ?").get(id));
    return known.get(id)!;
  };
  const maps = new Map<string, Map<string, string>>();
  const mapped = (table: string, id: string) => maps.get(table)?.get(id) ?? id;
  if (o.remap)
    for (const spec of SPECS) {
      if (spec.table === "assets") continue; // files on disk are named by id
      const rows = file.tables[spec.table] ?? [];
      if (rows.length && "id" in rows[0]) maps.set(spec.table, new Map(rows.map((r) => [String(r.id), newId()])));
    }
  const allIds = new Map<string, string>();
  for (const m of maps.values()) for (const [a, b] of m) allIds.set(a, b);
  const rewriteJson = (text: string) => (allIds.size ? text.replace(QUOTED_ID, (whole, id: string) => (allIds.has(id) ? `"${allIds.get(id)}"` : whole)) : text);

  // Ids that will exist after the write: the backup's rows (minus kept ones) plus kept rows.
  const valid = new Map<string, Set<string>>();
  for (const spec of SPECS) {
    const ids = new Set<string>();
    for (const r of file.tables[spec.table] ?? []) if (r.id !== undefined && r.id !== null) ids.add(mapped(spec.table, String(r.id)));
    for (const id of o.keep?.get(spec.table) ?? []) ids.add(id);
    valid.set(spec.table, ids);
  }

  const out: Prepared = new Map();
  for (const spec of SPECS) {
    const rows: BackupRow[] = [];
    const kept = o.keep?.get(spec.table);
    for (const source of file.tables[spec.table] ?? []) {
      if (kept && source.id !== undefined && kept.has(String(source.id))) continue;
      const row: BackupRow = { ...source };
      if (o.remap && row.id !== undefined && maps.has(spec.table)) row.id = mapped(spec.table, String(row.id));
      if (spec.ws) row.workspace_id = o.workspaceId;
      let drop = false;
      for (const [col, rule] of Object.entries(spec.users ?? {})) {
        const v = row[col];
        if (v === null || v === undefined) continue;
        const ok = rule === "member" ? o.members.has(String(v)) : userExists(String(v));
        if (ok) continue;
        if (rule === "nullable") row[col] = null;
        else drop = true;
      }
      for (const [col, ref] of Object.entries(spec.refs ?? {})) {
        const v = row[col];
        if (v === null || v === undefined) continue;
        const id = mapped(ref.table, String(v));
        // Children of rows kept as they are today stay as they are too.
        if (ref.required && o.keep?.get(ref.table)?.has(id)) drop = true;
        else if (valid.get(ref.table)?.has(id)) row[col] = id;
        else if (ref.required) drop = true;
        else row[col] = null;
      }
      if (spec.table === "tasks" && row.block_id === null) row.column_id = null;
      if (spec.table === "user_marks") {
        const table = MARKED[row.entity_type as keyof typeof MARKED];
        const id = table ? mapped(table, String(row.entity_id)) : "";
        if (!table || !valid.get(table)?.has(id) || o.keep?.get(table)?.has(id)) drop = true;
        else row.entity_id = id;
      }
      if ((spec.table === "resource_refs" || spec.table === "task_links") && typeof row.target_id === "string") {
        const table = MARKED[row.target_type as keyof typeof MARKED];
        if (table) row.target_id = mapped(table, row.target_id);
      }
      if (o.remap) for (const col of spec.json ?? []) if (typeof row[col] === "string") row[col] = rewriteJson(row[col] as string);
      if (!drop) rows.push(row);
    }
    out.set(spec.table, rows);
  }
  return out;
}

function insertRows(c: Client, table: string, rows: BackupRow[], cache = new Map<string, Statement<unknown[]>>()) {
  if (!rows.length) return;
  const columns = columnsOf(c, table);
  for (const row of rows) {
    const keys = Object.keys(row).filter((k) => columns.has(k));
    const sig = `${table}:${keys.join(",")}`;
    let stmt = cache.get(sig);
    if (!stmt) {
      stmt = c.prepare<unknown[]>(`insert into ${table} (${keys.map((k) => `"${k}"`).join(", ")}) values (${keys.map(() => "?").join(", ")})`);
      cache.set(sig, stmt);
    }
    stmt.run(...keys.map((k) => row[k]));
  }
}

function insertAll(c: Client, prepared: Prepared) {
  const cache = new Map<string, Statement<unknown[]>>();
  for (const spec of SPECS) insertRows(c, spec.table, prepared.get(spec.table) ?? [], cache);
}

/** Search entries and resource refs are derived data: rebuilt from the restored rows. */
function rebuildSearch(workspaceId: string) {
  const c = client();
  c.prepare("delete from search_index where workspace_id = ?").run(workspaceId);
  const ids = (table: string) => (c.prepare(`select id from ${table} where workspace_id = ?`).all(workspaceId) as { id: string }[]).map((r) => r.id);
  reindexPlans(ids("plans"));
  reindexCollections(ids("collections"));
  reindexFavorites(ids("favorites"));
  reindexTasks(ids("tasks"));
}

function friendly<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof UserError) throw e;
    if (e && typeof e === "object" && "code" in e && String(e.code).startsWith("SQLITE_CONSTRAINT")) {
      console.error("[backups] restore rejected", e);
      throw new UserError("O backup tem dados que conflitam com outro workspace deste servidor. Use “Criar workspace a partir do backup”.");
    }
    throw e;
  }
}

const members = (c: Client, workspaceId: string) =>
  new Set((c.prepare("select user_id from workspace_members where workspace_id = ?").all(workspaceId) as { user_id: string }[]).map((r) => r.user_id));
const dateLabel = (ms: number) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(ms);

/**
 * Replaces the workspace with the backup. A safety restore point of the current state is taken
 * first. Other people's private plans and collections stay as they are today.
 */
export function restoreWorkspace(actor: Actor, backupId: string) {
  requireOwner(actor);
  const { file } = loadBackup(actor, backupId);
  if (file.workspace.id !== actor.workspaceId) throw new UserError("Este backup é de outro workspace. Crie um workspace a partir dele.");
  const c = client();
  const ws = actor.workspaceId;
  friendly(() =>
    getDb().transaction(() => {
      store(ws, takeSnapshot(ws, c), "safety", actor.userId, `Antes de restaurar o backup de ${dateLabel(file.createdAt)}`);
      c.pragma("defer_foreign_keys = ON");
      const current = takeSnapshot(ws, c);
      const hidden = hiddenFrom(current, actor.userId);
      const keep = new Map([
        ["plans", hidden.plans],
        ["collections", hidden.collections],
        ["favorites", hidden.favorites],
      ]);
      // Kept rows lose their tags when the workspace's tags are replaced: remember them by name.
      const tagName = new Map((current.tables.tags ?? []).map((t) => [String(t.id), String(t.name)]));
      const keptPlanTags = (current.tables.plan_tags ?? []).filter((r) => hidden.plans.has(String(r.plan_id)));
      const keptFavoriteTags = (current.tables.favorite_tags ?? []).filter((r) => hidden.favorites.has(String(r.favorite_id)));
      const keptRoots = (current.tables.collections ?? []).filter((r) => hidden.collections.has(String(r.id)) && r.parent_id && !hidden.collections.has(String(r.parent_id)));

      const notIn = (ids: Set<string>) => (ids.size ? ` and id not in (${[...ids].map(() => "?").join(",")})` : "");
      for (const [type, table] of Object.entries(MARKED)) {
        const kept = type === "plan" ? hidden.plans : type === "collection" ? hidden.collections : type === "favorite" ? hidden.favorites : new Set<string>();
        c.prepare(`delete from user_marks where entity_type = ? and entity_id in (select id from ${table} where workspace_id = ?${notIn(kept)})`).run(type, ws, ...[...kept]);
      }
      // Detach kept collections from parents about to be deleted (deleting a parent cascades).
      for (const r of keptRoots) c.prepare("update collections set parent_id = null where id = ?").run(r.id);
      c.prepare(`delete from favorites where workspace_id = ?${notIn(hidden.favorites)}`).run(ws, ...[...hidden.favorites]);
      c.prepare(`delete from collections where workspace_id = ?${notIn(hidden.collections)}`).run(ws, ...[...hidden.collections]);
      c.prepare(`delete from plans where workspace_id = ?${notIn(hidden.plans)}`).run(ws, ...[...hidden.plans]);
      for (const table of ["tags", "library_items", "tasks", "task_boards", "task_templates", "task_projects", "saved_searches", "home_shortcuts", "user_preferences", "assets"])
        c.prepare(`delete from ${table} where workspace_id = ?`).run(ws);

      const prepared = prepare(file, { workspaceId: ws, remap: false, members: members(c, ws), keep }, c);
      // A kept private plan may share a slug with a restored one.
      const slugs = new Set((current.tables.plans ?? []).filter((p) => hidden.plans.has(String(p.id))).map((p) => String(p.slug)));
      for (const p of prepared.get("plans") ?? []) if (slugs.has(String(p.slug))) p.slug = `${p.slug}-${String(p.id).slice(0, 4)}`;
      insertAll(c, prepared);

      for (const r of keptRoots) c.prepare("update collections set parent_id = ? where id = ? and exists (select 1 from collections where id = ?)").run(r.parent_id, r.id, r.parent_id);
      const retag = (rows: BackupRow[], table: string, col: string) => {
        for (const r of rows) {
          const name = tagName.get(String(r.tag_id));
          if (!name) continue;
          const [tagId] = ensureTags(getDb(), ws, [name]);
          c.prepare(`insert or ignore into ${table} (${col}, tag_id) values (?, ?)`).run(r[col], tagId);
        }
      };
      retag(keptPlanTags, "plan_tags", "plan_id");
      retag(keptFavoriteTags, "favorite_tags", "favorite_id");
      if (file.workspace.name.trim()) c.prepare("update workspaces set name = ? where id = ?").run(file.workspace.name.trim(), ws);
    }),
  );
  rebuildSearch(ws);
}

/** Restores a backup (from this or another workspace) as a brand-new workspace with fresh ids. */
export function restoreAsNewWorkspace(actor: Actor, backupId: string): { id: string; name: string } {
  requireOwner(actor);
  const { file } = loadBackup(actor, backupId);
  const c = client();
  const id = newId();
  const name = `${file.workspace.name.trim() || "Workspace"} (restaurado)`.slice(0, 120);
  friendly(() =>
    getDb().transaction(() => {
      c.pragma("defer_foreign_keys = ON");
      getDb()
        .insert(schema.workspaces)
        .values({ id, name, icon: file.workspace.icon ?? null, color: file.workspace.color ?? null, createdBy: actor.userId })
        .run();
      getDb().insert(schema.workspaceMembers).values({ workspaceId: id, userId: actor.userId, role: "owner" }).run();
      const prepared = prepare(file, { workspaceId: id, remap: true, members: new Set([actor.userId]) }, c);
      const assets = (prepared.get("assets") ?? []).filter((a) => !c.prepare("select 1 from assets where id = ?").get(a.id));
      prepared.set("assets", assets);
      insertAll(c, prepared);
    }),
  );
  rebuildSearch(id);
  return { id, name };
}

// ---------------------------------------------------------------- recovering single items

const TASK_FIELDS = [
  "title",
  "description",
  "pending_note",
  "pending_kind",
  "status",
  "priority",
  "color",
  "due_date",
  "follow_up_date",
  "depends_on_json",
  "tags_json",
  "people_json",
  "subtasks_json",
  "project_id",
  "block_id",
  "column_id",
  "completed_at",
  "archived_at",
] as const;

const fingerprint = (row: BackupRow | undefined, fields: readonly string[]) => JSON.stringify(fields.map((f) => row?.[f] ?? null));

function currentRows(c: Client, table: string, workspaceId: string) {
  return new Map((c.prepare(`select * from ${table} where workspace_id = ?`).all(workspaceId) as BackupRow[]).map((r) => [String(r.id), r]));
}

function currentDocs(c: Client, workspaceId: string) {
  return new Map(
    (c.prepare("select d.* from plan_documents d join plans p on p.id = d.plan_id where p.workspace_id = ?").all(workspaceId) as BackupRow[]).map((r) => [String(r.plan_id), r]),
  );
}

/** What the backup has that is gone or different today, among what this person may see. */
export function listRecoverable(actor: Actor, backupId: string): { items: RecoverableItem[]; takenAt: number } {
  requireEditor(actor);
  const { file, takenAt } = loadBackup(actor, backupId);
  if (file.workspace.id !== actor.workspaceId) throw new UserError("Este backup é de outro workspace. Crie um workspace a partir dele para ver o conteúdo.");
  const c = client();
  const ws = actor.workspaceId;
  const hidden = hiddenFrom(file, actor.userId);
  const items: RecoverableItem[] = [];
  const add = (type: RecoverableType, id: unknown, title: unknown, detail: string, state: RecoverableItem["state"]) =>
    items.push({ key: `${type}:${String(id)}`, type, id: String(id), title: String(title ?? "") || "Sem título", detail, state });

  const plans = currentRows(c, "plans", ws);
  const docs = currentDocs(c, ws);
  const snapDocs = new Map((file.tables.plan_documents ?? []).map((d) => [String(d.plan_id), d]));
  for (const p of file.tables.plans ?? []) {
    if (hidden.plans.has(String(p.id))) continue;
    const now = plans.get(String(p.id));
    if (!now || now.deleted_at) add("plan", p.id, p.title, now ? "Na lixeira" : p.archived_at ? "Excluído (estava arquivado)" : "Excluído", "deleted");
    else {
      const before = snapDocs.get(String(p.id));
      const after = docs.get(String(p.id));
      if (before && after && fingerprint(before, ["nodes_json", "edges_json", "layers_json"]) !== fingerprint(after, ["nodes_json", "edges_json", "layers_json"]))
        add("plan", p.id, p.title, "Desenho diferente hoje · restaura como cópia", "changed");
    }
  }
  const collections = currentRows(c, "collections", ws);
  const snapCollections = new Map((file.tables.collections ?? []).map((r) => [String(r.id), r]));
  for (const r of file.tables.collections ?? [])
    if (!hidden.collections.has(String(r.id)) && (!collections.has(String(r.id)) || collections.get(String(r.id))!.deleted_at)) {
      const links = (file.tables.favorites ?? []).filter((f) => f.collection_id === r.id).length;
      add("collection", r.id, r.name, `Excluída${links ? ` · ${links} ${links === 1 ? "link" : "links"}` : ""}`, "deleted");
    }
  const favorites = currentRows(c, "favorites", ws);
  for (const r of file.tables.favorites ?? [])
    if (!hidden.favorites.has(String(r.id)) && (!favorites.has(String(r.id)) || favorites.get(String(r.id))!.deleted_at)) {
      const col = r.collection_id ? snapCollections.get(String(r.collection_id))?.name : null;
      add("favorite", r.id, r.title, `${r.domain ?? ""}${col ? ` · em ${col}` : ""}`, "deleted");
    }
  const projects = currentRows(c, "task_projects", ws);
  const snapProjects = new Map((file.tables.task_projects ?? []).map((r) => [String(r.id), r]));
  for (const r of file.tables.task_projects ?? []) if (!projects.has(String(r.id))) add("project", r.id, r.name, "Excluído · com seus blocos e colunas", "deleted");
  const tasks = currentRows(c, "tasks", ws);
  for (const r of file.tables.tasks ?? []) {
    const project = r.project_id ? (snapProjects.get(String(r.project_id))?.name ?? "") : "Sem projeto";
    const stage = STATUS_LABELS[r.status as TaskStatus] ?? "";
    const now = tasks.get(String(r.id));
    if (!now) add("task", r.id, r.title, `Excluída · ${project} · ${stage}`, "deleted");
    else if (fingerprint(now, TASK_FIELDS) !== fingerprint(r, TASK_FIELDS)) add("task", r.id, r.title, `Diferente hoje · ${project} · ${stage} no backup`, "changed");
  }
  return { items, takenAt };
}

function uniqueValue(exists: (v: string) => boolean, base: string, suffix: (n: number) => string) {
  if (!exists(base)) return base;
  for (let i = 1; ; i++) if (!exists(base + suffix(i))) return base + suffix(i);
}

/** Brings back the selected items; deleted ones keep their ids, changed plans come back as copies. */
export function recoverItems(actor: Actor, backupId: string, rawKeys: unknown) {
  requireEditor(actor);
  const keys = recoverSelectionSchema.parse(rawKeys);
  const { file, takenAt } = loadBackup(actor, backupId);
  if (file.workspace.id !== actor.workspaceId) throw new UserError("Este backup é de outro workspace.");
  const { items } = listRecoverable(actor, backupId);
  const available = new Map(items.map((i) => [i.key, i]));
  const chosen = keys.map((k) => available.get(k)).filter((i): i is RecoverableItem => !!i);
  if (!chosen.length) throw new UserError("Nada para recuperar: os itens selecionados já existem como no backup.");
  const ws = actor.workspaceId;
  const c = client();
  const memberIds = members(c, ws);
  const rowsOf = (table: string) => file.tables[table] ?? [];
  const byId = (table: string) => new Map(rowsOf(table).map((r) => [String(r.id), r]));
  const exists = (table: string, id: unknown) => !!c.prepare(`select 1 from ${table} where id = ? and workspace_id = ?`).get(id, ws);
  const ids = (type: RecoverableType, state?: RecoverableItem["state"]) => chosen.filter((i) => i.type === type && (!state || i.state === state)).map((i) => i.id);
  const touched = { plans: [] as string[], collections: [] as string[], favorites: [] as string[], tasks: [] as string[] };
  const label = dateLabel(takenAt);
  const tagNames = new Map(rowsOf("tags").map((t) => [String(t.id), String(t.name)]));
  const withWs = (row: BackupRow): BackupRow => ({ ...row, workspace_id: ws });

  friendly(() =>
    getDb().transaction(() => {
      c.pragma("defer_foreign_keys = ON");
      // Items still in the trash just come out of it (same row, nothing to insert).
      const untrash = (table: string, id: string) =>
        c.prepare(`update ${table} set deleted_at = null where id = ? and workspace_id = ? and deleted_at is not null`).run(id, ws).changes > 0;
      // Collections, parents first; their missing links come along.
      const snapCols = byId("collections");
      const colIds = new Set(ids("collection"));
      const depth = (id: string): number => {
        const p = snapCols.get(id)?.parent_id;
        return p && snapCols.has(String(p)) ? 1 + depth(String(p)) : 0;
      };
      for (const id of [...colIds].sort((a, b) => depth(a) - depth(b))) {
        if (untrash("collections", id)) {
          touched.collections.push(id);
          continue;
        }
        const row = withWs(snapCols.get(id)!);
        if (row.parent_id && !exists("collections", row.parent_id)) row.parent_id = null;
        if (row.created_by && !c.prepare("select 1 from users where id = ?").get(row.created_by)) row.created_by = null;
        insertRows(c, "collections", [row]);
        touched.collections.push(id);
      }
      // Deleting a collection moves its links up a level: send them back home.
      for (const f of rowsOf("favorites")) {
        if (!f.collection_id || !colIds.has(String(f.collection_id))) continue;
        const ancestors: string[] = [];
        for (let p = snapCols.get(String(f.collection_id))?.parent_id; p && !ancestors.includes(String(p)); p = snapCols.get(String(p))?.parent_id) ancestors.push(String(p));
        const now = c.prepare("select collection_id from favorites where id = ? and workspace_id = ?").get(f.id, ws) as { collection_id: string | null } | undefined;
        if (!now || (now.collection_id !== null && !ancestors.includes(now.collection_id))) continue;
        c.prepare("update favorites set collection_id = ? where id = ?").run(f.collection_id, f.id);
        if (exists("favorites", f.id)) touched.favorites.push(String(f.id));
      }
      const favIds = new Set(ids("favorite"));
      for (const f of rowsOf("favorites")) if (f.collection_id && colIds.has(String(f.collection_id)) && available.has(`favorite:${f.id}`)) favIds.add(String(f.id));
      const snapFavs = byId("favorites");
      for (const id of favIds) {
        if (untrash("favorites", id)) {
          touched.favorites.push(id);
          continue;
        }
        const row = withWs(snapFavs.get(id)!);
        if (row.collection_id && !exists("collections", row.collection_id)) row.collection_id = null;
        if (row.created_by && !c.prepare("select 1 from users where id = ?").get(row.created_by)) row.created_by = null;
        insertRows(c, "favorites", [row]);
        const names = rowsOf("favorite_tags")
          .filter((t) => t.favorite_id === id)
          .map((t) => tagNames.get(String(t.tag_id)))
          .filter((n): n is string => !!n);
        for (const tagId of ensureTags(getDb(), ws, names)) c.prepare("insert or ignore into favorite_tags (favorite_id, tag_id) values (?, ?)").run(id, tagId);
        touched.favorites.push(id);
      }

      // Task projects with their blocks.
      const snapProjects = byId("task_projects");
      for (const id of ids("project")) {
        const row = withWs(snapProjects.get(id)!);
        row.name = uniqueValue((v) => !!c.prepare("select 1 from task_projects where workspace_id = ? and name = ?").get(ws, v), String(row.name), (n) => ` (restaurado${n > 1 ? ` ${n}` : ""})`);
        insertRows(c, "task_projects", [row]);
        insertRows(
          c,
          "task_boards",
          rowsOf("task_boards")
            .filter((b) => b.project_id === id && !exists("task_boards", b.id))
            .map(withWs),
        );
      }

      // Tasks: deleted ones come back, changed ones go back to the backup's version.
      const snapTasks = byId("tasks");
      const fit = (row: BackupRow) => {
        if (row.project_id && !exists("task_projects", row.project_id)) row.project_id = null;
        const board = row.block_id ? (c.prepare("select project_id from task_boards where id = ? and workspace_id = ?").get(row.block_id, ws) as { project_id: string | null } | undefined) : undefined;
        if (!board || board.project_id !== row.project_id) {
          row.block_id = null;
          row.column_id = null;
        }
        const deps = (JSON.parse(String(row.depends_on_json ?? "[]")) as string[]).filter((d) => exists("tasks", d) || ids("task", "deleted").includes(d));
        row.depends_on_json = JSON.stringify(deps);
        if (row.created_by && !c.prepare("select 1 from users where id = ?").get(row.created_by)) row.created_by = null;
        return row;
      };
      const restored = (taskId: string, body: string) =>
        c
          .prepare("insert into task_events (id, task_id, workspace_id, user_id, kind, body, created_at) values (?, ?, ?, ?, 'restored', ?, ?)")
          .run(newId(), taskId, ws, actor.userId, body, Date.now());
      for (const id of ids("task", "deleted")) {
        insertRows(c, "tasks", [fit(withWs(snapTasks.get(id)!))]);
        insertRows(
          c,
          "task_events",
          rowsOf("task_events")
            .filter((e) => e.task_id === id && !c.prepare("select 1 from task_events where id = ?").get(e.id))
            .map((e) => ({ ...withWs(e), user_id: e.user_id && c.prepare("select 1 from users where id = ?").get(e.user_id) ? e.user_id : null })),
        );
        restored(id, `Recuperada do backup de ${label}`);
        touched.tasks.push(id);
      }
      for (const id of ids("task", "changed")) {
        const row = fit(withWs(snapTasks.get(id)!));
        const current = c.prepare("select archived_at, version from tasks where id = ?").get(id) as { archived_at: number | null; version: number };
        const set = TASK_FIELDS.map((f) => `"${f}" = ?`).join(", ");
        c.prepare(`update tasks set ${set}, version = ?, updated_at = ? where id = ?`).run(...TASK_FIELDS.map((f) => row[f] ?? null), current.version + 1, Date.now(), id);
        if (!!current.archived_at !== !!row.archived_at) recordTaskArchive(getDb(), actor, id, !!row.archived_at);
        restored(id, `Voltou à versão do backup de ${label}`);
        touched.tasks.push(id);
      }
      if (touched.tasks.length) validateWorkspaceDependencies(actor, getDb());

      // Plans: deleted ones with their versions, tags, comments and members.
      const snapPlans = byId("plans");
      for (const id of ids("plan", "deleted")) {
        if (untrash("plans", id)) {
          touched.plans.push(id);
          continue;
        }
        const row = withWs(snapPlans.get(id)!);
        row.slug = uniqueValue((v) => !!c.prepare("select 1 from plans where workspace_id = ? and slug = ?").get(ws, v), String(row.slug), (n) => `-${n + 1}`);
        if (row.created_by && !c.prepare("select 1 from users where id = ?").get(row.created_by)) row.created_by = null;
        const versions = rowsOf("plan_versions").filter((v) => v.plan_id === id);
        if (row.published_version_id && !versions.some((v) => v.id === row.published_version_id)) row.published_version_id = null;
        const nullUser = (r: BackupRow, col: string) => (r[col] && !c.prepare("select 1 from users where id = ?").get(r[col]) ? { ...r, [col]: null } : r);
        insertRows(c, "plans", [row]);
        insertRows(c, "plan_documents", rowsOf("plan_documents").filter((d) => d.plan_id === id).map((d) => nullUser(d, "updated_by")));
        insertRows(c, "plan_versions", versions.map((v) => nullUser(v, "created_by")));
        insertRows(c, "plan_members", rowsOf("plan_members").filter((m) => m.plan_id === id && memberIds.has(String(m.user_id))));
        insertRows(
          c,
          "plan_comments",
          rowsOf("plan_comments").filter((m) => m.plan_id === id && c.prepare("select 1 from users where id = ?").get(m.user_id)),
        );
        const names = rowsOf("plan_tags")
          .filter((t) => t.plan_id === id)
          .map((t) => tagNames.get(String(t.tag_id)))
          .filter((n): n is string => !!n);
        for (const tagId of ensureTags(getDb(), ws, names)) c.prepare("insert or ignore into plan_tags (plan_id, tag_id) values (?, ?)").run(id, tagId);
        touched.plans.push(id);
      }
      for (const id of ids("plan", "changed")) {
        const p = snapPlans.get(id)!;
        const doc = rowsOf("plan_documents").find((d) => d.plan_id === id)!;
        const names = rowsOf("plan_tags")
          .filter((t) => t.plan_id === id)
          .map((t) => tagNames.get(String(t.tag_id)))
          .filter((n): n is string => !!n);
        createPlan({
          workspaceId: ws,
          userId: actor.userId,
          title: `${String(p.title)} (backup de ${label})`.slice(0, 200),
          description: (p.description as string | null) ?? null,
          visibility: p.visibility as Visibility,
          tags: names,
          document: parseDoc({
            nodesJson: String(doc.nodes_json),
            edgesJson: String(doc.edges_json),
            viewportJson: String(doc.viewport_json),
            layersJson: (doc.layers_json as string | null) ?? null,
          }),
        });
      }
    }),
  );
  reindexPlans(touched.plans);
  reindexCollections(touched.collections);
  reindexFavorites(touched.favorites);
  reindexTasks(touched.tasks);
  return chosen.length;
}
