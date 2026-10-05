#!/usr/bin/env node
// Smoke test for a packaged build: starts the app with a throwaway data folder and checks that
// the local server comes up, the window lands on the home screen signed in, and the desktop
// bridge is there. Used by CI after packaging; needs Playwright (a dev dependency of the web app).
//
//   node desktop/scripts/smoke.cjs [path/to/executable]
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron } = require(require.resolve("playwright", { paths: [path.resolve(__dirname, "../..")] }));

const release = path.resolve(__dirname, "..", "release");
function findExecutable() {
  const candidates = {
    win32: ["win-unpacked/Waypoint.exe"],
    darwin: ["mac-arm64/Waypoint.app/Contents/MacOS/Waypoint", "mac/Waypoint.app/Contents/MacOS/Waypoint"],
    linux: ["linux-unpacked/waypoint"],
  }[process.platform];
  return candidates.map((c) => path.join(release, c)).find((p) => fs.existsSync(p));
}

(async () => {
  const executablePath = process.argv[2] ?? findExecutable();
  if (!executablePath) throw new Error("No packaged app found in desktop/release.");
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "waypoint-smoke-"));
  const app = await _electron.launch({
    executablePath,
    args: process.platform === "linux" ? ["--no-sandbox"] : [],
    env: { ...process.env, WAYPOINT_DATA_DIR: dataDir },
    timeout: 60_000,
  });
  try {
    const win = await app.firstWindow();
    const deadline = Date.now() + 60_000;
    while (!win.url().startsWith("http")) {
      if (Date.now() > deadline) throw new Error(`App did not leave the splash screen. Server log:\n${readLog(dataDir)}`);
      await new Promise((r) => setTimeout(r, 250));
    }
    await win.waitForLoadState("networkidle");
    const url = new URL(win.url());
    const title = await win.title();
    const bridge = await win.evaluate(() => typeof window.waypointDesktop?.info === "function");
    const titleBar = await win.locator(".wp-titlebar").count();
    console.log({ url: url.href, title, bridge, titleBar });
    if (url.pathname !== "/") throw new Error(`Expected the home screen, got ${url.pathname}`);
    if (!title.includes("Waypoint")) throw new Error(`Unexpected title: ${title}`);
    if (!bridge || titleBar !== 1) throw new Error("Desktop bridge or title bar missing");
    if (!fs.existsSync(path.join(dataDir, "waypoint.db"))) throw new Error("Database was not created in the data folder");
    console.log("✓ smoke test passed");
  } finally {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

function readLog(dataDir) {
  try {
    return fs.readFileSync(path.join(dataDir, "logs", "server.log"), "utf8").slice(-4000);
  } catch {
    return "(no server log)";
  }
}
