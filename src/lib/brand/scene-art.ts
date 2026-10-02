/**
 * Crystal's sunset forest as code: the scene pieces the colourful brand art is
 * drawn from (the app icon's canvas past its approved frame and the Facebook
 * cover, both composed in tools/brand-art.mjs), and the in-app backdrop: the
 * pastel sunset behind every screen of the app's tabs (option B, "Full
 * backdrop", chosen by the owner on 2026-10-02 from the brand art page's
 * mock-ups).
 *
 * A scene is a Grid of cells, one colour each. Renderers scale a cell to a
 * whole number of pixels: the backdrop is 2 CSS px / dp a cell, Crystal's
 * grain on Home, so the scene and Crystal share one grain.
 *
 * Pure data + pure functions, no imports: the web, Node (tools/) and the
 * native apps (Hermes) all run it (tests/unit/brand-purity.test.ts). Only
 * erasable TypeScript, so Node can load it by type stripping.
 */

/** A cell's colour (`#rrggbb`), or null where a layer is transparent. */
export type Cell = string | null;

// ---------- colour + randomness ----------
export const rgb = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];
const hex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number): string => {
  const A = rgb(a), B = rgb(b);
  return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};
export function hash(x: number, y: number, s = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function rng(seed: number): () => number {
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
type Pair = [string, string];
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
    edge: "#A3D26A",
    tuft: "#8CC45E",
    tip: "#C3E37E",
    bladeLight: "#8DC35E",
    bladeDark: "#3C7340",
    bands: ["#7DB657", "#6AA650", "#5B984A", "#4D8A45", "#407B42"],
  },
  moss: { base: "#6AA84A", light: "#9ACB5E" },
  flower: [
    ["#FF8FB8", "#FFE08A"],
    ["#FFD54F", "#F29A38"],
    ["#FFFFFF", "#FFD54F"],
    ["#86CDF7", "#FFFFFF"],
    ["#B98AF0", "#FFE08A"],
  ] as Pair[],
  mush: { cap: "#E54848", shade: "#B8363A", dot: "#FFF6EE", stem: "#F4E8D8", stemShade: "#D7C5B0" },
  reed: { stem: "#3F6F3B", tip: "#7A4B2E" },
  firefly: { core: "#FFF7B0", halo: "#D9E27A" },
  bird: "#545AA6",
  ink: "#111111",
};

// ---------- grid ----------
/** A w×h canvas of colours. Scenes draw in logical cells; `ox`/`oy` shift the
 * canvas so a scene can be drawn past its own frame (cells -ox … w-ox-1). */
export class Grid {
  w: number;
  h: number;
  ox: number;
  oy: number;
  px: Cell[];
  constructor(w: number, h: number, ox = 0, oy = 0) {
    this.w = w;
    this.h = h;
    this.ox = ox;
    this.oy = oy;
    this.px = new Array<Cell>(w * h).fill("#000000");
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
  in(x: number, y: number): boolean {
    return x >= this.minX && y >= this.minY && x < this.maxX && y < this.maxY;
  }
  set(x: number, y: number, c: Cell | undefined): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (c && this.in(x, y)) this.px[(y + this.oy) * this.w + x + this.ox] = c;
  }
  get(x: number, y: number): Cell {
    x = Math.floor(x);
    y = Math.floor(y);
    return this.in(x, y) ? (this.px[(y + this.oy) * this.w + x + this.ox] ?? null) : null;
  }
}

// ---------- scene pieces ----------
/** Banded fill; with `dither`, each seam row is a checkerboard of the two bands. */
export function bands(g: Grid, list: [number, string][], x0 = g.minX, x1 = g.maxX, y0 = g.minY, y1 = g.maxY, dither = true): void {
  for (let y = y0; y < y1; y++) {
    let i = 0;
    for (let b = 0; b < list.length; b++) if (y >= list[b]![0]) i = b;
    for (let x = x0; x < x1; x++) {
      const seam = dither && i > 0 && y === list[i]![0] && (x + y) % 2 === 0;
      g.set(x, y, seam ? list[i - 1]![1] : list[i]![1]);
    }
  }
}

type SunPalette = { core: string; disc: string; rim: string; glow: string };
/** The sun: a lit disc with a warm rim, and a glow that either tints the sky
 * under it (`rings` empty) or lays explicit warm rings (for a big sun that
 * crosses cool bands, where tinting would go grey). */
export function sun(g: Grid, cx: number, cy: number, r: number, pal: SunPalette, rings: string[] = []): void {
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

export function cloud(g: Grid, x0: number, base: number, puffs: [number, number][], pal: { top: string; body: string; lit: string }): void {
  const S = new Set<string>(), key = (x: number, y: number) => `${x},${y}`;
  for (const [dx, r] of puffs) {
    const cx = x0 + dx, cy = base - r + 1;
    for (let y = Math.floor(cy - r); y <= base; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++)
        if (Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.25) <= r) S.add(key(x, y));
  }
  for (const k of S) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    const below = S.has(key(x, y + 1)), above = S.has(key(x, y - 1));
    g.set(x, y, !below ? pal.lit : !above ? pal.top : pal.body);
  }
}

export function mountains(g: Grid, peaks: [number, number, number][], baseY: number, pal: { body: string; lit: string; ridge: string }, sunX: number): void {
  for (let x = g.minX; x < g.maxX; x++) {
    let top = Infinity, pk = peaks[0]!;
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

type PinePixel = { x: number; y: number; rel: number; f: number; tier: number; edge: boolean };
/** Pixels of a pine: far ones are plain stepped triangles, near ones stack tiers. */
export function pinePixels(cx: number, baseY: number, h: number, near = false): PinePixel[] {
  const pts: PinePixel[] = [], top = baseY - h;
  if (!near) {
    for (let i = 0; i < h; i++) {
      const hw = Math.floor(i / 2);
      for (let dx = -hw; dx <= hw; dx++) pts.push({ x: cx + dx, y: top + i, rel: 0, f: 0, tier: 0, edge: false });
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

export function pine(g: Grid, cx: number, baseY: number, h: number, pal: { dark: string; base: string; light: string; hi: string; trunk: string }, lx: number): void {
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
export function forest(g: Grid, baseY: number, seed: number, back: string, front: string, x0 = g.minX, x1 = g.maxX, spire: [number, number] = [3, 8]): void {
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
export function clumps(g: Grid, list: [number, number, number][], pal: { dark: string; base: string; light: string; hi: string }, L: [number, number], seed = 1): [number, number][] {
  const n = Math.hypot(L[0], L[1]), Lx = L[0] / n, Ly = L[1] / n, drawn: [number, number][] = [];
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

export function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: string, th = 1): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let a = 0; a < th; a++) for (let b = 0; b < th; b++) g.set(x + a, y + b, c);
  }
}

type GrassPalette = typeof P.grass;
export function meadow(g: Grid, topAt: (x: number) => number, pal: GrassPalette, seed: number, bandRows: number[]): void {
  const list = bandRows.map((row, i): [number, string] => [row, pal.bands[i]!]);
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

export function flower(g: Grid, x: number, y: number, big: boolean, [petal, center]: Pair): void {
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
export function flowerPatches(g: Grid, centres: [number, number, number][], topAt: (x: number) => number, seed: number, bigFrom: number): void {
  const r = rng(seed);
  for (const [cx, cy, n] of centres) {
    const a = P.flower[Math.floor(r() * P.flower.length)]!, b = P.flower[Math.floor(r() * P.flower.length)]!;
    for (let i = 0; i < n; i++) {
      const x = Math.round(cx + (r() - 0.5) * 9), y = Math.round(cy + (r() - 0.5) * 4);
      if (y < topAt(x) + 2 || y > g.maxY - 2) continue;
      flower(g, x, y, y >= bigFrom, r() < 0.6 ? a : b);
    }
  }
}

export function mushroom(g: Grid, x: number, y: number): void {
  const m = P.mush;
  const rows = [".RR.", "RWRR", "rRRr", ".SS.", ".sS."];
  const key: Record<string, string> = { R: m.cap, r: m.shade, W: m.dot, S: m.stem, s: m.stemShade };
  rows.forEach((row, dy) => [...row].forEach((k, dx) => k !== "." && g.set(x + dx, y + dy, key[k])));
}

export function firefly(g: Grid, x: number, y: number): void {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
    g.set(x + dx, y + dy, mix(g.get(x + dx, y + dy) ?? P.firefly.halo, P.firefly.halo, 0.6));
  g.set(x, y, P.firefly.core);
}

export function petal(g: Grid, x: number, y: number, flip: boolean | number = false): void {
  g.set(x, y, P.blossom.hi);
  g.set(x + (flip ? -1 : 1), y + 1, P.blossom.light);
}

export function bird(g: Grid, x: number, y: number): void {
  g.set(x - 1, y - 1, P.bird);
  g.set(x, y, P.bird);
  g.set(x + 1, y - 1, P.bird);
}

// ---------- the in-app backdrop (option B: "Full backdrop") ----------
/** CSS px (web) or dp (apps) a cell: Crystal's grain on Home. */
export const BACKDROP_CELL = 2;
/** The meadow's top edge sits this far above the tab bar's top edge, so the
 * forest and the lake show just above the bar (the approved mock-up: 390×844,
 * a 69 px bar, the meadow at 752 px). */
export const BACKDROP_LAND_GAP = 23;
/** The cover's sky, lifted to pastel so the app's ink text keeps its contrast
 * on it: the top band behind the header, down to the sun-warmed horizon. */
export const BACKDROP_SKY = ["#BCC6F3", "#C7CBF3", "#D2CEF2", "#DDD1EF", "#E8D3EB", "#F1D6E5", "#F7D9DC", "#FADDD0", "#FBE2C4", "#FCE7BC"];
/** Secondary text straight on the backdrop (never on a white surface): the
 * gray --muted is under 4.5:1 on the upper bands; this holds it on every band. */
export const BACKDROP_MUTED = "#4B4660";
const MTN = { body: "#C6B8E6", lit: "#E6C4DA", ridge: "#F4D3DE" };
const MTN2 = { body: "#B1A5DC", lit: "#D3B4D6", ridge: "#E8C5D6" };
const WATER = ["#EACBDC", "#D6C8EE", "#C3C2EC", "#B1B8E8", "#A3AEE4"];
const FOREST_BACK = "#9E9BD6";
const FOREST_FRONT = "#8A8CCB";
const FOREST_SHADOW = "#9496CF";
const LAKE_ROWS = 12; // the lake between the far shore and the meadow
const PINE_TALL = 40; // the edge pines, in cells

/** The backdrop's grid for a `width`×`height` viewport whose bottom
 * `bottomInset` px are covered by the tab bar (0 where there is none). */
export function backdropSize(width: number, height: number, bottomInset: number): { cols: number; rows: number; land: number } {
  const cols = Math.ceil(width / BACKDROP_CELL), rows = Math.ceil(height / BACKDROP_CELL);
  return { cols, rows, land: rows - Math.round((bottomInset + BACKDROP_LAND_GAP) / BACKDROP_CELL) };
}

/** The whole-screen sunset: banded pastel sky with clouds, birds and a low
 * sun; lilac mountains and a forest edge on the far shore; a lake; the meadow
 * from row `land` down, with flowers, a toadstool and fireflies; pines at both
 * edges. Content scrolls over it; only its edges and gaps show. */
export function drawBackdrop(cols: number, rows: number, land: number): Grid {
  const W = cols, g = new Grid(W, rows);
  const shore = land - LAKE_ROWS; // the far shore: water between it and the meadow
  const step = (shore + 2) / BACKDROP_SKY.length;
  bands(g, BACKDROP_SKY.map((c, i): [number, string] => [Math.round(i * step), c]), 0, W, 0, rows, false);
  const SUN = { x: Math.round(W * 0.66), y: shore - 1, r: 9 };
  sun(g, SUN.x, SUN.y, SUN.r, P.sun);
  const r = rng(1);
  for (const [x, y] of [[W * 0.42, Math.round(shore * 0.18)], [W * 0.82, Math.round(shore * 0.42)], [W * 0.12, Math.round(shore * 0.55)]] as const)
    cloud(g, Math.round(x), y, [[0, 1.5], [4, 2.3 + r() * 0.6], [8, 1.6]], P.cloud);
  bird(g, Math.round(W * 0.72), Math.round(shore * 0.3));
  bird(g, Math.round(W * 0.76), Math.round(shore * 0.26));
  mountains(g, [[W * 0.1, shore - 17, 0.7], [W * 0.42, shore - 9, 0.6], [W * 0.86, shore - 15, 0.65], [W * 1.05, shore - 22, 0.7]], shore, MTN, SUN.x);
  mountains(g, [[W * 0.25, shore - 6, 0.5], [W * 0.95, shore - 7, 0.55]], shore, MTN2, SUN.x);
  forest(g, shore, 11, FOREST_BACK, FOREST_FRONT, 0, W, [3, 7]);
  // the lake: warm at the far shore, bluer toward us, the forest's shadow, the sun's path
  bands(g, WATER.map((c, i): [number, string] => [shore + 1 + i * 2, c]), 0, W, shore + 1, land + 1, false);
  for (let x = 0; x < W; x++) if (g.get(x, shore) === FOREST_FRONT) g.set(x, shore + 1, FOREST_SHADOW);
  for (let y = shore + 1; y < land; y++) {
    const spread = 1.5 + (y - shore) * 0.5;
    for (let k = 0; k < 2; k++) {
      const len = 2 + Math.floor(r() * 3), x0 = Math.round(SUN.x - spread + r() * spread * 2 - len / 2);
      for (let i = 0; i < len; i++) g.set(x0 + i, y, (y + k) % 3 ? P.sun.glow : P.sun.disc);
    }
  }
  const topAt = (x: number) => land + Math.round(Math.sin(x * 0.08 + 1) * 1.1);
  meadow(g, topAt, P.grass, 7, [0, land + 4, land + 8, land + 12, land + 16]);
  clumps(g, [[W * 0.05, land - 1, 4], [W * 0.12, land, 3.5]], P.leaf, [0.8, -0.6], 3);
  clumps(g, [[W * 0.83, land - 1, 3.5]], P.leaf, [-0.8, -0.6], 4);
  pine(g, W - 9, land + 4, PINE_TALL, P.pine, -1);
  pine(g, W - 1, land + 6, PINE_TALL + 10, P.pine, -1);
  pine(g, 4, land + 6, PINE_TALL - 6, P.pine, 1);
  flowerPatches(g, [[W * 0.2, land + 6, 5], [W * 0.5, land + 9, 6], [W * 0.75, land + 5, 4], [W * 0.35, land + 14, 5], [W * 0.62, land + 16, 5]], topAt, 17, land + 9);
  mushroom(g, Math.round(W * 0.9), land + 2);
  for (const [x, y] of [[W * 0.3, land - 3], [W * 0.56, land + 3]] as const) firefly(g, Math.round(x), Math.round(y));
  for (const [x, y, f] of [[W * 0.18, shore - 14, 0], [W * 0.27, shore - 4, 1]] as const) petal(g, Math.round(x), Math.round(y), f);
  return g;
}

// ---------- renderers' input ----------
/** A solid block of cells: x, y, width, height (cells, from the grid's corner). */
export type CellRect = [x: number, y: number, w: number, h: number];

/** The grid as solid rectangles, grouped by colour: each row's runs of one
 * colour, stretched down while the run below is the same. Every opaque cell
 * is covered exactly once; transparent cells are left out. */
export function sceneRects(g: Grid): Map<string, CellRect[]> {
  const out = new Map<string, CellRect[]>();
  let open = new Map<string, CellRect>(); // runs of the row above, by x, width and colour
  for (let y = 0; y < g.h; y++) {
    const next = new Map<string, CellRect>();
    for (let x = 0; x < g.w; ) {
      const c = g.px[y * g.w + x] ?? null;
      let e = x + 1;
      while (e < g.w && (g.px[y * g.w + e] ?? null) === c) e++;
      if (c !== null) {
        const key = `${x},${e - x},${c}`;
        const above = open.get(key);
        if (above) {
          above[3] += 1;
          next.set(key, above);
        } else {
          const rect: CellRect = [x, y, e - x, 1];
          next.set(key, rect);
          const list = out.get(c);
          if (list) list.push(rect);
          else out.set(c, [rect]);
        }
      }
      x = e;
    }
    open = next;
  }
  return out;
}

/** SVG path data for a list of cell rects, `cell` units a cell. */
export function rectsPath(rects: CellRect[], cell: number): string {
  let d = "";
  for (const [x, y, w, h] of rects) d += `M${x * cell} ${y * cell}h${w * cell}v${h * cell}h${-w * cell}z`;
  return d;
}

/** The grid as RGBA bytes, one pixel a cell (a canvas's ImageData); transparent cells stay 0. */
export function sceneRgba(g: Grid): Uint8ClampedArray {
  const out = new Uint8ClampedArray(g.w * g.h * 4);
  const cache = new Map<string, [number, number, number]>();
  for (let i = 0; i < g.px.length; i++) {
    const c = g.px[i];
    if (!c) continue;
    let v = cache.get(c);
    if (!v) cache.set(c, (v = rgb(c)));
    out[i * 4] = v[0];
    out[i * 4 + 1] = v[1];
    out[i * 4 + 2] = v[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}
