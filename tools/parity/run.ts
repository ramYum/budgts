/**
 * `npm run parity -- --screen home[,budgets]` (or `--all`): P4 + P3 + P5 on the Android parity size. The device is
 * captured first; its usable height (device.json) sets the web viewport, and the web is captured right after with the
 * real clock (`--now real`), so clock-driven copy matches. compare.ts then writes .tmp/parity/report/report.html and
 * fails on any breach. Needs `npm run parity:serve` and the emulator (README).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const i = args.indexOf("--screen");
const screens = i >= 0 ? args[i + 1] : undefined;
if (!screens && !args.includes("--all")) {
  console.error("usage: npm run parity -- --screen <id>[,<id>] | --all (ids: tools/parity/screens.ts)");
  process.exit(2);
}
const only = screens ? ["--screen", screens] : [];

function step(script: string, extra: string[], mustPass = true): void {
  const r = spawnSync("npx", ["tsx", `tools/parity/${script}`, ...only, ...extra], { stdio: "inherit", shell: process.platform === "win32" });
  if (mustPass && r.status !== 0) process.exit(r.status ?? 1);
}

step("capture-native.ts", ["--out", ".tmp/parity/native"], false); // a failed screen still leaves the rest to compare
const { heightDp } = JSON.parse(readFileSync(".tmp/parity/native/device.json", "utf8")) as { heightDp: number };
step("capture-web.ts", ["--device", "android-412", "--now", "real", "--height", String(heightDp), "--out", ".tmp/parity/web"]);
step("compare.ts", ["--a", ".tmp/parity/web", "--b", ".tmp/parity/native", "--device", "android-412", "--report", ".tmp/parity/report"]);
