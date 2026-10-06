import fs from "node:fs";
import path from "node:path";
import type { ServerHandle } from "./server";
import type { SettingsStore } from "./paths";

/**
 * Full backups of the local data: one folder per backup with a consistent snapshot of the
 * database (taken by the server, src/app/api/desktop/backup), the uploaded images and the app
 * lock settings. The shell owns where they go, how often they run and how many are kept.
 *
 *   <backups>/2026-10-05 14-30-12/
 *     waypoint.db  uploads/  security.json  backup.json
 */
export type BackupFrequency = "daily" | "weekly" | "off";
export type BackupItem = { id: string; createdAt: number; size: number; auto: boolean; note?: string };
export type BackupState = {
  dir: string;
  customDir: boolean;
  frequency: BackupFrequency;
  keep: number;
  items: BackupItem[];
  lastAt: number | null;
};

export const KEEP_OPTIONS = [5, 10, 20, 50] as const;
const FREQUENCY_MS: Record<BackupFrequency, number> = { daily: 24 * 3600_000, weekly: 7 * 24 * 3600_000, off: Infinity };
const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

function folderSize(dir: string): number {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? folderSize(p) : fs.statSync(p).size;
  }
  return total;
}

export class Backups {
  constructor(
    private dataDir: string,
    private settings: SettingsStore,
    private server: () => ServerHandle | null,
  ) {}

  dir(): string {
    return this.settings.get("backupDir") ?? path.join(this.dataDir, "backups");
  }

  state(): BackupState {
    const items = this.list();
    return {
      dir: this.dir(),
      customDir: !!this.settings.get("backupDir"),
      frequency: this.settings.get("backupFrequency") ?? "daily",
      keep: this.settings.get("backupKeep") ?? 10,
      items,
      lastAt: items[0]?.createdAt ?? null,
    };
  }

  /** Newest first. Folders without a backup.json (partial or foreign) are ignored. */
  list(): BackupItem[] {
    const dir = this.dir();
    if (!fs.existsSync(dir)) return [];
    const items: BackupItem[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, e.name, "backup.json"), "utf8"));
        items.push({ id: e.name, createdAt: meta.createdAt, size: folderSize(path.join(dir, e.name)), auto: !!meta.auto, note: meta.note });
      } catch {}
    }
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }

  private folder(id: string): string {
    // Ids come from the page: only a direct child of the backup folder.
    if (!id || id !== path.basename(id) || id.startsWith(".")) throw new Error("Backup inválido.");
    const p = path.join(this.dir(), id);
    if (!fs.existsSync(path.join(p, "backup.json"))) throw new Error("Backup não encontrado.");
    return p;
  }

  async create(opts: { auto?: boolean; note?: string } = {}): Promise<BackupItem> {
    const server = this.server();
    if (!server) throw new Error("O Waypoint ainda está iniciando.");
    const createdAt = Date.now();
    const id = stamp(new Date(createdAt));
    const final = path.join(this.dir(), id);
    const partial = `${final}.partial`;
    fs.rmSync(partial, { recursive: true, force: true });
    fs.mkdirSync(partial, { recursive: true });
    try {
      const res = await fetch(`${server.origin}/api/desktop/backup`, {
        method: "POST",
        headers: { "x-waypoint-desktop": server.secret, "content-type": "application/json" },
        body: JSON.stringify({ file: path.join(partial, "waypoint.db") }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
      const uploads = path.join(this.dataDir, "uploads");
      if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(partial, "uploads"), { recursive: true });
      const security = path.join(this.dataDir, "security.json");
      if (fs.existsSync(security)) fs.copyFileSync(security, path.join(partial, "security.json"));
      fs.writeFileSync(path.join(partial, "backup.json"), JSON.stringify({ format: 1, createdAt, auto: !!opts.auto, note: opts.note }, null, 2));
      fs.renameSync(partial, final);
    } catch (e) {
      fs.rmSync(partial, { recursive: true, force: true });
      throw e;
    }
    this.prune();
    return this.list().find((b) => b.id === id)!;
  }

  /** Keeps the newest `keep` backups; the ones made before a restore are kept too. */
  private prune() {
    const keep = this.settings.get("backupKeep") ?? 10;
    for (const old of this.list().filter((b) => !b.note).slice(keep)) fs.rmSync(path.join(this.dir(), old.id), { recursive: true, force: true });
  }

  /** Runs the scheduled backup when it is due. */
  async runIfDue(): Promise<BackupItem | null> {
    const { frequency, lastAt } = this.state();
    if (frequency === "off" || (lastAt && Date.now() - lastAt < FREQUENCY_MS[frequency])) return null;
    return this.create({ auto: true });
  }

  /** Saves the current data first, then puts the backup's data in place. */
  async restore(id: string): Promise<BackupItem> {
    const source = this.folder(id);
    const server = this.server();
    if (!server) throw new Error("O Waypoint ainda está iniciando.");
    const safety = await this.create({ note: "Antes de restaurar" });
    const res = await fetch(`${server.origin}/api/desktop/restore`, {
      method: "POST",
      headers: { "x-waypoint-desktop": server.secret, "content-type": "application/json" },
      body: JSON.stringify({ file: path.join(source, "waypoint.db") }),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
    const uploads = path.join(this.dataDir, "uploads");
    fs.rmSync(uploads, { recursive: true, force: true });
    if (fs.existsSync(path.join(source, "uploads"))) fs.cpSync(path.join(source, "uploads"), uploads, { recursive: true });
    const security = path.join(this.dataDir, "security.json");
    fs.rmSync(security, { force: true });
    if (fs.existsSync(path.join(source, "security.json"))) fs.copyFileSync(path.join(source, "security.json"), security);
    return safety;
  }

  remove(id: string) {
    fs.rmSync(this.folder(id), { recursive: true, force: true });
  }

  path(id: string): string {
    return this.folder(id);
  }

  setDir(dir: string | null) {
    if (dir) fs.mkdirSync(dir, { recursive: true });
    this.settings.set("backupDir", dir ?? undefined);
  }

  setFrequency(f: BackupFrequency) {
    this.settings.set("backupFrequency", f);
  }

  setKeep(n: number) {
    this.settings.set("backupKeep", n);
    this.prune();
  }
}
