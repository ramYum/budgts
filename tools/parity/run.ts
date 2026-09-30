/**
 * `npm run parity -- --screen home[,budgets]`: P3 + P4 + P5 for the named screens on the Android parity size. The web is
 * captured with the real clock (`--now real`) right before the device, so clock-driven copy matches; then compare.ts
 * writes .tmp/parity/report/report.html and fails on any breach. Needs `npm run parity:serve` and the emulator (README).
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const i = args.indexOf("--screen");
const screens = i >= 0 ? args[i + 1] : undefined;
if (!screens) {
  console.error("usage: npm run parity -- --screen <id>[,<id>] (ids: tools/parity/screens.ts)");
  process.exit(2);
}

function step(script: string, extra: string[]): void {
  const r = spawnSync("npx", ["tsx", `tools/parity/${script}`, "--screen", screens!, ...extra], { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

step("capture-web.ts", ["--device", "android-412", "--now", "real", "--out", ".tmp/parity/web"]);
step("capture-native.ts", ["--out", ".tmp/parity/native"]);
step("compare.ts", ["--a", ".tmp/parity/web", "--b", ".tmp/parity/native", "--device", "android-412", "--report", ".tmp/parity/report"]);
