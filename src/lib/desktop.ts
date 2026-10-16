"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

/** One entry of the desktop menu model (desktop/src/menu.ts → renderModel). */
export type DesktopMenuEntry =
  | { type: "separator" }
  | {
      type?: "normal" | "checkbox" | "radio";
      id: string;
      label: string;
      /** Electron accelerator, e.g. "CmdOrCtrl+Shift+N". */
      accelerator?: string;
      /** The same, formatted for display on this platform. */
      shortcut?: string;
      /** System-wide shortcut handled by the shell: shown, never matched by the page. */
      global?: boolean;
      checked?: boolean;
      enabled?: boolean;
      submenu?: DesktopMenuEntry[];
    };

export type DesktopMenu = { id: string; label: string; items: DesktopMenuEntry[] };

export type DesktopInfo = {
  version: string;
  platform: string;
  dataDir: string;
  portable: boolean;
  origin: string;
  quickShortcut: string;
  closeToTray: boolean;
};

/** desktop/src/backups.ts */
export type BackupItem = { id: string; createdAt: number; size: number; auto: boolean; note?: string };
export type BackupState = {
  dir: string;
  customDir: boolean;
  frequency: "daily" | "weekly" | "off";
  keep: number;
  items: BackupItem[];
  lastAt: number | null;
};
export type BackupAction = "state" | "create" | "restore" | "remove" | "reveal" | "open-dir" | "choose-dir" | "reset-dir" | "frequency" | "keep";

/** What the desktop shell's preload exposes (desktop/src/preload.ts). */
export type DesktopBridge = {
  notifications(action: "test" | "refresh"): Promise<{ supported?: boolean; sent: boolean }>;
  platform: string;
  info(): Promise<DesktopInfo | null>;
  menu(): Promise<DesktopMenu[]>;
  run(id: string): void;
  /** Shows the main window on an app path (from the capture window). */
  openInMain(path: string): void;
  /** Backup center; every action answers with the new state. */
  backups(action: BackupAction, arg?: string | number): Promise<BackupState>;
  setTheme(pref: string, dark: boolean): void;
  onCommand(cb: (id: string, arg?: string) => void): () => void;
  onWindowState(cb: (state: { fullScreen: boolean; focused: boolean }) => void): () => void;
};

export function getDesktop(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { waypointDesktop?: DesktopBridge }).waypointDesktop ?? null;
}

/** The floating capture window's page (desktop/src/main.ts opens it with the global shortcut). */
export const QUICK_PATH = "/quick";

/** Asks the app rail to hide or show itself (same as the "[" key); sent by the desktop menu. */
export const TOGGLE_RAIL_EVENT = "wp:toggle-rail";

const noop = () => () => {};

/** The desktop bridge when running inside the desktop app; null in a browser and while server-rendering. */
export function useDesktop(): DesktopBridge | null {
  return useSyncExternalStore(noop, getDesktop, () => null);
}

/** Standard editing commands: left to the browser engine, never matched by the page. */
const EDITING = new Set(["role:undo", "role:redo", "role:cut", "role:copy", "role:paste", "role:selectAll"]);

/** Menu commands that have a keyboard accelerator, flattened ("CmdOrCtrl+N" → "app:new-plan"). */
export function acceleratorsOf(menus: DesktopMenu[]): { accelerator: string; id: string }[] {
  const out: { accelerator: string; id: string }[] = [];
  const walk = (entries: DesktopMenuEntry[]) => {
    for (const e of entries) {
      if (!("id" in e)) continue;
      if (e.submenu) walk(e.submenu);
      else if (e.accelerator && !e.global && !EDITING.has(e.id) && e.enabled !== false) out.push({ accelerator: e.accelerator, id: e.id });
    }
  };
  menus.forEach((m) => walk(m.items));
  return out;
}

const NAMED_KEYS: Record<string, string> = { Left: "ArrowLeft", Right: "ArrowRight", Up: "ArrowUp", Down: "ArrowDown", Enter: "Enter", Space: " " };

/** Whether a key press matches an Electron accelerator (Windows/Linux semantics: CmdOrCtrl = Ctrl). */
export function matchesAccelerator(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, accelerator: string): boolean {
  const parts = accelerator.split("+").map((p) => (p === "" ? "+" : p));
  const key = parts.pop()!;
  const mods = new Set(parts.map((p) => (p === "CmdOrCtrl" || p === "CommandOrControl" || p === "Control" ? "Ctrl" : p === "Command" ? "Cmd" : p)));
  if (e.ctrlKey !== mods.has("Ctrl") || e.altKey !== mods.has("Alt") || e.metaKey !== mods.has("Cmd")) return false;
  // Letters and digits by physical key, so Shift doesn't change them; punctuation by character.
  if (/^[A-Z]$/.test(key)) return e.shiftKey === mods.has("Shift") && e.code === `Key${key}`;
  if (/^[0-9]$/.test(key)) return e.shiftKey === mods.has("Shift") && e.code === `Digit${key}`;
  if (/^F\d{1,2}$/.test(key) || NAMED_KEYS[key]) return e.shiftKey === mods.has("Shift") && e.key === (NAMED_KEYS[key] ?? key);
  // "=" is also reached as "+" (Shift) on many layouts; don't insist on Shift for punctuation.
  return e.key === key || (key === "=" && e.key === "+");
}

/** The backup center's state, refreshed whenever a backup is made, restored or removed. */
export function useBackupState(): [BackupState | null, (action: BackupAction, arg?: string | number) => Promise<BackupState>] {
  const [state, setState] = useState<BackupState | null>(null);
  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop?.backups) return;
    const load = () => void desktop.backups("state").then(setState).catch(() => {});
    load();
    return desktop.onCommand((id) => id === "app:backups-changed" && load());
  }, []);
  const act = async (action: BackupAction, arg?: string | number) => {
    const next = await getDesktop()!.backups(action, arg);
    setState(next);
    return next;
  };
  return [state, act];
}

/** "12,4 MB" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) (v /= 1024), i++;
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}
