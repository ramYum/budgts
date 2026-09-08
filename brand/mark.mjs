// Budgts mark — traced from brand/Logo.png.
// Outer: four offset bars forming a pinwheel square (corners don't meet).
// Inner: a squared bracket opening right, with a middle tick + protruding block.
// Single colour, pure fill (currentColor).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "out4");
mkdirSync(OUT, { recursive: true });

// Traced from brand/Logo.png (30-col bitmap, scaled x2.5, +7 offset -> 50x50 in a 64 box).
// rectangles: [x, y, w, h]
const OUTER = [
  [12, 7, 40, 5], // top bar
  [7, 12, 5, 40], // left bar  (juts left, sits below the top bar -> pinwheel corner)
  [52, 12, 5, 40], // right bar (juts right)
  [12, 52, 40, 5], // bottom bar
];
const INNER = [
  [19.5, 17, 5, 22.5], // inner left stem
  [24.5, 17, 15, 5], // inner top bar
  [24.5, 39.5, 15, 7.5], // inner bottom bar (a touch heavier)
  [39.5, 22, 7.5, 7.5], // upper-right block
  [32, 29.5, 7.5, 5], // middle tick (set back from the right blocks)
  [39.5, 34.5, 7.5, 5], // lower-right block
];

const RECTS = [...OUTER, ...INNER];

function markInner(color) {
  const d = RECTS.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}z`).join("");
  return `<path d="${d}" fill="${color}"/>`;
}
function markSVG({ color = "currentColor", bg = null, rx = 12 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Budgts">
  <title>Budgts</title>
${bg ? `  <rect width="64" height="64" rx="${rx}" fill="${bg}"/>\n` : ""}  ${markInner(color)}
</svg>
`;
}
function lockup({ dir = "h", ink = "#001E16", accent = "#B5FF00", bg = "none" } = {}) {
  const m = markInner(accent);
  if (dir === "h")
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 84" width="320" height="84"><title>Budgts</title>${bg !== "none" ? `<rect width="320" height="84" fill="${bg}"/>` : ""}<g transform="translate(2 10)"><svg width="64" height="64" viewBox="0 0 64 64">${m}</svg></g><text x="82" y="56" font-family="Poppins,system-ui,sans-serif" font-weight="700" font-size="48" letter-spacing="-2" fill="${ink}">budgts</text></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 168" width="200" height="168"><title>Budgts</title>${bg !== "none" ? `<rect width="200" height="168" fill="${bg}"/>` : ""}<g transform="translate(68 2)"><svg width="64" height="64" viewBox="0 0 64 64">${m}</svg></g><text x="100" y="150" text-anchor="middle" font-family="Poppins,system-ui,sans-serif" font-weight="700" font-size="46" letter-spacing="-2" fill="${ink}">budgts</text></svg>`;
}

writeFileSync(resolve(OUT, "budgts-mark.svg"), markSVG());
writeFileSync(resolve(OUT, "budgts-mark-volt.svg"), markSVG({ color: "#B5FF00" }));
writeFileSync(resolve(OUT, "budgts-mark-pine.svg"), markSVG({ color: "#001E16" }));
writeFileSync(resolve(OUT, "budgts-mark-paper.svg"), markSVG({ color: "#FFFFFF" }));
writeFileSync(resolve(OUT, "favicon.svg"), markSVG({ color: "#B5FF00", bg: "#001E16" }));
writeFileSync(resolve(OUT, "budgts-logo-horizontal.svg"), lockup({ dir: "h" }));
writeFileSync(resolve(OUT, "budgts-logo-stacked.svg"), lockup({ dir: "v" }));

const sw = [
  ["#001E16", "#B5FF00", "lime on pine"],
  ["#B5FF00", "#001E16", "pine on lime"],
  ["#FFFFFF", "#001E16", "pine on paper"],
  ["#141918", "#FFFFFF", "white on carbon"],
];
writeFileSync(
  resolve(OUT, "_contact.html"),
  `<!doctype html><meta charset=utf-8>
<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Inter:wght@400;500&display=swap');
body{margin:0;background:#8a8a8a;font-family:Inter;color:#111;padding:32px}
h2{font-family:Poppins;font-weight:700;color:#fff;font-size:17px;margin:26px 0 12px}
.row{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}
.cell{width:170px;height:170px;border-radius:16px;display:grid;place-items:center}
.cap{font-size:11px;color:#eee;margin-top:6px;text-align:center}
.cmp{display:flex;gap:0;align-items:center;background:#E4E1F5;border-radius:16px;padding:0}
.cmp img{width:280px;height:auto;image-rendering:pixelated}
.cmp .rc{width:280px;height:280px;display:grid;place-items:center}
.lk{padding:18px 22px;border-radius:14px;background:#fff;margin-right:16px;display:inline-block}.lk.d{background:#001E16}
</style>
<h2>Source (left) vs reconstruction (right)</h2>
<div class="cmp">
  <img src="file:///C:/Users/ramsy/Projects/Budget Tracking app/brand/Logo.png">
  <div class="rc"><svg width="240" height="240" viewBox="0 0 64 64">${markInner("#0d0d16")}</svg></div>
</div>
<h2>On brand backgrounds</h2>
<div class="row">${sw.map(([b, f, c]) => `<div><div class="cell" style="background:${b}"><svg width="96" height="96" viewBox="0 0 64 64">${markInner(f)}</svg></div><div class="cap">${c}</div></div>`).join("")}</div>
<h2>Small — 40 / 28 / 18</h2>
<div class="row">${sw.map(([b, f]) => `<div style="display:flex;gap:10px;align-items:center;margin-right:16px">${[40, 28, 18].map((s) => `<span style="width:${s + 14}px;height:${s + 14}px;background:${b};border-radius:8px;display:inline-grid;place-items:center"><svg width="${s}" height="${s}" viewBox="0 0 64 64">${markInner(f)}</svg></span>`).join("")}</div>`).join("")}</div>
<h2>Lock-ups</h2>
<div class="row"><span class="lk">${lockup({ dir: "h" })}</span><span class="lk d">${lockup({ dir: "h", ink: "#fff" })}</span><span class="lk">${lockup({ dir: "v" })}</span></div>
`,
);
console.log("wrote", OUT);
