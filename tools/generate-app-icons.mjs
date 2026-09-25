// Regenerate every app icon from the one robin source (src/lib/brand/robin-art.ts).
//
//   node tools/generate-app-icons.mjs
//
// Pixel art only stays crisp at whole-number scales, so each icon picks an
// integer px-per-cell and centers the 26×22-cell bird on the canvas. The
// maskable variants keep the bird inside the 80% safe zone. Requires Node 22.18+
// (type stripping, to import the .ts art module) and sharp (a Next dependency).
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { robinSvg } from "../src/lib/brand/robin-art.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANVAS = "#f4f4f4";

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
  const svg = robinSvg({ size, scale, background });
  const info = await sharp(Buffer.from(svg))
    .png({ palette: true, colours: 32, compressionLevel: 9, effort: 10 })
    .toFile(join(ROOT, out));
  console.log(`${out.padEnd(32)} ${size}x${size}  ${info.size} B`);
}
