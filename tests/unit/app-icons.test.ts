// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";

// Every web icon is the approved app icon (src/lib/brand/app-icon.png: 51×51
// cells at 20 px a cell plus a 2 px edge) scaled by a whole number, never
// redrawn or resampled. Regenerate with `node tools/generate-app-icons.mjs`.
const MASTER = "src/lib/brand/app-icon.png";

async function pixels(file: string) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const o = (y * info.width + x) * 4;
    return (data[o]! << 16) | (data[o + 1]! << 8) | data[o + 2]!;
  };
  const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]!;
  return { width: info.width, height: info.height, channels: info.channels, at, alpha };
}

const ICONS = [
  { file: "public/icon-512.png", size: 512, scale: 10, pad: 1, x0: 0, y0: 0 },
  { file: "public/icon-maskable.png", size: 512, scale: 10, pad: 1, x0: 0, y0: 0 },
  { file: "public/icon-192.png", size: 192, scale: 4, pad: -6, x0: 0, y0: 0 },
  { file: "public/icon-maskable-192.png", size: 192, scale: 4, pad: -6, x0: 0, y0: 0 },
  { file: "src/app/apple-icon.png", size: 180, scale: 4, pad: -12, x0: 0, y0: 0 },
  { file: "src/app/icon.png", size: 64, scale: 2, pad: 0, x0: 9, y0: 14 },
  { file: "mobile/assets/icon.png", size: 1024, scale: 20, pad: 2, x0: 0, y0: 0 },
  { file: "mobile/assets/favicon.png", size: 64, scale: 2, pad: 0, x0: 9, y0: 14 },
  { file: "mobile/store/google-play/icon-512.png", size: 512, scale: 10, pad: 1, x0: 0, y0: 0 },
];

// Android's adaptive layers: 77 cells (the 51 approved plus 13 of continued
// scene a side) at 14 px a cell. Crystal is the foreground, her scene the background.
const ADAPTIVE = { cells: 77, margin: 13, scale: 14 };
const FOREGROUND = "mobile/assets/android-icon-foreground.png";
const BACKGROUND = "mobile/assets/android-icon-background.png";

describe("app icons", () => {
  it.each(ICONS)("$file is the approved icon at $scale px a cell", async ({ file, size, scale, pad, x0, y0 }) => {
    const master = await pixels(MASTER);
    const icon = await pixels(file);
    expect([icon.width, icon.height]).toEqual([size, size]);
    const n = Math.round((size - 2 * pad) / scale);
    const cellOf = (v: number) => Math.min(n - 1, Math.max(0, Math.floor((v - pad) / scale)));
    let mismatches = 0;
    for (let py = 0; py < size; py++)
      for (let px = 0; px < size; px++) {
        const cx = x0 + cellOf(px), cy = y0 + cellOf(py);
        if (icon.at(px, py) !== master.at(2 + cx * 20 + 10, 2 + cy * 20 + 10)) mismatches++;
        if (icon.alpha(px, py) !== 255) mismatches++;
      }
    expect(mismatches).toBe(0);
  });

  it("the iOS / App Store icon has no alpha channel", async () => {
    expect((await sharp("mobile/assets/icon.png").metadata()).channels).toBe(3);
  });

  it("the Android adaptive layers composite to the approved icon at rest, inside a continued scene", async () => {
    const master = await pixels(MASTER);
    const fg = await pixels(FOREGROUND);
    const bg = await pixels(BACKGROUND);
    const size = ADAPTIVE.cells * ADAPTIVE.scale;
    for (const layer of [fg, bg]) expect([layer.width, layer.height]).toEqual([size, size]);
    let problems = 0, crystal = 0;
    for (let cy = 0; cy < ADAPTIVE.cells; cy++)
      for (let cx = 0; cx < ADAPTIVE.cells; cx++) {
        const x0 = cx * ADAPTIVE.scale, y0 = cy * ADAPTIVE.scale;
        const fa = fg.alpha(x0, y0), fc = fg.at(x0, y0), bc = bg.at(x0, y0);
        // every cell is one flat colour in both layers: no resampling
        for (let j = 0; j < ADAPTIVE.scale; j++)
          for (let i = 0; i < ADAPTIVE.scale; i++) {
            if (bg.alpha(x0 + i, y0 + j) !== 255 || bg.at(x0 + i, y0 + j) !== bc) problems++;
            const a = fg.alpha(x0 + i, y0 + j);
            if (a !== fa || (a === 255 && fg.at(x0 + i, y0 + j) !== fc)) problems++;
          }
        if (fa !== 0 && fa !== 255) problems++;
        if (fa === 255) crystal++;
        const ax = cx - ADAPTIVE.margin, ay = cy - ADAPTIVE.margin;
        const inFrame = ax >= 0 && ay >= 0 && ax < 51 && ay < 51;
        if (fa === 255 && !inFrame) problems++; // Crystal stays inside the approved frame
        if (inFrame && (fa === 255 ? fc : bc) !== master.at(2 + ax * 20 + 10, 2 + ay * 20 + 10)) problems++;
      }
    expect(problems).toBe(0);
    expect(crystal).toBeGreaterThan(0);
  });
});
