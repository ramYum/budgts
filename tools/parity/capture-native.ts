/**
 * P4: native captures on the parity AVD, the counterpart of capture-web.ts. For each screen × state × motion set it signs
 * the parity user in (Maestro, a fresh magic-link token), opens the screen's deep link, takes the screenshot and reads the
 * view hierarchy; writes `<out>/android-412/<screen>-<state>-<set>.png` + `.json` in the web capture's format, in dp,
 * with `root` = the `screen-root` view (so the status bar and gesture inset are cropped away by compare.ts).
 *
 *   rest   — Android animator/transition/window scales 0: React Native reports Reduce Motion, the motion-off rest frame;
 *   frozen — scales 1 and `?clock=<freezeAt>`: motion pinned to the web capture's frozen frame (mobile/lib/motion/parity-clock.ts).
 *
 * Needs (tools/parity/README.md → P4): the emulator lock, one booted AVD (1080×2400, 420 dpi), the Budgts dev build
 * installed with EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3200 and staging Supabase, `npm run parity:serve` running.
 *
 *   npx tsx tools/parity/capture-native.ts [--out .tmp/parity/native] [--screen home] [--set rest,frozen]
 * Env: MAESTRO_BIN, ADB, ANDROID_SERIAL override the defaults.
 */
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";
import { loadStagingEnv } from "./env";
import { readSeededUsers, tokenHashFor } from "./auth";
import { PARITY_TIME_ZONE, type ParityUserName } from "./data";
import { SCREENS, STATE_USER, captureName, nativeLinkFor, type MotionSet, type Screen, type StateId } from "./screens";
import { boxesFromHierarchy, parseDensity, screenArea } from "./capture-native-lib";
import type { CaptureMeta } from "./capture-web";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const OUT = resolve(opt("out") ?? ".tmp/parity/native");
const SETS = (opt("set")?.split(",") ?? ["rest", "frozen"]) as MotionSet[];
const ONLY = opt("screen")?.split(",");
const DEVICE = "android-412" as const;
const DEFAULT_FREEZE = 4000;
const FLOWS = join(__dirname, "maestro");
const LOCK = resolve(".tmp/parity/emulator.lock");

const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
const MAESTRO =
  process.env.MAESTRO_BIN ?? join(home, ".maestro-cli", "maestro", "bin", process.platform === "win32" ? "maestro.bat" : "maestro");
const ADB = process.env.ADB ?? join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk", "platform-tools", "adb.exe");
const SERIAL = process.env.ANDROID_SERIAL;
let lockOwned = false;

function sh(cmd: string, cmdArgs: string[], cwd?: string): string {
  const r = spawnSync(cmd, cmdArgs, { cwd, encoding: "utf8", shell: process.platform === "win32" && cmd.endsWith(".bat"), maxBuffer: 64 << 20 });
  // Never echo a flow's -e values: TOKEN_HASH is a live sign-in credential.
  const shown = cmdArgs.map((a, i) => (cmdArgs[i - 1] === "-e" ? `${a.split("=")[0]}=…` : a)).join(" ");
  if (r.status !== 0) throw new Error(`${cmd} ${shown} failed (${r.status}): ${(r.stderr || r.stdout).slice(-800)}`);
  return r.stdout;
}
const adb = (...a: string[]) => sh(ADB, [...(SERIAL ? ["-s", SERIAL] : []), ...a]);
const maestro = (flow: string, env: Record<string, string>, cwd: string) =>
  sh(MAESTRO, [...(SERIAL ? ["--device", SERIAL] : []), "test", ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]), join(FLOWS, flow)], cwd);

/** The shared emulator is serialised through a lock file; a lock left by a dead process is taken over. */
function takeLock(): void {
  mkdirSync(resolve(".tmp/parity"), { recursive: true });
  if (existsSync(LOCK)) {
    const pid = Number(readFileSync(LOCK, "utf8").trim());
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      alive = false;
    }
    if (alive) throw new Error(`parity: the emulator is locked by process ${pid} (${LOCK})`);
    rmSync(LOCK);
  }
  const fd = openSync(LOCK, "wx");
  writeFileSync(fd, String(process.pid));
  closeSync(fd);
  lockOwned = true;
}

function releaseLock(): void {
  if (lockOwned) rmSync(LOCK, { force: true });
  lockOwned = false;
}

const SCALES = ["animator_duration_scale", "transition_animation_scale", "window_animation_scale"];
function setMotion(set: MotionSet): void {
  for (const s of SCALES) adb("shell", "settings", "put", "global", s, set === "rest" ? "0" : "1");
}

function preflight(): number {
  if (!existsSync(MAESTRO)) throw new Error(`parity: Maestro not found at ${MAESTRO} (set MAESTRO_BIN)`);
  const devices = adb("devices").split("\n").slice(1).filter((l) => /\tdevice$/.test(l.trim()) || /\sdevice$/.test(l));
  if (!SERIAL && devices.length !== 1) throw new Error(`parity: expected exactly one device, found ${devices.length} (set ANDROID_SERIAL)`);
  if (!adb("shell", "pm", "list", "packages", "com.budgts.app").includes("com.budgts.app")) {
    throw new Error("parity: the Budgts dev build (com.budgts.app) is not installed on the device");
  }
  // The parity users live in New York; <TimeZoneSync>'s native twin must see no change, and "today" must match the web.
  adb("shell", "service", "call", "alarm", "3", "s16", PARITY_TIME_ZONE);
  return parseDensity(adb("shell", "wm", "density"));
}

/** Offline has no user of its own on the web (/offline is public); on the device it is a signed-in app with no network. */
function nativeUser(state: StateId): ParityUserName | null {
  return STATE_USER[state] ?? (state === "offline" ? "full" : null);
}

function linkFor(screen: Screen, state: StateId, set: MotionSet): string {
  const link = nativeLinkFor(screen, state);
  if (set !== "frozen") return link;
  return `${link}${link.includes("?") ? "&" : "?"}clock=${screen.freezeAt ?? DEFAULT_FREEZE}`;
}

async function main() {
  loadStagingEnv();
  const seeded = readSeededUsers();
  const screens = ONLY ? SCREENS.filter((s) => ONLY.includes(s.id)) : SCREENS;
  if (screens.length === 0) throw new Error(`parity: no screens match ${ONLY?.join(",")}`);
  takeLock();
  const dir = join(OUT, DEVICE);
  mkdirSync(dir, { recursive: true });
  let failures = 0;
  let area: { x: number; y: number; w: number; h: number } | null = null;
  try {
    const density = preflight();
    const byUser = new Map<ParityUserName | null, { screen: Screen; state: StateId }[]>();
    for (const screen of screens) for (const state of screen.states) byUser.set(nativeUser(state), [...(byUser.get(nativeUser(state)) ?? []), { screen, state }]);

    for (const set of SETS) {
      setMotion(set);
      for (const [user, jobs] of byUser) {
        if (user) {
          const u = seeded.users[user];
          if (!u) throw new Error(`parity: user "${user}" is not seeded`);
          maestro("sign-in.yaml", { TOKEN_HASH: await tokenHashFor(u.email) }, dir);
        } else {
          maestro("signed-out.yaml", {}, dir);
        }
        for (const { screen, state } of jobs) {
          const name = captureName(screen.id, state, set);
          try {
            if (state === "offline") adb("shell", "cmd", "connectivity", "airplane-mode", "enable");
            maestro("capture.yaml", { LINK: linkFor(screen, state, set), OUT: name }, dir);
            const boxes = boxesFromHierarchy(sh(MAESTRO, [...(SERIAL ? ["--device", SERIAL] : []), "hierarchy"]), density);
            const png = PNG.sync.read(readFileSync(join(dir, `${name}.png`)));
            // Crop: between the status bar and the gesture bar (the web's viewport); screen-root is Screen's scroll view,
            // which runs under the translucent header and the status bar, so it is not the crop.
            const root = screenArea(boxes, png.width / density, png.height / density);
            area = root;
            const meta: CaptureMeta = {
              side: "native",
              screen: screen.id,
              state,
              set,
              device: DEVICE,
              width: png.width / density,
              height: png.height / density,
              scale: density,
              root: { x: root.x, y: root.y, w: root.w, h: root.h },
              boxes,
              url: linkFor(screen, state, set),
            };
            writeFileSync(join(dir, `${name}.json`), JSON.stringify(meta, null, 2));
            console.log(`  ${DEVICE} ${name}  ${boxes.length} ids`);
          } catch (e) {
            failures++;
            console.error(`  FAILED ${name}: ${e instanceof Error ? e.message : e}`);
          } finally {
            if (state === "offline") adb("shell", "cmd", "connectivity", "airplane-mode", "disable");
          }
        }
      }
    }
    if (area) {
      // The web captures this screen size to compare against (capture-web --height), so both viewports match.
      writeFileSync(join(OUT, "device.json"), JSON.stringify({ device: DEVICE, area, heightDp: Math.round(area.h) }, null, 2));
    }
  } finally {
    try {
      setMotion("frozen"); // scales back to 1
    } catch {
      /* device gone: nothing to restore */
    }
    releaseLock();
  }
  console.log(`native captures → ${OUT}${failures ? ` (${failures} failed)` : ""}`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  releaseLock();
  process.exit(1);
});
