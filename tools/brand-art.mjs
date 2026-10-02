// Budgts colourful brand art: the sunset-forest scenes drawn around Crystal for
// the app icon and the Facebook cover (approved 2026-10-01). Crystal's pixels
// come from the app's one source (src/lib/brand/robin-art.ts) and are never
// redrawn here.
//
//   node tools/brand-art.mjs [outDir]   -> the cover, the icon and Facebook previews (default .tmp/brand-art/out)
//
// The app icon itself ships from the approved render, src/lib/brand/app-icon.png
// (see tools/generate-app-icons.mjs); this module only draws what a platform
// needs beyond that frame (drawIconCanvas), whose centre must match it exactly.
//
// Each scene is authored at its native art resolution and scaled up by a whole
// number with nearest-neighbour sampling, so the whole scene shares one grain.
// The cover's wordmark sits at exactly 2× that grain, like the in-app lockup.
//
// The scene pieces (palette, grid, sky, sun, clouds, mountains, forest, pines,
// meadow, flowers ...) live in src/lib/brand/scene-art.ts, the one source the
// app's sunset backdrop is drawn from too; this tool composes the cover and
// the icon from them and renders the PNGs.
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  P, Grid, rgb, mix, hash, rng,
  bands, sun, cloud, mountains, forest, pine, clumps, line, meadow, flowerPatches, mushroom, firefly, petal, bird,
} from "../src/lib/brand/scene-art.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const require = createRequire(join(ROOT, "package.json"));
const sharp = require("sharp");
const { ROBIN_ART } = await import(pathToFileURL(join(ROOT, "src/lib/brand/robin-art.ts")).href);

function crystal(g, X, Y, mood = "normal") {
  const art = ROBIN_ART[mood];
  for (const part of [art.body, art.beak, art.eye, art.extra])
    for (const r of part) for (let i = 0; i < r.w; i++) g.set(X + r.x + 1 + i, Y + r.y + 1, r.fill);
}

function text(g, mask, X, Y, k, color) {
  for (const [x, y] of mask.cells)
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) g.set(X + x * k + a, Y + y * k + b, color);
}

// ---------- Dogica glyphs (the brand's pixel face), sampled one cell per font pixel ----------
export async function glyphMasks(strings) {
  const b64 = readFileSync(join(ROOT, "src/app/fonts/dogica/dogicabold.ttf")).toString("base64");
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const raw = await page.evaluate(
      async ({ b64, strings }) => {
        const face = new FontFace("DogicaBold", `url(data:font/ttf;base64,${b64})`);
        await face.load();
        document.fonts.add(face);
        const S = 10, out = {};
        for (const s of strings) {
          const c = document.createElement("canvas");
          c.width = (s.length * 10 + 4) * S;
          c.height = 14 * S;
          const ctx = c.getContext("2d");
          ctx.font = `${8 * S}px DogicaBold`;
          ctx.fillStyle = "#000";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(s, 2 * S, 10 * S);
          const { data } = ctx.getImageData(0, 0, c.width, c.height);
          const cells = [];
          for (let y = 0; y < c.height / S; y++)
            for (let x = 0; x < c.width / S; x++) {
              const i = ((y * S + S / 2) * c.width + (x * S + S / 2)) * 4 + 3;
              if (data[i] > 127) cells.push([x, y]);
            }
          out[s] = cells;
        }
        return out;
      },
      { b64, strings },
    );
    const masks = {};
    for (const [s, cells] of Object.entries(raw)) {
      const minX = Math.min(...cells.map((c) => c[0])), minY = Math.min(...cells.map((c) => c[1]));
      const maxX = Math.max(...cells.map((c) => c[0])), maxY = Math.max(...cells.map((c) => c[1]));
      masks[s] = {
        cells: cells.map(([x, y]) => [x - minX, y - minY]),
        w: maxX - minX + 1,
        h: maxY - minY + 1,
        baseline: 10 - minY, // rows from the top of the ink to the baseline
      };
    }
    return masks;
  } finally {
    await browser.close();
  }
}

// ---------- raster ----------
/** The whole canvas at `s` px per cell, as raw RGBA; null cells stay transparent. */
export function raster(g, s) {
  const W = g.w * s, H = g.h * s, buf = Buffer.alloc(W * H * 4);
  const cache = new Map();
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const c = g.px[y * g.w + x];
      if (c === null) continue;
      let v = cache.get(c);
      if (!v) cache.set(c, (v = rgb(c)));
      for (let j = 0; j < s; j++) {
        let o = ((y * s + j) * W + x * s) * 4;
        for (let i = 0; i < s; i++, o += 4) {
          buf[o] = v[0];
          buf[o + 1] = v[1];
          buf[o + 2] = v[2];
          buf[o + 3] = 255;
        }
      }
    }
  return { buf, W, H };
}

/** Text at half the art grain (k output px per font px), for the small tag line. */
function stampFine(img, mask, X, Y, k, color) {
  const v = rgb(color);
  for (const [x, y] of mask.cells)
    for (let j = 0; j < k; j++)
      for (let i = 0; i < k; i++) {
        const o = ((Y + y * k + j) * img.W + X + x * k + i) * 4;
        img.buf[o] = v[0];
        img.buf[o + 1] = v[1];
        img.buf[o + 2] = v[2];
      }
}

const png = (img) => sharp(img.buf, { raw: { width: img.W, height: img.H, channels: 4 } }).png({ compressionLevel: 9 });

// ---------- the cover (Facebook: 820×312 desktop, 640×360 phone crop) ----------
const COVER_GRAIN = 6; // 273×104 art px → 1638×624
export function drawCover(T) {
  const W = 273, H = 104, g = new Grid(W, H);
  const SHORE = 70; // the far shore's row; water below it
  const SUN = { x: 137, y: 69, r: 11 };
  const L_LEFT = [0.8, -0.6];

  bands(g, P.sky.map((c, i) => [i * 7, c]), 0, W, 0, H, false);
  sun(g, SUN.x, SUN.y, SUN.r, P.sun);
  cloud(g, 150, 10, [[0, 2], [5, 3.2], [11, 2.6], [16, 1.8]], P.cloud);
  cloud(g, 222, 27, [[0, 1.8], [5, 2.8], [10, 2], [14, 1.4]], P.cloud);
  cloud(g, 96, 7, [[0, 1.6], [4, 2.4], [8, 1.6]], P.cloud);
  bird(g, 204, 17);
  bird(g, 211, 14);
  mountains(g, [[40, 44, 0.7], [95, 54, 0.55], [190, 52, 0.6], [246, 40, 0.7], [282, 46, 0.6]], SHORE, P.mtnFar, SUN.x);
  mountains(g, [[60, 60, 0.45], [112, 65, 0.42], [212, 60, 0.5]], SHORE, P.mtnNear, SUN.x);
  forest(g, SHORE, 11, P.forestBack, P.forestFront);

  // the lake mirrors the sky (warm at the far shore, bluer toward us),
  // carries the forest's shadow, and catches the sun
  bands(g, [[SHORE + 1, P.water[0]], [SHORE + 3, P.water[1]], [SHORE + 6, P.water[2]], [SHORE + 9, P.water[3]], [SHORE + 12, P.water[4]]], 0, W, SHORE + 1, 86);
  for (let x = 0; x < W; x++) {
    let d = 0;
    while (d < 4 && [P.forestBack, P.forestFront].includes(g.get(x, SHORE - d))) d++;
    for (let i = 0; i < Math.min(d, 3); i++) g.set(x, SHORE + 1 + i, P.waterShade);
  }
  const r = rng(41);
  for (let y = SHORE + 1; y <= 85; y++) {
    const spread = 1.5 + (y - SHORE) * 0.55;
    for (let k = 0; k < 2; k++) {
      const len = 2 + Math.floor(r() * 3);
      const x0 = Math.round(SUN.x - spread + r() * spread * 2 - len / 2);
      for (let i = 0; i < len; i++) g.set(x0 + i, y, (y + k) % 3 ? P.sun.glow : P.sun.disc);
    }
    if (y > SHORE + 3 && y % 2 === 0) {
      const len = 3 + Math.floor(r() * 4), x0 = Math.floor(r() * W);
      if (Math.abs(x0 - SUN.x) > 14) for (let i = 0; i < len; i++) g.set(x0 + i, y, mix(g.get(x0 + i, y), P.waterGlint, 0.45));
    }
  }

  // near shore
  clumps(g, [[36, 83, 4.5], [45, 84, 4], [52, 85, 3.5]], P.leaf, L_LEFT, 3);
  clumps(g, [[200, 83, 4], [208, 81, 5.5], [217, 83, 4.5], [225, 84, 4]], P.leaf, [-0.8, -0.6], 4);
  const topAt = (x) => 85 + Math.round(Math.sin(x * 0.07 + 1) * 1.2 + Math.sin(x * 0.023) * 0.9);
  meadow(g, topAt, P.grass, 7, [0, 89, 93, 97, 101]);
  for (const x of [72, 74, 77, 80, 82, 186, 189, 191]) {
    const t = topAt(x), h = 3 + Math.floor(hash(x, 1, 5) * 4);
    for (let y = t - h; y < t; y++) g.set(x, y, P.reed.stem);
    g.set(x, t - h - 1, P.reed.tip);
    g.set(x, t - h, P.reed.tip);
  }

  // right: a stand of pines lit from the sun's side
  pine(g, 238, 92, 34, P.pine, -1);
  pine(g, 268, 91, 44, P.pine, -1);
  pine(g, 253, 96, 54, P.pine, -1);

  // left: the blossom tree Crystal perches in
  for (let y = 24; y < H; y++) {
    const flare = y > 94 ? Math.floor((y - 94) * 0.7) : 0;
    const xl = 13 - flare, xr = 23 + flare;
    for (let x = xl; x <= xr; x++) {
      let c = P.bark.base;
      if (x <= xl + 1) c = P.bark.dark;
      else if (x >= xr - 1) c = x === xr ? P.bark.hi : P.bark.light;
      else if (hash(x, Math.floor(y / 3), 9) < 0.16) c = P.bark.dark;
      g.set(x, y, c);
    }
  }
  line(g, 18, 32, 36, 13, P.bark.base, 2);
  line(g, 14, 30, 2, 12, P.bark.base, 2);
  line(g, 21, 30, 52, 16, P.bark.base, 2);
  // the perch: rises from the trunk, levels out under Crystal, thins to a tip
  const CX = 60, CY = 22, PERCH = CY + 21;
  const perchTop = (x) => (x < 66 ? Math.round(52 - ((x - 24) / 42) * 9) : x <= 84 ? PERCH : x < 90 ? PERCH : PERCH - 1);
  for (let x = 24; x <= 95; x++) {
    const th = x < 36 ? 5 : x < 52 ? 4 : x <= 84 ? 3 : x < 90 ? 2 : 1;
    const top = perchTop(x);
    for (let j = 0; j < th; j++) g.set(x, top + j, j === 0 ? P.bark.light : j === th - 1 ? P.bark.dark : P.bark.base);
  }
  for (const x of [30, 31, 41, 50, 51, 58]) {
    g.set(x, perchTop(x), P.moss.base);
    g.set(x, perchTop(x) - 1, P.moss.light);
  }
  const canopy = clumps(
    g,
    [[-2, 3, 10], [14, 0, 10], [30, 2, 9], [45, 5, 8], [57, 9, 6.5], [4, 16, 9], [19, 15, 10], [34, 17, 8], [48, 18, 6], [-3, 28, 8], [10, 29, 8], [24, 29, 7], [36, 29, 5.5]],
    P.blossom,
    L_LEFT,
    2,
  );
  for (const [x, y] of canopy) {
    const h = hash(x, y, 77);
    if (h < 0.035) g.set(x, y, P.blossom.hi);
    else if (h < 0.05) g.set(x, y, "#FFFFFF");
    else if (h < 0.065 && g.get(x, y) === P.blossom.dark) g.set(x, y, P.blossom.leaf);
  }
  clumps(g, [[95, 40, 2.4], [88, 47, 2]], P.blossom, L_LEFT, 6);

  // ground details
  flowerPatches(
    g,
    [[44, 92, 6], [70, 96, 7], [96, 90, 5], [118, 99, 7], [150, 93, 6], [172, 98, 7], [198, 91, 5], [222, 97, 6], [264, 99, 5], [132, 88, 4], [86, 101, 5], [244, 101, 4]],
    topAt,
    17,
    95,
  );
  mushroom(g, 26, 95);
  mushroom(g, 31, 98);
  mushroom(g, 246, 97);
  for (const [x, y] of [[62, 81], [90, 89], [122, 93], [178, 90], [196, 86], [232, 95]]) firefly(g, x, y);
  for (const [x, y, f] of [[44, 42], [52, 52, 1], [36, 48], [79, 58], [96, 63, 1], [66, 66], [30, 58, 1]]) petal(g, x, y, f);

  // Crystal on her branch, then the wordmark beside her (2× grain, like the app lockup)
  for (let x = CX + 8; x <= CX + 18; x++) g.set(x, PERCH, P.bark.base); // contact shadow on the bark
  crystal(g, CX, CY, "normal");
  const wm = T["Budgts"];
  const wmX = CX + 31, wmY = CY + 4;
  text(g, wm, wmX, wmY, 2, P.ink);
  return { g, wm: { x: wmX, y: wmY, w: wm.w * 2, h: wm.h * 2 } };
}

// ---------- the icon (square, survives a circle crop) ----------
/** The approved icon's 51×51 cells. `crystal: false` leaves her out, for
 * platforms that take her as a separate layer. */
export const ICON_CELLS = 51;
export function drawIcon({ crystal: withCrystal = true } = {}) {
  const N = ICON_CELLS, g = new Grid(N, N);
  const SUN = { x: 25.5, y: 30, r: 13 };
  bands(g, [[0, P.sky[0]], [6, P.sky[1]], [11, P.sky[2]], [16, P.sky[3]], [21, P.sky[4]], [26, P.sky[5]], [30, P.sky[6]], [34, P.sky[7]], [37, P.sky[8]], [40, P.sky[9]]], 0, N, 0, N, false);
  sun(g, SUN.x, SUN.y, SUN.r, P.sun, ["#FFE7A6", "#FCD3B6"]);
  cloud(g, 3, 8, [[0, 1.5], [3, 2.1], [6, 1.4]], P.cloud);
  cloud(g, 40, 6, [[0, 1.4], [3, 1.9], [6, 1.3]], P.cloud);
  mountains(g, [[2, 31, 0.9], [13, 37, 0.8], [38, 37, 0.8], [49, 31, 0.9]], 46, P.mtnFar, SUN.x);
  forest(g, 43, 5, P.forestBack, P.forestFront, 0, N, [2, 5]);
  pine(g, 3, 45, 20, P.pine, 1);
  pine(g, 10, 46, 13, P.pine, 1);
  pine(g, 47, 45, 20, P.pine, -1);
  pine(g, 40, 46, 13, P.pine, -1);
  const topAt = (x) => 41 + Math.round(((x - 25.5) / 25.5) ** 2 * 4);
  meadow(g, topAt, P.grass, 3, [0, 44, 46, 48, 50]);
  flowerPatches(g, [[6, 47, 4], [44, 47, 4], [17, 49, 3], [34, 49, 3]], topAt, 8, 46);
  mushroom(g, 7, 42);
  if (withCrystal) crystal(g, 13, 20, "normal");
  return g;
}

/** Crystal alone on a transparent (null) canvas, where drawIcon puts her. */
export function drawIconCrystal(margin = 0) {
  const N = ICON_CELLS, g = new Grid(N + 2 * margin, N + 2 * margin, margin, margin);
  g.px.fill(null);
  crystal(g, 13, 20, "normal");
  return g;
}

/** The icon's scene continued `margin` cells past every edge, for canvases
 * larger than the approved frame (Android's adaptive layers). The frame itself
 * is pasted from drawIcon, so it is the approved icon cell for cell; only the
 * margin is new. */
export function drawIconCanvas(margin, { crystal: withCrystal = true } = {}) {
  const N = ICON_CELLS, m = margin, g = new Grid(N + 2 * m, N + 2 * m, m, m);
  const SUN = { x: 25.5, y: 30, r: 13 };
  bands(g, [[0, P.sky[0]], [6, P.sky[1]], [11, P.sky[2]], [16, P.sky[3]], [21, P.sky[4]], [26, P.sky[5]], [30, P.sky[6]], [34, P.sky[7]], [37, P.sky[8]], [40, P.sky[9]]], g.minX, g.maxX, g.minY, g.maxY, false);
  sun(g, SUN.x, SUN.y, SUN.r, P.sun, ["#FFE7A6", "#FCD3B6"]);
  cloud(g, -12, 5, [[0, 1.5], [3, 2.1], [6, 1.4]], P.cloud);
  cloud(g, 56, 11, [[0, 1.4], [3, 1.9], [6, 1.3]], P.cloud);
  mountains(g, [[2, 31, 0.9], [13, 37, 0.8], [38, 37, 0.8], [49, 31, 0.9]], 46, P.mtnFar, SUN.x);
  forest(g, 43, 6, P.forestBack, P.forestFront, g.minX, g.maxX, [2, 5]);
  pine(g, -7, 46, 16, P.pine, 1);
  pine(g, 3, 45, 20, P.pine, 1);
  pine(g, 47, 45, 20, P.pine, -1);
  pine(g, 58, 46, 16, P.pine, -1);
  const topAt = (x) => 41 + Math.round(Math.min(1, ((x - 25.5) / 25.5) ** 2) * 4);
  meadow(g, topAt, P.grass, 3, [0, 44, 46, 48, 50]);
  flowerPatches(g, [[-8, 50, 3], [59, 50, 3], [10, 56, 4], [40, 57, 4], [25, 60, 3]], topAt, 9, 46);
  const frame = drawIcon({ crystal: withCrystal });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g.set(x, y, frame.get(x, y));
  return g;
}

// ---------- render: node tools/brand-art.mjs [outDir] ----------
if (import.meta.main) {
const OUT = process.argv[2] ?? join(ROOT, ".tmp", "brand-art", "out");
mkdirSync(OUT, { recursive: true });
const T = await glyphMasks(["Budgts", "TRACK : PLAN : GROW"]);

const iconImg = raster(drawIcon(), 20); // 1020×1020, then 2px of edge to make 1024
const iconPath = join(OUT, "budgts-icon-1024.png");
await sharp(await png(iconImg).toBuffer())
  .extend({ top: 2, bottom: 2, left: 2, right: 2, extendWith: "copy" })
  .png({ compressionLevel: 9 })
  .toFile(iconPath);

const { g: coverGrid, wm } = drawCover(T);
const coverImg = raster(coverGrid, COVER_GRAIN);
const tag = T["TRACK : PLAN : GROW"], k = COVER_GRAIN / 2;
const tagX = Math.round((wm.x + wm.w / 2) * COVER_GRAIN - (tag.w * k) / 2);
const tagY = (wm.y + wm.h + 4) * COVER_GRAIN;
stampFine(coverImg, tag, tagX, tagY, k, P.ink);
const coverPath = join(OUT, `budgts-facebook-cover-${coverImg.W}x${coverImg.H}.png`);
await png(coverImg).toFile(coverPath);

// ---------- previews: how Facebook shows them ----------
const circle = (s) => Buffer.from(`<svg width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="#fff"/></svg>`);
const roundIcon = (s) => sharp(iconPath).resize(s, s, { kernel: "lanczos3" }).composite([{ input: circle(s), blend: "dest-in" }]).png().toBuffer();
const desk = await sharp(coverPath).resize(820, 312, { kernel: "lanczos3" }).png().toBuffer();
const phoneW = Math.round((coverImg.W * 360) / coverImg.H);
const phone = await sharp(coverPath).resize({ height: 360, kernel: "lanczos3" }).extract({ left: Math.round(phoneW / 2 - 320), top: 0, width: 640, height: 360 }).png().toBuffer();
await sharp({ create: { width: 860, height: 820, channels: 4, background: "#f0f2f5" } })
  .composite([
    { input: desk, left: 20, top: 20 },
    { input: await roundIcon(176), left: 36, top: 20 + 312 - 110 },
    { input: phone, left: 110, top: 440 },
    { input: await roundIcon(120), left: 126, top: 440 + 360 - 80 },
  ])
  .png()
  .toFile(join(OUT, "preview-facebook.png"));
await sharp({ create: { width: 640, height: 360, channels: 4, background: "#ffffff" } })
  .composite([
    { input: await roundIcon(320), left: 20, top: 20 },
    { input: await roundIcon(170), left: 360, top: 20 },
    { input: await roundIcon(64), left: 360, top: 210 },
    { input: await roundIcon(40), left: 440, top: 222 },
  ])
  .png()
  .toFile(join(OUT, "preview-icon.png"));
console.log("cover", coverImg.W, "x", coverImg.H, "wordmark", wm, "tag", tag.w, "x", tag.h);
}

