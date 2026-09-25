/**
 * Screenshot a page (local .html file or a running URL) to a PNG.
 *
 * Usage:
 *   node tools/screenshot.mjs <url-or-path> [label] [width] [height] [scale]
 *
 * Examples:
 *   node tools/screenshot.mjs http://localhost:3000 home-mobile 390 844 3
 *   node tools/screenshot.mjs http://localhost:3000/dashboard dashboard 1440
 *   node tools/screenshot.mjs http://localhost:3000 mobile-home 390 844 3
 *
 * Output: ./screenshots/screenshot-<n>[-<label>].png  (auto-incrementing n), in the repo root.
 * The screenshots/ folder is git-ignored — these are working artifacts, not deliverables.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(ROOT, '..', 'screenshots');

const [, , target, rawLabel, widthArg, heightArg, scaleArg] = process.argv;

if (!target) {
  console.error('Usage: node tools/screenshot.mjs <url-or-path> [label] [width] [height] [scale]');
  process.exit(1);
}

const viewportWidth = widthArg ? parseInt(widthArg, 10) : 1440;
const viewportHeight = heightArg ? parseInt(heightArg, 10) : 900;
const deviceScaleFactor = scaleArg ? parseFloat(scaleArg) : 2;

// Accept a bare file path as well as an http(s)/file URL.
const isUrl = /^(https?|file):\/\//i.test(target);
const url = isUrl ? target : pathToFileURL(path.resolve(target)).href;
if (!isUrl && !fs.existsSync(target)) {
  console.error(`File not found: ${target}`);
  process.exit(1);
}

const label = rawLabel
  ? rawLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  : '';

fs.mkdirSync(OUT_DIR, { recursive: true });

function nextIndex() {
  const used = fs
    .readdirSync(OUT_DIR)
    .map((f) => f.match(/^screenshot-(\d+)/))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  return used.length ? Math.max(...used) + 1 : 1;
}

const index = nextIndex();
const fileName = label ? `screenshot-${index}-${label}.png` : `screenshot-${index}.png`;
const outPath = path.join(OUT_DIR, fileName);

const browser = await puppeteer.launch({
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: viewportWidth, height: viewportHeight, deviceScaleFactor });

  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  } catch {
    // networkidle0 never settled (long-poll, websocket, dev HMR) — fall back.
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  }

  // Make sure web fonts are painted before we shoot.
  try {
    await page.evaluate(() => document.fonts && document.fonts.ready);
  } catch {}
  await new Promise((r) => setTimeout(r, 300));

  await page.screenshot({ path: outPath, fullPage: true });

  const dims = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
  }));
  console.log(
    `Saved: ${outPath}\n` +
      `  source : ${url}\n` +
      `  page   : ${dims.w}x${dims.h} css px  @${deviceScaleFactor}x  ->  ${dims.w * deviceScaleFactor}x${dims.h * deviceScaleFactor} px`,
  );
} finally {
  await browser.close();
}
