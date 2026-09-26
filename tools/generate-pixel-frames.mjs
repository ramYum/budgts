// Regenerate src/app/pixel-frames.css from the frame table in
// src/lib/brand/pixel-frame.ts (stepped pixel corners as 9-slice border images).
//
//   node tools/generate-pixel-frames.mjs
//
// Requires Node 22.18+ (type stripping, to import the .ts module).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { framesCss } from "../src/lib/brand/pixel-frame.ts";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src/app/pixel-frames.css");
const css = framesCss();
writeFileSync(out, css);
console.log(`src/app/pixel-frames.css  ${css.length} B`);
