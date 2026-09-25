// Compress the brand rasters and PWA icons in place (sharp).
// Run ONCE on freshly exported art (docs/BRAND_GUIDELINES.md) — re-running on
// already-quantized files re-quantizes them, so start from the exports.
//
//   node tools/optimize-brand-images.mjs
//
// Every file stays a PNG at the same path and native size (manifest icons
// must be PNG; the service worker and <Logo>/<Mascot> reference these paths).
// Compression is a 256-colour palette with light dithering — measured PSNR
// 43–55 dB against the exports (flattened on the app's cream), and rendered
// screenshots at 3x DPR diff at 44–50 dB: visually lossless, ~70% smaller.
//
// Sizes stay native on purpose. Each is at most ~3x its largest on-screen use
// (sunburst 700 for 300 CSS px, mark 306 for ≤102, mascots ≤306 for ≤120),
// except the wordmark (700w for ≤60 CSS px) — but pre-shrunk copies of it
// (180w, 360w) rendered visibly softer in Chrome than the browser shrinking
// the full export, so it keeps its size and only gets the palette step.
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const PALETTE = { palette: true, quality: 100, effort: 10, compressionLevel: 9, dither: 0.5 };

const FILES = [
  "public/brand/logo-sunburst.png",
  "public/brand/logo-mark.png",
  "public/brand/wordmark.png",
  "public/brand/mood-normal.png",
  "public/brand/mood-curious.png",
  "public/brand/mood-sleepy.png",
  "public/icon-512.png",
  "public/icon-maskable.png",
  "public/icon-192.png",
  "public/icon-maskable-192.png",
  "src/app/apple-icon.png",
  "src/app/icon.png",
];

for (const file of FILES) {
  const input = readFileSync(file);
  const out = await sharp(input).png(PALETTE).toBuffer();
  writeFileSync(file, out);
  console.log(`${file}: ${input.length} → ${out.length} B`);
}
