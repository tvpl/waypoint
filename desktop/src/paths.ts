import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/** Folder name that, next to the executable, makes the app portable (data travels with it). */
export const PORTABLE_DIR = "WaypointData";

export type DataLocation = { dir: string; portable: boolean };

/**
 * Where the database, uploads, backups and the browser profile live:
 *  1. WAYPOINT_DATA_DIR, when set;
 *  2. portable mode — the Windows portable .exe (always), or any build with a `WaypointData`
 *     folder next to the executable / AppImage: `<that folder>/WaypointData`;
 *  3. otherwise the OS app-data folder (e.g. %APPDATA%\Waypoint, ~/Library/Application Support/Waypoint).
 */
export function resolveDataLocation(): DataLocation {
  if (process.env.WAYPOINT_DATA_DIR) return { dir: path.resolve(process.env.WAYPOINT_DATA_DIR), portable: false };
  const portableExeDir = process.env.PORTABLE_EXECUTABLE_DIR; // set by electron-builder's Windows portable target
  if (portableExeDir) return { dir: path.join(portableExeDir, PORTABLE_DIR), portable: true };
  const exeDir = path.dirname(process.env.APPIMAGE ?? app.getPath("exe"));
  // macOS: look next to Waypoint.app, not inside it.
  const besideApp = process.platform === "darwin" ? path.resolve(exeDir, "../../..") : exeDir;
  const candidate = path.join(besideApp, PORTABLE_DIR);
  if (app.isPackaged && fs.existsSync(candidate)) return { dir: candidate, portable: true };
  return { dir: path.join(app.getPath("userData"), "data"), portable: false };
}

export type Settings = {
  port?: number;
  bounds?: { x?: number; y?: number; width: number; height: number; maximized?: boolean };
  closeToTray?: boolean;
  quickShortcut?: string;
  theme?: "light" | "dark" | "system";
  dark?: boolean;
  backupDir?: string;
  backupFrequency?: "daily" | "weekly" | "off";
  backupKeep?: number;
};

/** Small JSON file next to the data; written on change, read once at startup. */
export class SettingsStore {
  private data: Settings = {};
  constructor(private file: string) {
    try {
      this.data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {}
  }
  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.data[key];
  }
  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.data[key] = value;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error("[waypoint] could not save settings", e);
    }
  }
}
