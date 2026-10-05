import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { desktopSecurity, saveDesktopSecurity, sessionFloor } from "./desktop-security";

let dir: string;
const env = { ...process.env };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-sec-"));
  process.env.WAYPOINT_DATA_DIR = dir;
  process.env.WAYPOINT_DESKTOP_SECRET = "k";
  process.env.WAYPOINT_STARTED_AT = String(Date.UTC(2026, 9, 5, 12, 0, 0, 750));
});
afterEach(() => {
  process.env = { ...env };
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("desktop security", () => {
  it("is off by default and on the web", () => {
    expect(desktopSecurity()).toEqual({ lock: false, autoLockMinutes: 15, lockOnSleep: true });
    delete process.env.WAYPOINT_DESKTOP_SECRET;
    expect(() => saveDesktopSecurity({ lock: true })).toThrow();
  });

  it("saves next to the data and ignores invalid values", () => {
    saveDesktopSecurity({ lock: true, autoLockMinutes: 5 });
    expect(desktopSecurity()).toMatchObject({ lock: true, autoLockMinutes: 5 });
    fs.writeFileSync(path.join(dir, "security.json"), JSON.stringify({ lock: "yes", autoLockMinutes: 7 }));
    expect(desktopSecurity()).toEqual({ lock: false, autoLockMinutes: 15, lockOnSleep: true });
  });

  it("only counts sessions from this launch while the lock is on", () => {
    expect(sessionFloor()).toBeNull();
    saveDesktopSecurity({ lock: true });
    // Session timestamps have second precision.
    expect(sessionFloor()?.toISOString()).toBe("2026-10-05T12:00:00.000Z");
    delete process.env.WAYPOINT_DESKTOP_SECRET;
    expect(sessionFloor()).toBeNull();
  });
});
