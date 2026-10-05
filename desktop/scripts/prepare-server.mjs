#!/usr/bin/env node
// Builds the web app as a self-contained server and stages it in desktop/server, which
// electron-builder ships as resources/server.
//
//   node desktop/scripts/prepare-server.mjs [--platform=win32|darwin|linux] [--skip-build]
//
// --platform keeps only that platform's better-sqlite3 binaries (default: the current one).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(desktop, "..");
const out = path.join(desktop, "server");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const platform = arg("platform") ?? process.platform;

if (!process.argv.includes("--skip-build")) {
  console.log("› next build (standalone)");
  execFileSync(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NEXT_OUTPUT: "standalone", NEXT_TELEMETRY_DISABLED: "1" },
  });
}

const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("Standalone build not found. Run without --skip-build.");
  process.exit(1);
}

console.log(`› staging ${path.relative(root, out)}`);
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(standalone, out, { recursive: true, verbatimSymlinks: false, dereference: true });
fs.cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) fs.cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });
// Never ship local data that happened to sit in the repo.
fs.rmSync(path.join(out, "data"), { recursive: true, force: true });
// next/image isn't used: drop the image optimizer's native binaries (~45 MB, and they are the
// build machine's platform anyway). Next only loads sharp when an image is optimized.
for (const dep of ["sharp", "@img"]) fs.rmSync(path.join(out, "node_modules", dep), { recursive: true, force: true });

// better-sqlite3 ships N-API binaries for every platform; keep the target's (all archs, for
// universal macOS builds and Windows on ARM).
const prebuilds = path.join(out, "node_modules", "better-sqlite3", "prebuilds");
for (const file of fs.existsSync(prebuilds) ? fs.readdirSync(prebuilds) : []) {
  if (!file.startsWith(`${platform}-`)) fs.rmSync(path.join(prebuilds, file));
}
const kept = fs.existsSync(prebuilds) ? fs.readdirSync(prebuilds) : [];
if (!kept.length) {
  console.error(`No better-sqlite3 binary for ${platform}.`);
  process.exit(1);
}

const size = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => {
    const p = path.join(dir, e.name);
    return n + (e.isDirectory() ? size(p) : fs.statSync(p).size);
  }, 0);
console.log(`✓ server ready for ${platform} (${kept.join(", ")}) — ${(size(out) / 1024 / 1024).toFixed(1)} MB`);
