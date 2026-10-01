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
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const require = createRequire(join(ROOT, "package.json"));
const sharp = require("sharp");
const { ROBIN_ART } = await import(pathToFileURL(join(ROOT, "src/lib/brand/robin-art.ts")).href);

// ---------- colour + randomness ----------
const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => {
  const A = rgb(a), B = rgb(b);
  return hex(...A.map((v, i) => v + (B[i] - v) * t));
};
function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- palette ----------
export const P = {
  sky: ["#5468C4", "#6A7DD2", "#8590DC", "#A3A3E3", "#C0ADE3", "#DCB4DD", "#F0BCCF", "#F6B3AE", "#F9BE9C", "#FBCB92"],
  sun: { core: "#FFF3BF", disc: "#FFDD72", rim: "#FFBF4D", glow: "#FFE9A8" },
  cloud: { top: "#D7AEDD", body: "#F3C3D9", lit: "#FFE4D9" },
  mtnFar: { body: "#B4A2D8", lit: "#DDB0CB", ridge: "#F2C4CE" },
  mtnNear: { body: "#9486C7", lit: "#BE9AC6", ridge: "#DDB0C9" },
  forestBack: "#7E7CC0",
  forestFront: "#666DB2",
  water: ["#D3AECF", "#B7A7DD", "#9A9FDE", "#8290D8", "#7083D0"],
  waterShade: "#6A70B4",
  waterGlint: "#F4F0FF",
  pine: { dark: "#1E5552", base: "#2A7566", light: "#3F9877", hi: "#7CC48A", trunk: "#4B3229" },
  leaf: { dark: "#2B6B44", base: "#3E8F4E", light: "#62B15A", hi: "#A6D877" },
  blossom: { dark: "#CF6E98", base: "#EE90B4", light: "#F7B5CD", hi: "#FEDCE8", leaf: "#5FA65A" },
  bark: { dark: "#4B3229", base: "#6E4B3A", light: "#93694C", hi: "#B4865F" },
  grass: {
    edge: "#A3D26A", tuft: "#8CC45E", tip: "#C3E37E", bladeLight: "#8DC35E", bladeDark: "#3C7340",
    bands: ["#7DB657", "#6AA650", "#5B984A", "#4D8A45", "#407B42"],
  },
  moss: { base: "#6AA84A", light: "#9ACB5E" },
  flower: [
    ["#FF8FB8", "#FFE08A"],
    ["#FFD54F", "#F29A38"],
    ["#FFFFFF", "#FFD54F"],
    ["#86CDF7", "#FFFFFF"],
    ["#B98AF0", "#FFE08A"],
  ],
  mush: { cap: "#E54848", shade: "#B8363A", dot: "#FFF6EE", stem: "#F4E8D8", stemShade: "#D7C5B0" },
  reed: { stem: "#3F6F3B", tip: "#7A4B2E" },
  firefly: { core: "#FFF7B0", halo: "#D9E27A" },
  bird: "#545AA6",
  ink: "#111111",
};

// ---------- grid ----------
/** A w×h canvas of hex colours. Scenes draw in logical cells; `ox`/`oy` shift
 * the canvas so a scene can be drawn past its own frame (cells -ox … w-ox-1). */
export class Grid {
  constructor(w, h, ox = 0, oy = 0) {
    this.w = w;
    this.h = h;
    this.ox = ox;
    this.oy = oy;
    this.px = new Array(w * h).fill("#000000");
  }
  get minX() {
    return -this.ox;
  }
  get maxX() {
    return this.w - this.ox;
  }
  get minY() {
    return -this.oy;
  }
  get maxY() {
    return this.h - this.oy;
  }
  in(x, y) {
    return x >= this.minX && y >= this.minY && x < this.maxX && y < this.maxY;
  }
  set(x, y, c) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (c && this.in(x, y)) this.px[(y + this.oy) * this.w + x + this.ox] = c;
  }
  get(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    return this.in(x, y) ? this.px[(y + this.oy) * this.w + x + this.ox] : null;
  }
}

// ---------- scene pieces ----------
/** Banded fill; with `dither`, each seam row is a checkerboard of the two bands. */
function bands(g, list, x0 = g.minX, x1 = g.maxX, y0 = g.minY, y1 = g.maxY, dither = true) {
  for (let y = y0; y < y1; y++) {
    let i = 0;
    for (let b = 0; b < list.length; b++) if (y >= list[b][0]) i = b;
    for (let x = x0; x < x1; x++) {
      const seam = dither && i > 0 && y === list[i][0] && (x + y) % 2 === 0;
      g.set(x, y, seam ? list[i - 1][1] : list[i][1]);
    }
  }
}

/** The sun: a lit disc with a warm rim, and a glow that either tints the sky
 * under it (`rings` empty) or lays explicit warm rings (for a big sun that
 * crosses cool bands, where tinting would go grey). */
function sun(g, cx, cy, r, pal, rings = []) {
  const R = r + Math.max(5, rings.length * 2);
  for (let y = Math.floor(cy - R); y <= cy + R; y++)
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const under = g.get(x, y);
      if (!under) continue;
      if (d <= r) {
        const dc = Math.hypot(x + 0.5 - (cx - r * 0.12), y + 0.5 - (cy - r * 0.12));
        g.set(x, y, dc <= r * 0.72 ? pal.core : d > r - 1.2 && y + 0.5 > cy - r * 0.2 ? pal.rim : pal.disc);
      } else if (rings.length) {
        const i = Math.floor((d - r) / 2);
        if (i < rings.length) g.set(x, y, rings[i]);
      } else if (d <= r + 2) g.set(x, y, mix(under, pal.glow, 0.55));
      else if (d <= r + 5) g.set(x, y, mix(under, pal.glow, 0.28));
    }
}

function cloud(g, x0, base, puffs, pal) {
  const S = new Set(), key = (x, y) => `${x},${y}`;
  for (const [dx, r] of puffs) {
    const cx = x0 + dx, cy = base - r + 1;
    for (let y = Math.floor(cy - r); y <= base; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++)
        if (Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.25) <= r) S.add(key(x, y));
  }
  for (const k of S) {
    const [x, y] = k.split(",").map(Number);
    const below = S.has(key(x, y + 1)), above = S.has(key(x, y - 1));
    g.set(x, y, !below ? pal.lit : !above ? pal.top : pal.body);
  }
}

function mountains(g, peaks, baseY, pal, sunX) {
  for (let x = g.minX; x < g.maxX; x++) {
    let top = Infinity, pk = null;
    for (const p of peaks) {
      const t = p[1] + Math.abs(x + 0.5 - p[0]) * p[2];
      if (t < top) {
        top = t;
        pk = p;
      }
    }
    top = Math.round(top);
    const lit = pk[0] <= sunX ? x + 0.5 > pk[0] : x + 0.5 < pk[0];
    for (let y = top; y <= baseY; y++) g.set(x, y, lit ? (y === top ? pal.ridge : pal.lit) : pal.body);
  }
}

/** Pixels of a pine: far ones are plain stepped triangles, near ones stack tiers. */
function pinePixels(cx, baseY, h, near = false) {
  const pts = [], top = baseY - h;
  if (!near) {
    for (let i = 0; i < h; i++) {
      const hw = Math.floor(i / 2);
      for (let dx = -hw; dx <= hw; dx++) pts.push({ x: cx + dx, y: top + i });
    }
    return pts;
  }
  const T = Math.max(2, Math.round(h / 8)), tierH = h / T, maxHW = h * 0.3;
  for (let i = 0; i < h; i++) {
    const tier = Math.min(T - 1, Math.floor(i / tierH));
    const f = (i - tier * tierH) / tierH;
    const a0 = tier === 0 ? 0 : (tier / T) * maxHW * 0.55;
    const a1 = ((tier + 1) / T) * maxHW;
    const hw = Math.round(a0 + (a1 - a0) * f);
    for (let dx = -hw; dx <= hw; dx++)
      pts.push({ x: cx + dx, y: top + i, rel: hw ? dx / hw : 0, f, tier, edge: Math.abs(dx) === hw });
  }
  return pts;
}

function pine(g, cx, baseY, h, pal, lx) {
  for (const p of pinePixels(cx, baseY, h, true)) {
    const s = p.rel * lx;
    let c = pal.base;
    if (p.tier > 0 && p.f < 0.18 && Math.abs(p.rel) < 0.75) c = pal.dark;
    else if (s < -0.3) c = pal.dark;
    else if (s > 0.35) c = p.edge && p.f > 0.55 ? pal.hi : pal.light;
    g.set(p.x, p.y, c);
  }
  g.set(cx, baseY, pal.trunk);
  g.set(cx, baseY + 1, pal.trunk);
}

/** A distant forest edge: sparse pine spires behind a line of rounded crowns. */
function forest(g, baseY, seed, back, front, x0 = g.minX, x1 = g.maxX, spire = [3, 8]) {
  const r = rng(seed);
  for (let x = x0 - 3; x < x1 + 3; ) {
    const h = spire[0] + Math.floor(r() * (spire[1] - spire[0] + 1));
    for (const p of pinePixels(x, baseY - 1, h)) if (p.x >= x0 && p.x < x1) g.set(p.x, p.y, back);
    x += 3 + Math.floor(r() * 5);
  }
  for (let x = x0 - 2; x < x1 + 2; ) {
    const rad = 1.6 + r() * 1.8;
    for (let y = Math.floor(baseY - rad); y <= baseY; y++)
      for (let xx = Math.floor(x - rad); xx <= x + rad; xx++)
        if (xx >= x0 && xx < x1 && Math.hypot(xx + 0.5 - x, (y + 0.5 - baseY) * 1.3) <= rad) g.set(xx, y, front);
    x += 2 + Math.floor(r() * 3);
  }
  for (let x = x0; x < x1; x++) g.set(x, baseY, front);
}

/** Leafy clumps shaded toward the light; returns the pixels drawn. */
function clumps(g, list, pal, L, seed = 1) {
  const n = Math.hypot(L[0], L[1]), Lx = L[0] / n, Ly = L[1] / n, drawn = [];
  for (const [cx, cy, r] of list)
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
        if (d > r) continue;
        if (d > r - 1 && hash(x, y, seed) < 0.3) continue;
        const s = (dx * Lx + dy * Ly) / r;
        g.set(x, y, s > 0.5 ? pal.hi : s > 0.12 ? pal.light : s > -0.42 ? pal.base : pal.dark);
        drawn.push([x, y]);
      }
  return drawn;
}

function line(g, x0, y0, x1, y1, c, th = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let a = 0; a < th; a++) for (let b = 0; b < th; b++) g.set(x + a, y + b, c);
  }
}

function meadow(g, topAt, pal, seed, bandRows) {
  const list = bandRows.map((row, i) => [row, pal.bands[i]]);
  for (let x = g.minX; x < g.maxX; x++) {
    const t = topAt(x);
    bands(g, list, x, x + 1, t, g.maxY);
    g.set(x, t, pal.edge);
  }
  for (let x = g.minX; x < g.maxX; x++) {
    const t = topAt(x);
    for (let y = t + 2; y < g.maxY; y++) {
      const r = hash(x, y, seed);
      if (r < 0.04) {
        g.set(x, y, pal.bladeLight);
        g.set(x, y - 1, pal.bladeLight);
      } else if (r < 0.075) g.set(x, y, pal.bladeDark);
    }
    const r = hash(x, 999, seed);
    if (r < 0.3) g.set(x, t - 1, pal.tuft);
    if (r < 0.07) g.set(x, t - 2, pal.tip);
  }
}

function flower(g, x, y, big, [petal, center]) {
  if (big) {
    g.set(x, y + 2, P.grass.bladeDark);
    g.set(x - 1, y, petal);
    g.set(x + 1, y, petal);
    g.set(x, y - 1, petal);
    g.set(x, y + 1, petal);
    g.set(x, y, center);
  } else {
    g.set(x, y, petal);
    g.set(x, y + 1, P.grass.bladeDark);
  }
}

/** Flowers grow in patches: a few of one or two colours around each centre. */
function flowerPatches(g, centres, topAt, seed, bigFrom) {
  const r = rng(seed);
  for (const [cx, cy, n] of centres) {
    const a = P.flower[Math.floor(r() * P.flower.length)], b = P.flower[Math.floor(r() * P.flower.length)];
    for (let i = 0; i < n; i++) {
      const x = Math.round(cx + (r() - 0.5) * 9), y = Math.round(cy + (r() - 0.5) * 4);
      if (y < topAt(x) + 2 || y > g.maxY - 2) continue;
      flower(g, x, y, y >= bigFrom, r() < 0.6 ? a : b);
    }
  }
}

function mushroom(g, x, y) {
  const m = P.mush;
  const rows = [".RR.", "RWRR", "rRRr", ".SS.", ".sS."];
  const key = { R: m.cap, r: m.shade, W: m.dot, S: m.stem, s: m.stemShade };
  rows.forEach((row, dy) => [...row].forEach((k, dx) => k !== "." && g.set(x + dx, y + dy, key[k])));
}

function firefly(g, x, y) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    g.set(x + dx, y + dy, mix(g.get(x + dx, y + dy) ?? P.firefly.halo, P.firefly.halo, 0.6));
  g.set(x, y, P.firefly.core);
}

function petal(g, x, y, flip) {
  g.set(x, y, P.blossom.hi);
  g.set(x + (flip ? -1 : 1), y + 1, P.blossom.light);
}

function bird(g, x, y) {
  g.set(x - 1, y - 1, P.bird);
  g.set(x, y, P.bird);
  g.set(x + 1, y - 1, P.bird);
}

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

// The scenes' building blocks, for scenes composed elsewhere (in-app backdrops).
export { bands, sun, cloud, mountains, forest, pine, clumps, line, meadow, flowerPatches, flower, mushroom, firefly, petal, bird, crystal, mix, hash, rng };
