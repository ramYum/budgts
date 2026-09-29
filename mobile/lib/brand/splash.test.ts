import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EGG_SCALE } from "../../components/brand/egg-loader";
import { COLOR, EGG_FRAMES } from "./shared";

/**
 * The native splash is the loading screen's first frame: the same resting
 * egg, the same size, on the same paper (app.json → expo-splash-screen; the
 * images come from tools/generate-app-icons.mjs). And the launcher icons are
 * today's Crystal on paper.
 */

const appRoot = join(__dirname, "..", "..");
const expo = JSON.parse(readFileSync(join(appRoot, "app.json"), "utf8")).expo;
const pngSize = (file: string) => {
  const b = readFileSync(join(appRoot, file));
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};
const splash = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === "expo-splash-screen")?.[1];

describe("native splash", () => {
  it("is configured, on the paper canvas", () => {
    expect(splash).toBeDefined();
    expect(splash.backgroundColor.toLowerCase()).toBe(COLOR.paper);
  });

  it("is as wide as the loader's egg box, so the egg lands at the same size", () => {
    const rest = EGG_FRAMES[0]!;
    expect(splash.imageWidth).toBe(Math.max(rest.w, rest.h) * EGG_SCALE);
  });

  it("hands every Android density its own exact size (no resampling of the pixel art)", () => {
    const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as const;
    for (const [bucket, d] of Object.entries(densities)) {
      const file = splash.android[bucket];
      expect(existsSync(join(appRoot, file)), file).toBe(true);
      expect(pngSize(file), bucket).toEqual({ width: splash.imageWidth * d, height: splash.imageWidth * d });
    }
    // iOS takes one image for every scale: the @3x size
    expect(pngSize(splash.image)).toEqual({ width: splash.imageWidth * 3, height: splash.imageWidth * 3 });
  });
});

describe("launcher icons", () => {
  it("are today's art on paper, with a themed (monochrome) Android icon", () => {
    expect(pngSize(expo.icon)).toEqual({ width: 1024, height: 1024 });
    const adaptive = expo.android.adaptiveIcon;
    expect(adaptive.backgroundColor.toLowerCase()).toBe(COLOR.paper);
    for (const file of [adaptive.foregroundImage, adaptive.monochromeImage]) expect(existsSync(join(appRoot, file)), file).toBe(true);
    expect(adaptive.backgroundImage).toBeUndefined();
  });
});
