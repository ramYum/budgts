// Regenerate every icon from the one robin source (src/lib/brand/robin-art.ts):
// the website's from Crystal herself, the native apps' launcher icon from the
// badge composed around her (src/lib/brand/app-icon-art.ts), and the native
// splash image from the one egg source (src/lib/brand/egg-art.ts).
//
//   node tools/generate-app-icons.mjs
//
// Pixel art only stays crisp at whole-number scales, so each icon picks an
// integer px-per-cell and centers its art on the canvas. The website's
// maskable variants keep the bird inside the 80% safe zone. Requires Node
// 22.18+ (type stripping, to import the .ts art modules) and sharp (a Next
// dependency).
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { robinSvg } from "../src/lib/brand/robin-art.ts";
import { eggSvg } from "../src/lib/brand/egg-art.ts";
import { ICON_GRID, appIconSvg } from "../src/lib/brand/app-icon-art.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANVAS = "#f4f4f4";
const INK = "#111111";

// The website (budgts.com): Crystal on paper.
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
];

for (const { out, size, scale, background } of ICONS) {
  const info = await sharp(Buffer.from(robinSvg({ size, scale, background })))
    .png({ palette: true, colours: 32, compressionLevel: 9, effort: 10 })
    .toFile(join(ROOT, out));
  console.log(`${out.padEnd(44)} ${size}x${size}  ${info.size} B`);
}

// The native apps' launcher icon (mobile/app.json): the sign-in badge on an ink
// tile (app-icon-art.ts), its ICON_GRID cells at a whole number of px each.
//  - iOS and the stores: one opaque 1024 square, the design at 23px a cell
//    (1012px, the ink bleeding to the edge). iOS rounds the corners; the disc,
//    Crystal and her card sit well inside them.
//  - Android adaptive icon: two 1024 layers of a 108dp icon, of which
//    launchers show the middle 72dp (683px) through their mask, keeping the
//    middle 66dp circle (626px) safe. The design fills the 72dp at 15px a cell
//    (660px): the background layer is the ground (bleeding to the layer's edge),
//    the card and the sparkles; the foreground is Crystal and her progress
//    cells, inside the safe circle.
//  - Android 13+ themed icon: Crystal where the foreground has her, her darks
//    only (MONO_KEEP), so she reads as an outlined bird with a dark cap, back,
//    wing and tail. The launcher tints it; only the alpha matters.
const MONO_KEEP = ["#111111", "#7b4a2b", "#a8703f", "#3b2a20", "#5b5b5b"];
const APP_ICONS = [
  { out: "mobile/assets/icon.png", svg: appIconSvg({ size: 1024, scale: 23 }), opaque: true },
  { out: "mobile/assets/android-icon-background.png", svg: appIconSvg({ size: 1024, scale: 15, parts: ["ground", "back"] }), opaque: true },
  { out: "mobile/assets/android-icon-foreground.png", svg: appIconSvg({ size: 1024, scale: 15, parts: ["front"] }) },
  {
    out: "mobile/assets/android-icon-monochrome.png",
    svg: appIconSvg({ size: 1024, scale: 15, parts: ["robin"], only: (fill) => MONO_KEEP.includes(fill), recolor: "#ffffff" }),
  },
];
for (const { out, svg, opaque } of APP_ICONS) {
  let img = sharp(Buffer.from(svg));
  if (opaque) img = img.flatten({ background: INK }).removeAlpha();
  const info = await img.png({ palette: true, colours: 32, compressionLevel: 9, effort: 10 }).toFile(join(ROOT, out));
  console.log(`${out.padEnd(44)} 1024x1024  ${info.size} B  (${ICON_GRID}-cell grid)`);
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
