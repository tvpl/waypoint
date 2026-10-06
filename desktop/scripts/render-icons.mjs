#!/usr/bin/env node
// Renders the desktop app icons from the app logo (two dots joined by a bent line):
//   build/icon.png        1024 px, app icon for macOS (with the standard margin)
//   build/icon-win.png    1024 px, app icon for Windows/Linux (edge to edge)
//   assets/icon.png       512 px, window icon on Linux
//   assets/tray.png       32 px (+ @2x), tray icon on Windows/Linux
//   assets/trayTemplate.png 16 px (+ @2x), menu bar icon on macOS (template image)
//
//   node desktop/scripts/render-icons.mjs
//
// Needs Playwright with Chromium (a dev dependency of the web app).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json"));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The logo glyph (24×24). Unlike the in-app logo, the line stops at the ring instead of its
 * center, which would show through the ring's hole at icon sizes.
 */
const GLYPH = `<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H12a3 3 0 0 0 3-3V9a3 3 0 0 1 .727-1.958"/>`;

/** Logo tile: dark rounded square, white glyph. `inset` leaves a transparent margin (macOS grid). */
function tile(size, { inset = 0 } = {}) {
  const box = size - inset * 2;
  const small = box <= 32;
  const glyph = small ? 0.7 : 0.56;
  const stroke = box <= 16 ? 2.9 : box <= 32 ? 2.5 : box <= 128 ? 2.1 : 1.7;
  const g = box * glyph;
  const offset = inset + (box - g) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${inset}" y="${inset}" width="${box}" height="${box}" rx="${box * 0.225}" fill="#17171C"/>
  <g transform="translate(${offset} ${offset}) scale(${g / 24})" fill="none" stroke="#FFFFFF" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${GLYPH}</g>
</svg>`;
}

/** Bare black glyph for the macOS menu bar (the system tints template images). */
function template(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${GLYPH}</svg>`;
}

const jobs = [
  ["build/icon.png", 1024, tile(1024, { inset: 100 })],
  ["build/icon-win.png", 1024, tile(1024, { inset: 24 })],
  ["assets/icon.png", 512, tile(512, { inset: 12 })],
  ["assets/tray.png", 32, tile(32, { inset: 1 })],
  ["assets/tray@2x.png", 64, tile(64, { inset: 2 })],
  ["assets/trayTemplate.png", 16, template(16)],
  ["assets/trayTemplate@2x.png", 32, template(32)],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [rel, size, svg] of jobs) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator("svg").screenshot({ path: file, omitBackground: true });
  console.log("wrote", path.relative(process.cwd(), file));
}
await browser.close();
