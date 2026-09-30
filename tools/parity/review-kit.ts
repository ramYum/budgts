/**
 * Side-by-side review kits for the by-eye parity review (owner, 2026-09-30: native screens are captured by hand, no
 * automated sign-in). One folder per lane with the approved PWA's reference captures (Android 412 CSS px wide, both
 * motion sets) under `web/`, an empty `native/` for the operator's screenshots, and an index.html that shows each
 * web capture next to its native counterpart once a file with the same name is dropped into `native/`.
 *
 *   npx tsx tools/parity/review-kit.ts [--ref .tmp/parity/ref] [--out .tmp/parity/review-kit]
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SCREENS, captureName, type MotionSet } from "./screens";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const REF = resolve(opt("ref") ?? ".tmp/parity/ref", "android-412");
const OUT = resolve(opt("out") ?? ".tmp/parity/review-kit");
const SETS: MotionSet[] = ["rest", "frozen"];

/** Which lane owns each screen (phase3 plan, Wave 1). Loading, error, not-found and offline are Foundation's (F5). */
export const LANES: { id: string; title: string; screens: string[] }[] = [
  { id: "A", title: "Lane A: onboarding and the welcome guide", screens: ["onboarding", "tour"] },
  { id: "B", title: "Lane B: Home", screens: ["home"] },
  {
    id: "C",
    title: "Lane C: More, Settings and subpages, Help, About, Categories, Delete",
    screens: ["more", "settings", "profile", "security", "appearance", "categories", "help", "how-it-works", "about", "delete-account", "account-deleted"],
  },
  { id: "D-1", title: "Lane D-1: Activity", screens: ["activity"] },
  { id: "D-2", title: "Lane D-2: Budgets, Goals, Insights", screens: ["budgets", "goals", "insights"] },
  { id: "E", title: "Lane E: Connected banks, Accounts", screens: ["connected-banks", "accounts"] },
  { id: "F", title: "Foundation (F5): not found, offline", screens: ["not-found", "offline"] },
];

const STATE_NOTE: Record<string, string> = {
  firstrun: "new user, no currency yet",
  tour: "onboarded, welcome guide not seen",
  empty: "onboarded, nothing added",
  full: "3 accounts, budgets on 6 categories, 42 transactions this month, 2 goals",
  over: "as full, Dining out about 130% and Groceries 92% of budget",
  banks: "Plaid Sandbox bank connected, a review flag, limited history, one row needing a category",
  deleting: "account deletion started (read-only banner)",
  loading: "loading skeleton (web: dev harness; native: a held load)",
  error: "failed load (web: the root error page; native: the error state)",
  notfound: "a missing screen",
  offline: "no network",
  signedout: "signed out",
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

const STYLE = `body{font:14px system-ui;margin:24px;background:#f4f4f4;color:#111}h1{font-size:20px}h2{font-size:16px;margin-top:32px}
table{border-collapse:collapse}td,th{padding:6px 10px;vertical-align:top;text-align:left}th{font-weight:600}
img{width:280px;border:1px solid #e6e6e6;background:#fff;display:block}.miss{width:280px;height:120px;border:1px dashed #b9b9b9;display:flex;align-items:center;justify-content:center;color:#6e6e6e;font-size:12px;text-align:center;padding:8px;box-sizing:border-box}
.note{color:#6e6e6e}code{background:#fff;padding:1px 4px}`;

function cell(src: string, missing: string): string {
  // The native image is shown once the operator drops it in; until then a placeholder names the file to add.
  return `<img src="${src}" onerror="this.outerHTML='<div class=miss>${esc(missing)}</div>'">`;
}

function main() {
  if (!existsSync(REF)) throw new Error(`parity: no reference captures at ${REF}`);
  const have = new Set(readdirSync(REF));
  mkdirSync(OUT, { recursive: true });
  const top: string[] = [];
  let copied = 0;

  for (const lane of LANES) {
    const dir = join(OUT, lane.id);
    mkdirSync(join(dir, "web"), { recursive: true });
    mkdirSync(join(dir, "native"), { recursive: true });
    const sections: string[] = [];
    for (const screenId of lane.screens) {
      const screen = SCREENS.find((s) => s.id === screenId);
      if (!screen) throw new Error(`parity: unknown screen ${screenId}`);
      const rows: string[] = [];
      for (const state of screen.states) {
        const cells = SETS.map((set) => {
          const name = `${captureName(screen.id, state, set)}.png`;
          if (have.has(name)) {
            copyFileSync(join(REF, name), join(dir, "web", name));
            copied++;
          }
          return `<td>${cell(`web/${name}`, "no web capture")}</td><td>${cell(`native/${name}`, `drop native/${name}`)}</td>`;
        }).join("");
        rows.push(`<tr><th>${esc(state)}<div class="note">${esc(STATE_NOTE[state] ?? "")}</div></th>${cells}</tr>`);
      }
      sections.push(
        `<h2>${esc(screen.id)} <span class="note">web ${esc(screen.web)} · native budgts:///${esc(screen.native)}</span></h2>
<table><tr><th>state</th><th>web · motion off</th><th>native · motion off</th><th>web · frozen at ${screen.freezeAt ?? 4000} ms</th><th>native · same moment</th></tr>${rows.join("")}</table>`,
      );
    }
    writeFileSync(
      join(dir, "index.html"),
      `<!doctype html><meta charset="utf-8"><title>Parity review: ${esc(lane.title)}</title><style>${STYLE}</style>
<h1>${esc(lane.title)}</h1>
<p>Left of each pair: the approved PWA (057b214), Chrome at 412×915 CSS px, 2.625× (1082×2402 px), America/New_York,
the parity users on staging. Right: the native screenshot. Save each native screenshot into <code>native/</code> under
the name its placeholder shows (<code>&lt;screen&gt;-&lt;state&gt;-rest.png</code> with Remove animations on,
<code>-frozen.png</code> with motion on), then reload. The native side includes the status bar and gesture bar; the web
side is the viewport only.</p>
${sections.join("\n")}`,
    );
    top.push(`<li><a href="${lane.id}/index.html">${esc(lane.title)}</a> (${lane.screens.join(", ")})</li>`);
  }

  writeFileSync(
    join(OUT, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Budgts parity review kits</title><style>${STYLE}</style>
<h1>Parity review kits: the approved PWA vs native, by eye</h1>
<p>One kit per lane. Web reference: approved PWA 057b214, Android size, both motion sets. phase-m/phase3's web
(3178122) is pixel-identical to it (zero-pixel proof), so the reference is also the merged web.</p><ul>${top.join("")}</ul>`,
  );
  console.log(`review kits → ${OUT} (${copied} web captures, ${LANES.length} kits)`);
}

main();
