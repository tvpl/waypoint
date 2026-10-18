import { z } from "zod";

export const BACKUP_FORMAT = "waypoint-backup";
export const BACKUP_VERSION = 1;

/** A raw database row: column name → SQLite value. */
const rowSchema = z.record(z.string().max(64), z.union([z.string(), z.number(), z.null()]));

/** The portable file: one workspace's rows, table by table (see services/backups.ts for the tables). */
export const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  createdAt: z.number().int(),
  workspace: z.object({
    id: z.string().min(1).max(64),
    name: z.string().max(200),
    icon: z.string().max(200).nullable().optional(),
    color: z.string().max(40).nullable().optional(),
  }),
  /** Set on downloads that leave out other people's private plans and collections. */
  partial: z.boolean().optional(),
  tables: z.record(z.string().max(64), z.array(rowSchema).max(200_000)),
});
export type BackupFile = z.infer<typeof backupFileSchema>;
export type BackupRow = z.infer<typeof rowSchema>;

export type BackupCounts = Partial<Record<"plans" | "collections" | "favorites" | "tasks" | "taskProjects" | "tags" | "libraryItems", number>>;

export const COUNT_LABELS: [keyof BackupCounts, string, string][] = [
  ["plans", "plan", "plans"],
  ["collections", "coleção", "coleções"],
  ["favorites", "link", "links"],
  ["taskProjects", "projeto", "projetos"],
  ["tasks", "tarefa", "tarefas"],
  ["tags", "tag", "tags"],
  ["libraryItems", "item de biblioteca", "itens de biblioteca"],
];

export function describeCounts(counts: BackupCounts) {
  return COUNT_LABELS.filter(([key]) => counts[key])
    .map(([key, one, many]) => `${counts[key]} ${counts[key] === 1 ? one : many}`)
    .join(" · ");
}

export const BACKUP_KIND_LABELS = {
  auto: "Automático",
  manual: "Manual",
  safety: "Antes de restaurar",
  upload: "Enviado",
} as const;

export type BackupSummary = {
  id: string;
  kind: keyof typeof BACKUP_KIND_LABELS;
  note: string | null;
  takenAt: number;
  createdAt: number;
  size: number;
  counts: BackupCounts;
  createdByName: string | null;
  /** The snapshot belongs to another workspace (uploaded file): only "new workspace" restores it. */
  foreign: boolean;
  sourceWorkspaceName: string;
};

export const RECOVERABLE_TYPES = ["plan", "collection", "favorite", "project", "task"] as const;
export type RecoverableType = (typeof RECOVERABLE_TYPES)[number];
export const RECOVERABLE_LABELS: Record<RecoverableType, string> = {
  plan: "Plans",
  collection: "Coleções",
  favorite: "Links",
  project: "Projetos de tarefas",
  task: "Tarefas",
};

/** Something in a snapshot that is gone (deleted) or different (changed) in the workspace today. */
export type RecoverableItem = {
  key: string;
  type: RecoverableType;
  id: string;
  title: string;
  detail: string;
  state: "deleted" | "changed";
};

export const recoverSelectionSchema = z.array(z.string().regex(/^(plan|collection|favorite|project|task):[A-Za-z0-9_-]{1,64}$/)).min(1).max(2000);
