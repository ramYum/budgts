// Regenerate every app icon from the one robin source (src/lib/brand/robin-art.ts),
// and the native splash image from the one egg source (src/lib/brand/egg-art.ts).
//
//   node tools/generate-app-icons.mjs
//
// Pixel art only stays crisp at whole-number scales, so each icon picks an
// integer px-per-cell and centers the 26×22-cell bird on the canvas. The
// maskable variants keep the bird inside the 80% safe zone. Requires Node 22.18+
// (type stripping, to import the .ts art modules) and sharp (a Next dependency).
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { robinSvg } from "../src/lib/brand/robin-art.ts";
import { eggSvg } from "../src/lib/brand/egg-art.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANVAS = "#f4f4f4";

// Crystal's darks: what the Android themed (monochrome) icon keeps, so she
// reads as an outlined bird with a dark cap, back, wing and tail, her breast
// and belly left open. The launcher tints it; only the alpha matters.
const MONO_KEEP = ["#111111", "#7b4a2b", "#a8703f", "#3b2a20", "#5b5b5b"];
const monochrome = (svg) =>
  svg.replace(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" fill="(#[0-9a-f]{6})"\/>/g, (rect, fill) =>
    MONO_KEEP.includes(fill) ? rect.replace(fill, "#ffffff") : "",
  );

const ICONS = [
  // manifest "any": bird fills ~70% of a light square
  { out: "public/icon-512.png", size: 512, scale: 14, background: CANVAS },
  { out: "public/icon-192.png", size: 192, scale: 5, background: CANVAS },
  // manifest "maskable": bird inside the 80% safe-zone circle
  { out: "public/icon-maskable.png", size: 512, scale: 11, background: CANVAS },
  { out: "public/icon-maskable-192.png", size: 192, scale: 4, background: CANVAS },
  // iOS home screen (no transparency allowed)
  { out: "src/app/apple-icon.png", size: 180, scale: 5, background: CANVAS },
  // browser tab: transparent, tight
  { out: "src/app/icon.png", size: 64, scale: 2 },
  // The native apps (mobile/app.json). The store and iOS icon: opaque paper,
  // the bird at ~71% of the square like icon-512.
  { out: "mobile/assets/icon.png", size: 1024, scale: 28, background: CANVAS, opaque: true },
  // Android adaptive icon: launchers mask the 108dp layer to their shape and
  // keep only the middle 66dp circle safe (61% of the canvas). The bird's box
  // (26×22 cells at 18px: 468×396, a 613px diagonal) fits inside that circle;
  // the layer behind is app.json's backgroundColor, paper.
  { out: "mobile/assets/android-icon-foreground.png", size: 1024, scale: 18 },
  // Android 13+ themed icon: the same place, her darks only (MONO_KEEP).
  { out: "mobile/assets/android-icon-monochrome.png", size: 1024, scale: 18, mono: true },
];

for (const { out, size, scale, background, opaque, mono } of ICONS) {
  const svg = robinSvg({ size, scale, background });
  let img = sharp(Buffer.from(mono ? monochrome(svg) : svg));
  if (opaque) img = img.flatten({ background }).removeAlpha();
  const info = await img.png({ palette: true, colours: 32, compressionLevel: 9, effort: 10 }).toFile(join(ROOT, out));
  console.log(`${out.padEnd(44)} ${size}x${size}  ${info.size} B`);
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
