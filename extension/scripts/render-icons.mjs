#!/usr/bin/env node
// Renders the extension icons (icons/icon-{16,32,48,128}.png) from the app logo:
// two dots joined by a bent line, white on a #17171C rounded square.
//
//   node extension/scripts/render-icons.mjs
//
// Needs Playwright with Chromium. If it isn't resolvable from the repo, point to it:
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node extension/scripts/render-icons.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../icons");
mkdirSync(outDir, { recursive: true });

/** Small sizes get a bigger glyph and a heavier stroke so they stay legible. */
function svg(size) {
  const small = size <= 32;
  const glyph = small ? 0.7 : 0.56; // share of the square used by the 24×24 glyph
  const stroke = size <= 16 ? 2.9 : size <= 32 ? 2.5 : 2.1;
  const radius = size * (small ? 0.24 : 0.23);
  const g = size * glyph;
  const offset = (size - g) / 2;
  const scale = g / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#17171C"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#FFFFFF" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="6" cy="18" r="2.5"/>
    <circle cx="18" cy="6" r="2.5"/>
    <path d="M8.5 18H12a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/>
  </g>
</svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`);
  const file = path.join(outDir, `icon-${size}.png`);
  await page.locator("svg").screenshot({ path: file, omitBackground: true });
  console.log("wrote", path.relative(process.cwd(), file));
}
await browser.close();
