import "server-only";
import fs from "node:fs";
import path from "node:path";

// Inline rather than importing ./desktop: auth.ts uses this module, and ./desktop imports the services.
const isDesktop = () => !!process.env.WAYPOINT_DESKTOP_SECRET;

/**
 * Desktop app lock (see src/server/desktop.ts). With the lock on, the window asks for the local
 * account's password on every launch, after a period without use and when the computer sleeps
 * or locks its screen. It protects the open app; the data files themselves are not encrypted
 * (that is the job of the system's disk encryption, e.g. FileVault).
 *
 * Kept in <data>/security.json, next to the database, so it travels with a portable copy.
 * Deleting that file turns the lock off without touching the data (the way back from a
 * forgotten password).
 */
export type DesktopSecurity = {
  lock: boolean;
  /** Minutes without use before locking; 0 = never. */
  autoLockMinutes: number;
  lockOnSleep: boolean;
};

export const AUTO_LOCK_OPTIONS = [0, 1, 5, 15, 30, 60] as const;
const DEFAULTS: DesktopSecurity = { lock: false, autoLockMinutes: 15, lockOnSleep: true };

const file = () => (process.env.WAYPOINT_DATA_DIR ? path.join(process.env.WAYPOINT_DATA_DIR, "security.json") : null);

export function desktopSecurity(): DesktopSecurity {
  const f = file();
  if (!isDesktop() || !f) return DEFAULTS;
  try {
    const raw = JSON.parse(fs.readFileSync(f, "utf8")) as Partial<DesktopSecurity>;
    return {
      lock: raw.lock === true,
      autoLockMinutes: AUTO_LOCK_OPTIONS.includes(raw.autoLockMinutes as never) ? raw.autoLockMinutes! : DEFAULTS.autoLockMinutes,
      lockOnSleep: raw.lockOnSleep !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveDesktopSecurity(patch: Partial<DesktopSecurity>): DesktopSecurity {
  const f = file();
  if (!isDesktop() || !f) throw new Error("Disponível apenas no aplicativo de desktop.");
  const next = { ...desktopSecurity(), ...patch };
  fs.writeFileSync(f, JSON.stringify(next, null, 2));
  return next;
}

/**
 * With the lock on, sessions from earlier launches don't count: every launch asks again.
 * The shell passes its start time (ms); session timestamps have second precision.
 */
export function sessionFloor(): Date | null {
  const started = Number(process.env.WAYPOINT_STARTED_AT);
  if (!isDesktop() || !Number.isFinite(started) || !desktopSecurity().lock) return null;
  return new Date(Math.floor(started / 1000) * 1000);
}
