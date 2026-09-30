/**
 * P5: compares two capture sets (web vs native, or web vs web for a zero-pixel proof or a determinism run) and writes
 * `<report>/report.html` (side A | side B | diff per screen/state, plus the geometry table) and `<report>/report.json`.
 * Exits non-zero on any breach:
 *   geometry — every id present on both sides, |Δx|,|Δy|,|Δw|,|Δh| ≤ 1 pt (relative to each side's screen root);
 *   colours  — each id tagged in screens.ts has the token hex exactly at its sample point, on both sides;
 *   pixels   — pixelmatch (threshold 0.1) over the shared crop, at most budgets.json[screen][state] of the pixels
 *              (default `default`); `--max-diff-pixels N` replaces the budget with an absolute count (0 for a proof).
 *
 *   npx tsx tools/parity/compare.ts --a .tmp/parity/web --b .tmp/parity/native [--report .tmp/parity/report]
 *        [--labels web,native] [--device android-412] [--screen home] [--pixels-only] [--max-diff-pixels 0]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { PNG } from "pngjs";
import { ROLE } from "../../src/lib/brand/tokens";
import { SCREENS } from "./screens";
import type { CaptureMeta } from "./capture-web";
import { compareGeometry, cropRgba, pixelHex, relativeBoxes, sharedSize, toPixels, type GeometryRow } from "./compare-lib";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const A = resolve(opt("a") ?? ".tmp/parity/web");
const B = resolve(opt("b") ?? ".tmp/parity/native");
const REPORT = resolve(opt("report") ?? ".tmp/parity/report");
const [LABEL_A, LABEL_B] = (opt("labels") ?? "web,native").split(",");
const DEVICES = opt("device")?.split(",");
const ONLY = opt("screen")?.split(",");
const PIXELS_ONLY = args.includes("--pixels-only");
const MAX_DIFF_PIXELS = opt("max-diff-pixels") === undefined ? null : Number(opt("max-diff-pixels"));
const BUDGETS = JSON.parse(readFileSync(join(__dirname, "budgets.json"), "utf8")) as Record<string, number | Record<string, number>>;

type ColorRow = { id: string; role: string; expected: string; a: string | null; b: string | null; ok: boolean };
type Result = {
  device: string;
  name: string;
  screen: string;
  state: string;
  diffPixels: number;
  comparedPixels: number;
  ratio: number;
  budget: string;
  pixelsOk: boolean;
  sizeNote: string;
  geometry: GeometryRow[];
  colors: ColorRow[];
  ok: boolean;
  images: { a: string; b: string; diff: string };
};

function budgetFor(screen: string, state: string): number {
  const s = BUDGETS[screen];
  if (typeof s === "object" && typeof s[state] === "number") return s[state];
  return BUDGETS.default as number;
}

function read(dir: string, device: string, name: string): { meta: CaptureMeta; png: PNG } {
  return {
    meta: JSON.parse(readFileSync(join(dir, device, `${name}.json`), "utf8")) as CaptureMeta,
    png: PNG.sync.read(readFileSync(join(dir, device, `${name}.png`))),
  };
}

function colorChecks(screen: string, a: { meta: CaptureMeta; png: PNG }, b: { meta: CaptureMeta; png: PNG }): ColorRow[] {
  const checks = SCREENS.find((s) => s.id === screen)?.colors ?? [];
  const sample = (side: { meta: CaptureMeta; png: PNG }, id: string, at: [number, number]) => {
    const box = side.meta.boxes.find((x) => x.key === id);
    if (!box) return null;
    return pixelHex(side.png, (box.x + box.w * at[0]) * side.meta.scale, (box.y + box.h * at[1]) * side.meta.scale);
  };
  return checks.map((c) => {
    const at = c.at ?? [0.5, 0.5];
    const expected = ROLE[c.role].toLowerCase();
    const va = sample(a, c.id, at);
    const vb = sample(b, c.id, at);
    // An id absent on both sides (a screen state without that element) is not a colour failure; geometry reports absences.
    const ok = (va === null && vb === null) || (va === expected && vb === expected);
    return { id: c.id, role: c.role, expected, a: va, b: vb, ok };
  });
}

async function compareOne(device: string, name: string): Promise<Result> {
  const pixelmatch = (await import("pixelmatch")).default;
  const a = read(A, device, name);
  const b = read(B, device, name);
  if (Math.abs(a.meta.scale - b.meta.scale) > 0.01) throw new Error(`${name}: scales differ (${a.meta.scale} vs ${b.meta.scale})`);

  const ra = toPixels(a.meta.root, a.meta.scale, a.png.width, a.png.height);
  const rb = toPixels(b.meta.root, b.meta.scale, b.png.width, b.png.height);
  const { w, h, lost } = sharedSize(ra, rb);
  const ca = cropRgba(a.png, { ...ra, w, h });
  const cb = cropRgba(b.png, { ...rb, w, h });
  const diff = new PNG({ width: w, height: h });
  const diffPixels = pixelmatch(ca, cb, diff.data, w, h, { threshold: 0.1 });

  const outDir = join(REPORT, device);
  mkdirSync(outDir, { recursive: true });
  const diffPath = join(outDir, `${name}.diff.png`);
  writeFileSync(diffPath, PNG.sync.write(diff));
  const copyA = join(outDir, `${name}.${LABEL_A}.png`);
  const copyB = join(outDir, `${name}.${LABEL_B}.png`);
  copyFileSync(join(A, device, `${name}.png`), copyA);
  copyFileSync(join(B, device, `${name}.png`), copyB);

  const comparedPixels = w * h;
  const ratio = comparedPixels ? diffPixels / comparedPixels : 1;
  const budgetRatio = budgetFor(a.meta.screen, a.meta.state);
  const pixelsOk = MAX_DIFF_PIXELS !== null ? diffPixels <= MAX_DIFF_PIXELS : ratio <= budgetRatio;
  const geometry = PIXELS_ONLY
    ? []
    : compareGeometry(relativeBoxes(a.meta.boxes, a.meta.root), relativeBoxes(b.meta.boxes, b.meta.root));
  const colors = PIXELS_ONLY ? [] : colorChecks(a.meta.screen, a, b);
  const ok = pixelsOk && geometry.every((g) => g.ok) && colors.every((c) => c.ok);
  const rel = (p: string) => relative(REPORT, p).replace(/\\/g, "/");
  return {
    device,
    name,
    screen: a.meta.screen,
    state: a.meta.state,
    diffPixels,
    comparedPixels,
    ratio,
    budget: MAX_DIFF_PIXELS !== null ? `≤ ${MAX_DIFF_PIXELS} px` : `≤ ${(budgetRatio * 100).toFixed(2)}%`,
    pixelsOk,
    sizeNote: lost ? `${ra.w}×${ra.h} vs ${rb.w}×${rb.h} px; compared ${w}×${h}` : `${w}×${h} px`,
    geometry,
    colors,
    ok,
    images: { a: rel(copyA), b: rel(copyB), diff: rel(diffPath) },
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (r: { x: number; y: number; w: number; h: number } | null) =>
  r ? `${r.x.toFixed(1)}, ${r.y.toFixed(1)} · ${r.w.toFixed(1)}×${r.h.toFixed(1)}` : "missing";

function html(results: Result[], missing: string[]): string {
  const failed = results.filter((r) => !r.ok).length;
  const rows = results
    .map((r) => {
      const geo = r.geometry.length
        ? `<details${r.geometry.some((g) => !g.ok) ? " open" : ""}><summary>Geometry: ${r.geometry.filter((g) => !g.ok).length} of ${r.geometry.length} ids off</summary><table><tr><th>id</th><th>${esc(LABEL_A)}</th><th>${esc(LABEL_B)}</th><th>max Δ</th></tr>${r.geometry
            .map(
              (g) =>
                `<tr class="${g.ok ? "" : "bad"}"><td>${esc(g.key)}</td><td>${fmt(g.a)}</td><td>${fmt(g.b)}</td><td>${g.delta === null ? "n/a" : g.delta.toFixed(2)}</td></tr>`,
            )
            .join("")}</table></details>`
        : "";
      const col = r.colors.length
        ? `<p>Colours: ${r.colors.map((c) => `<span class="${c.ok ? "" : "bad"}">${esc(c.id)} ${c.role} ${c.expected} (${c.a ?? "none"} / ${c.b ?? "none"})</span>`).join(" · ")}</p>`
        : "";
      return `<section class="${r.ok ? "ok" : "fail"}"><h2>${r.ok ? "PASS" : "FAIL"} · ${esc(r.device)} · ${esc(r.name)}</h2>
<p>Pixels: ${r.diffPixels} differ of ${r.comparedPixels} (${(r.ratio * 100).toFixed(3)}%, budget ${esc(r.budget)}) · ${esc(r.sizeNote)}</p>${col}
<div class="imgs"><figure><figcaption>${esc(LABEL_A)}</figcaption><img src="${r.images.a}"></figure><figure><figcaption>${esc(LABEL_B)}</figcaption><img src="${r.images.b}"></figure><figure><figcaption>diff</figcaption><img src="${r.images.diff}"></figure></div>${geo}</section>`;
    })
    .join("\n");
  return `<!doctype html><meta charset="utf-8"><title>Budgts parity report</title>
<style>body{font:14px system-ui;margin:24px;background:#f4f4f4;color:#111}section{background:#fff;padding:16px;margin:16px 0}section.fail h2{color:#c93434}.imgs{display:flex;gap:12px}figure{margin:0}img{width:300px;border:1px solid #e6e6e6}table{border-collapse:collapse;font-size:12px}td,th{padding:2px 8px;border-bottom:1px solid #eee;text-align:left}.bad{color:#c93434;font-weight:600}</style>
<h1>Parity: ${esc(LABEL_A)} vs ${esc(LABEL_B)}</h1>
<p>${results.length} captures compared, ${failed} failing${missing.length ? `, ${missing.length} unmatched: ${missing.map(esc).join(", ")}` : ""}. Generated ${new Date().toISOString()}.</p>
${rows}`;
}

async function main() {
  const results: Result[] = [];
  const missing: string[] = [];
  const devices = readdirSync(A).filter((d) => !DEVICES || DEVICES.includes(d));
  for (const device of devices) {
    if (!existsSync(join(A, device))) continue;
    for (const file of readdirSync(join(A, device)).filter((f) => f.endsWith(".json"))) {
      const name = basename(file, ".json");
      if (ONLY && !ONLY.some((s) => name.startsWith(`${s}-`))) continue;
      if (!existsSync(join(B, device, file))) {
        missing.push(`${device}/${name}`);
        continue;
      }
      results.push(await compareOne(device, name));
    }
  }
  mkdirSync(REPORT, { recursive: true });
  writeFileSync(join(REPORT, "report.html"), html(results, missing));
  writeFileSync(
    join(REPORT, "report.json"),
    JSON.stringify(
      results.map((r) => ({ ...r, images: undefined })),
      null,
      2,
    ),
  );
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    const geoOff = r.geometry.filter((g) => !g.ok).length;
    const colOff = r.colors.filter((c) => !c.ok).length;
    console.log(
      `${r.ok ? "PASS" : "FAIL"} ${r.device} ${r.name}  ${r.diffPixels}px (${(r.ratio * 100).toFixed(3)}%)${geoOff ? `  geometry ${geoOff} off` : ""}${colOff ? `  colours ${colOff} off` : ""}`,
    );
  }
  console.log(`${results.length} compared, ${failed.length} failing, ${missing.length} unmatched → ${join(REPORT, "report.html")}`);
  if (failed.length || missing.length || results.length === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
