// Budgts angular mark — a squared spiral built on a grid, with a 45° chamfer
// on the outer bottom-right corner and a solid block at the centre.
// Reconstructed from the supplied icon. Tunable; emits SVGs + a contact sheet.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "out2");
mkdirSync(OUT, { recursive: true });

const P = {
  vb: 64,
  sw: 10, // stroke weight
  inset: 5, // outer edge inset from the viewBox
  gap: 15.5, // centre-to-centre spacing between spiral arms
  chamfer: 13, // size of the 45° cut on the outer bottom-right corner
  turns: 2, // how many arms
  centre: 10, // side of the solid centre block
};

const r2 = (n) => Math.round(n * 100) / 100;

// Build the spiral as a single polyline of right-angle segments, outside -> in,
// clockwise, starting at the top-left and leaving a gap before it closes.
function spiralPoints(P) {
  const { vb, inset, gap, chamfer } = P;
  const lo = inset;
  const hi = vb - inset;
  const pts = [];

  // ---- outer arm (with chamfered bottom-right) ----
  pts.push([lo, lo]); // top-left
  pts.push([hi, lo]); // top-right
  pts.push([hi, hi - chamfer]); // down the right side, stop for the cut
  pts.push([hi - chamfer, hi]); // 45° chamfer
  pts.push([lo, hi]); // bottom-left
  pts.push([lo, lo + gap + gap * 0.0]); // up the left side, stop short (the opening)

  // ---- inner arms ----
  let a = lo + gap; // current inset for this arm
  let b = hi - gap;
  let side = "topStopped"; // we ended the outer arm going up the left side, stopped at y = lo+gap
  // continue clockwise: go right along an inner top, then down, then left, then up...
  let level = 1;
  let curX = lo;
  let curY = lo + gap;
  while (level < P.turns) {
    const A = lo + gap * level;
    const B = hi - gap * level;
    // from (curX,curY) which sits on the left side at y=A: go right to B
    pts.push([B, A]);
    // down to B
    pts.push([B, B]);
    // left to A
    pts.push([A, B]);
    // up, stopping short of closing onto the previous arm (leave a gap)
    const stopY = A + gap * 0.55;
    pts.push([A, stopY]);
    curX = A;
    curY = stopY;
    level++;
  }
  // final short stub into the centre block
  pts.push([P.vb / 2 - 1, curY]);
  return pts;
}

function markInner(P, color) {
  const pts = spiralPoints(P);
  const d =
    `M ${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" L ")}`;
  const c = P.vb / 2;
  const h = P.centre / 2;
  return (
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${P.sw}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="4"/>` +
    `<rect x="${r2(c - h)}" y="${r2(c - h)}" width="${P.centre}" height="${P.centre}" fill="${color}"/>`
  );
}

function markSVG(P, { color = "currentColor", bg = null, rx = 14 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${P.vb} ${P.vb}" role="img" aria-label="Budgts">
  <title>Budgts</title>
${bg ? `  <rect width="${P.vb}" height="${P.vb}" rx="${rx}" fill="${bg}"/>\n` : ""}  ${markInner(P, color)}
</svg>
`;
}

function lockup(P, { dir = "h", ink = "#001E16", accent = "#B5FF00", bg = "none" } = {}) {
  const mark = markInner(P, accent);
  if (dir === "h") {
    const W = 320, H = 84;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><title>Budgts</title>${bg !== "none" ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ""}<g transform="translate(2 10)"><svg width="64" height="64" viewBox="0 0 64 64">${mark}</svg></g><text x="82" y="56" font-family="Poppins,system-ui,sans-serif" font-weight="700" font-size="48" letter-spacing="-2" fill="${ink}">budgts</text></svg>`;
  }
  const W = 200, H = 168;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><title>Budgts</title>${bg !== "none" ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ""}<g transform="translate(68 2)"><svg width="64" height="64" viewBox="0 0 64 64">${mark}</svg></g><text x="${W / 2}" y="150" text-anchor="middle" font-family="Poppins,system-ui,sans-serif" font-weight="700" font-size="46" letter-spacing="-2" fill="${ink}">budgts</text></svg>`;
}

writeFileSync(resolve(OUT, "budgts-mark.svg"), markSVG(P));
writeFileSync(resolve(OUT, "budgts-mark-volt.svg"), markSVG(P, { color: "#B5FF00" }));
writeFileSync(resolve(OUT, "budgts-mark-pine.svg"), markSVG(P, { color: "#001E16" }));
writeFileSync(resolve(OUT, "budgts-mark-paper.svg"), markSVG(P, { color: "#FFFFFF" }));
writeFileSync(resolve(OUT, "favicon.svg"), markSVG(P, { color: "#B5FF00", bg: "#001E16", rx: 12 }));
writeFileSync(resolve(OUT, "budgts-logo-horizontal.svg"), lockup(P, { dir: "h" }));
writeFileSync(resolve(OUT, "budgts-logo-stacked.svg"), lockup(P, { dir: "v" }));

const sw = [
  ["#001E16", "#B5FF00", "lime on pine"],
  ["#B5FF00", "#001E16", "pine on lime"],
  ["#FFFFFF", "#001E16", "pine on paper"],
  ["#141918", "#FFFFFF", "white on carbon"],
];
writeFileSync(
  resolve(OUT, "_contact.html"),
  `<!doctype html><meta charset=utf-8>
<style>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Inter:wght@400;500&display=swap');
body{margin:0;background:#333;font-family:Inter,system-ui;color:#e6e6e6;padding:36px}
h2{font-family:Poppins;font-weight:700;color:#fff;font-size:18px;margin:30px 0 14px}
.row{display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start}
.cell{width:190px;height:190px;border-radius:18px;display:grid;place-items:center}
.cap{font-size:11px;color:#9a9a9a;margin-top:8px;text-align:center}
.lk{padding:20px 24px;border-radius:16px;display:inline-block;background:#fff;margin-right:18px}
.lk.d{background:#001E16}
figure{margin:0}
.big{width:300px;height:300px;border-radius:28px;display:grid;place-items:center;background:#001E16}
.src{width:150px;height:150px;border-radius:20px;background:#0f1a17;display:grid;place-items:center;color:#555;font-size:12px}
</style>
<h2>Reconstruction — large, on pine</h2>
<div class="row">
  <div class="big"><svg width="220" height="220" viewBox="0 0 64 64">${markInner(P, "#B5FF00")}</svg></div>
  <div class="src">supplied icon<br>goes here</div>
</div>
<h2>On the four brand backgrounds</h2>
<div class="row">
${sw.map(([bg, fg, cap]) => `<figure><div class="cell" style="background:${bg}"><svg width="108" height="108" viewBox="0 0 64 64">${markInner(P, fg)}</svg></div><div class="cap">${cap}</div></figure>`).join("")}
</div>
<h2>Small — 40 / 28 / 18 px</h2>
<div class="row">
${sw.map(([bg, fg]) => `<div style="display:flex;gap:12px;align-items:center;margin-right:20px">${[40, 28, 18].map((s) => `<span style="width:${s + 18}px;height:${s + 18}px;background:${bg};border-radius:10px;display:inline-grid;place-items:center"><svg width="${s}" height="${s}" viewBox="0 0 64 64">${markInner(P, fg)}</svg></span>`).join("")}</div>`).join("")}
</div>
<h2>Lock-ups</h2>
<div class="row">
  <span class="lk">${lockup(P, { dir: "h" })}</span>
  <span class="lk d">${lockup(P, { dir: "h", ink: "#FFFFFF" })}</span>
  <span class="lk">${lockup(P, { dir: "v" })}</span>
  <span class="lk d">${lockup(P, { dir: "v", ink: "#FFFFFF" })}</span>
</div>
`,
);
console.log("wrote", OUT);
