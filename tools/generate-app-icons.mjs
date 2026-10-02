// Regenerate every app icon from the approved app icon, and the native splash
// image from the one egg source (src/lib/brand/egg-art.ts).
//
//   node tools/generate-app-icons.mjs
//
// The source of truth is the icon the owner approved on 2026-10-01,
// src/lib/brand/app-icon.png: Crystal in front of a setting sun in a pixel
// forest, drawn by tools/brand-art.mjs as 51×51 cells at 20 px a cell plus a
// 2 px copied edge (1024 px square). Never regenerate that file from code: it
// is the approved artwork. This script reads its cells back, stops unless they
// re-render to exactly the same pixels, then scales them by whole numbers
// (cropping a little edge where a size needs it) so every icon stays crisp.
// tools/brand-art.mjs is only for canvas beyond the approved frame (Android's
// adaptive layers), and those layers are checked against the master too.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { eggSvg } from "../src/lib/brand/egg-art.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MASTER = "src/lib/brand/app-icon.png";
export const CELLS = 51;
const CELL_PX = 20;
const EDGE_PX = 2;

/** The master's cells as [r, g, b] rows, once every pixel is proven to be its cell's colour. */
export async function readMasterCells(file = join(ROOT, MASTER)) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const size = CELLS * CELL_PX + 2 * EDGE_PX;
  if (info.width !== size || info.height !== size) throw new Error(`${MASTER} is ${info.width}x${info.height}, expected ${size}`);
  const at = (x, y) => {
    const o = (y * size + x) * 3;
    return [data[o], data[o + 1], data[o + 2]];
  };
  const cells = [];
  for (let y = 0; y < CELLS; y++) {
    const row = [];
    for (let x = 0; x < CELLS; x++) row.push(at(EDGE_PX + x * CELL_PX + CELL_PX / 2, EDGE_PX + y * CELL_PX + CELL_PX / 2));
    cells.push(row);
  }
  const cellOf = (v) => Math.min(CELLS - 1, Math.max(0, Math.floor((v - EDGE_PX) / CELL_PX)));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = cells[cellOf(y)][cellOf(x)], p = at(x, y);
      if (p[0] !== c[0] || p[1] !== c[1] || p[2] !== c[2]) throw new Error(`${MASTER} is not a clean cell grid at ${x},${y}`);
    }
  return cells;
}

/** Cells [x0, x0+n) × [y0, y0+n) at `scale` px a cell, with `pad` px of copied
 * edge around them (a negative pad crops instead). */
export function renderCells(cells, { scale, x0 = 0, y0 = 0, n = CELLS, pad = 0 }) {
  const size = n * scale + 2 * pad;
  const buf = Buffer.alloc(size * size * 3);
  const cellOf = (v) => Math.min(n - 1, Math.max(0, Math.floor((v - pad) / scale)));
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      const c = cells[y0 + cellOf(py)][x0 + cellOf(px)], o = (py * size + px) * 3;
      buf[o] = c[0];
      buf[o + 1] = c[1];
      buf[o + 2] = c[2];
    }
  return { buf, size };
}

// Android's adaptive icon is a 108dp canvas of which a launcher shows the
// central 72dp (masked to a circle, squircle, ...) and lets the layers drift
// for parallax. ADAPTIVE_MARGIN cells of scene continued past each edge make
// the canvas 77 cells, so the 72dp viewport shows 51.3 cells: the approved
// frame plus a sixth of a cell. Crystal is the foreground layer (transparent
// elsewhere) over her scene without her, so the parallax moves her over it.
export const ADAPTIVE_MARGIN = 13;
export const ADAPTIVE_SCALE = 14; // 77 cells × 14 px = 1078 px; Expo resizes per density
export const ADAPTIVE_LAYERS = {
  background: "mobile/assets/android-icon-background.png",
  foreground: "mobile/assets/android-icon-foreground.png",
};

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const same = (a, b) => a === b || (a !== null && b !== null && a.toLowerCase() === b.toLowerCase());

/** The adaptive icon's two layers as cell grids, once proven that at rest they
 * composite to the continued scene and that its centre is the master, cell for cell. */
export async function adaptiveLayers(cells) {
  const { drawIconCanvas, drawIconCrystal } = await import("./brand-art.mjs");
  const m = ADAPTIVE_MARGIN;
  const background = drawIconCanvas(m, { crystal: false });
  const foreground = drawIconCrystal(m);
  const scene = drawIconCanvas(m);
  for (let y = background.minY; y < background.maxY; y++)
    for (let x = background.minX; x < background.maxX; x++) {
      const b = background.get(x, y), f = foreground.get(x, y), s = scene.get(x, y);
      if (b === null) throw new Error(`adaptive background has a hole at ${x},${y}`);
      if (!same(f ?? b, s)) throw new Error(`adaptive layers do not composite to the scene at ${x},${y}`);
      if (x >= 0 && y >= 0 && x < CELLS && y < CELLS) {
        const want = cells[y][x], got = rgbOf(s);
        if (got.some((v, i) => v !== want[i])) throw new Error(`adaptive scene differs from ${MASTER} at cell ${x},${y}`);
      }
    }
  return { background, foreground };
}

export const ICONS = [
  // PWA manifest, "any" and "maskable": the scene is full-bleed and Crystal sits
  // inside the maskable 80% circle, so both purposes use the same pixels
  { out: "public/icon-512.png", scale: 10, pad: 1 }, // 510 + 2
  { out: "public/icon-maskable.png", scale: 10, pad: 1 },
  { out: "public/icon-192.png", scale: 4, pad: -6 }, // 204 − 12: 1.5 cells off each side
  { out: "public/icon-maskable-192.png", scale: 4, pad: -6 },
  // iOS home screen (opaque)
  { out: "src/app/apple-icon.png", scale: 4, pad: -12 }, // 204 − 24: 3 cells off each side
  // browser tab: Crystal and her sun, cropped tight so she still reads at 16 px
  { out: "src/app/icon.png", scale: 2, x0: 9, y0: 14, n: 32 }, // 64
  // native app (mobile/app.json): iOS app + App Store icon (opaque, no alpha,
  // as Apple requires) and Android's pre-8 launcher icon, the master itself
  { out: "mobile/assets/icon.png", scale: 20, pad: 2 }, // 1024
  // Expo web favicon: the same tight crop as the browser tab
  { out: "mobile/assets/favicon.png", scale: 2, x0: 9, y0: 14, n: 32 }, // 64
  // Google Play listing icon, uploaded by hand in Play Console: 512 px, 32-bit
  // PNG (opaque alpha), the same pixels as public/icon-512.png
  { out: "mobile/store/google-play/icon-512.png", scale: 10, pad: 1, alpha: true }, // 512
];

if (import.meta.main) {
  const cells = await readMasterCells();
  const write = async (out, img, w, channels) => {
    mkdirSync(dirname(join(ROOT, out)), { recursive: true });
    const info = await sharp(img, { raw: { width: w, height: w, channels } }).png({ compressionLevel: 9 }).toFile(join(ROOT, out));
    console.log(`${out.padEnd(44)} ${w}x${w}  ${info.size} B`);
  };
  for (const icon of ICONS) {
    const { buf, size } = renderCells(cells, icon);
    let img = buf;
    if (icon.alpha) {
      img = Buffer.alloc(size * size * 4, 255);
      for (let i = 0; i < size * size; i++) buf.copy(img, i * 4, i * 3, i * 3 + 3);
    }
    await write(icon.out, img, size, icon.alpha ? 4 : 3);
  }
  const { raster } = await import("./brand-art.mjs");
  const layers = await adaptiveLayers(cells);
  for (const [layer, out] of Object.entries(ADAPTIVE_LAYERS)) {
    const { buf, W } = raster(layers[layer], ADAPTIVE_SCALE);
    await write(out, buf, W, 4);
  }

  // The native splash image: the loading screen's resting egg (egg-art.ts,
  // frame 0) at the loader's grain, centred on a transparent SPLASH_DP square
  // over app.json's paper backgroundColor. expo-splash-screen fits the square
  // into `imageWidth` dp/pt (= SPLASH_DP) centred on the screen, as the loader
  // centres its egg, and resamples it (Lanczos, which softens pixel art) to
  // each density's size. Handing it each size ready-made makes that an exact
  // copy: Android takes one per density bucket (app.json android.mdpi …
  // xxxhdpi, ×1 to ×4: 6 to 24px a cell); iOS takes one image for @1x/@2x/@3x,
  // so it gets the @3x size (today's iPhones; @2x ones get a softened copy, a
  // platform limit). SPLASH_DP is a multiple of 4 because on Android the plugin
  // centres the square on a 288dp canvas at (288 - imageWidth) / 2 × density,
  // which must be whole pixels at hdpi (×1.5). mobile/lib/brand/splash.test.ts
  // pins app.json to these files.
  const SPLASH_GRAIN = 6; // the loader's grain (mobile/components/brand/egg-loader.tsx EGG_SCALE)
  const SPLASH_DP = 96; // the egg is 13×15 cells: 78×90dp
  for (const [name, density] of [["mdpi", 1], ["hdpi", 1.5], ["xhdpi", 2], ["xxhdpi", 3], ["xxxhdpi", 4]]) {
    const out = `mobile/assets/splash/egg-${name}.png`;
    const scale = SPLASH_GRAIN * density;
    const size = SPLASH_DP * density;
    const info = await sharp(Buffer.from(eggSvg({ size, scale })))
      .png({ palette: true, colours: 16, compressionLevel: 9, effort: 10 })
      .toFile(join(ROOT, out));
    console.log(`${out.padEnd(44)} ${size}x${size}  ${info.size} B  (imageWidth ${SPLASH_DP})`);
  }
}
