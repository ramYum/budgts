/**
 * P3: web reference captures. Signs in as each parity user on the local staging-wired build (`npm run parity:serve`,
 * port 3200) and captures every screen × state at phone size, twice:
 *   rest   — `prefers-reduced-motion: reduce`: the web's motion-off resting frames (every animation finished or off);
 *   frozen — motion on, the page clock paused and every animation pinned at the screen's `freezeAt` ms.
 * Each capture is `<out>/<device>/<screen>-<state>-<set>.png` plus a `.json` of every `[data-testid]` box in CSS px.
 *
 *   npx tsx tools/parity/capture-web.ts [--out .tmp/parity/web] [--device android-412,iphone-390]
 *        [--screen home,budgets] [--set rest,frozen] [--base http://localhost:3200] [--now real|<ISO>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, devices as pwDevices, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { loadStagingEnv } from "./env";
import { readSeededUsers, tokenHashFor } from "./auth";
import { PARITY_TIME_ZONE, type ParityUserName } from "./data";
import {
  DEVICES,
  SCREENS,
  STATE_USER,
  captureName,
  webPathFor,
  type DeviceId,
  type MotionSet,
  type Screen,
  type StateId,
} from "./screens";

export type Box = { id: string; key: string; x: number; y: number; w: number; h: number };
export type CaptureMeta = {
  side: "web" | "native";
  screen: string;
  state: StateId;
  set: MotionSet;
  device: DeviceId;
  /** logical size of the captured image (CSS px / dp) and its pixel scale */
  width: number;
  height: number;
  scale: number;
  /** the screen-root rect inside the image, logical units (the web viewport is the whole image) */
  root: { x: number; y: number; w: number; h: number };
  boxes: Box[];
  url?: string;
};

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const list = (name: string) => opt(name)?.split(",").filter(Boolean);

const OUT = resolve(opt("out") ?? ".tmp/parity/web");
const BASE = opt("base") ?? "http://localhost:3200";
const DEVICE_IDS = (list("device") ?? ["android-412", "iphone-390"]) as DeviceId[];
const SETS = (list("set") ?? ["rest", "frozen"]) as MotionSet[];
const ONLY = list("screen");
const DEFAULT_FREEZE = 4000;
const START = Date.now();

/**
 * The page clock: by default 10:00 in New York on today's date there (morning either side of DST), so a clock-driven
 * greeting and relative times read the same on every run. `--now real` keeps the real time, for a web-vs-native run
 * taken back to back with the device (whose clock is real); `--now <ISO>` pins any instant.
 */
const NOW = opt("now");
function fixedNow(): Date {
  if (NOW === "real") return new Date(START);
  if (NOW) return new Date(NOW);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: PARITY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${today}T14:00:00Z`);
}

async function newContext(browser: Browser, device: DeviceId, set: MotionSet): Promise<BrowserContext> {
  const d = DEVICES[device];
  const ua = d.mobileUA === "android" ? pwDevices["Pixel 7"].userAgent : pwDevices["iPhone 15"].userAgent;
  return browser.newContext({
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: d.scale,
    isMobile: true,
    hasTouch: true,
    userAgent: ua,
    locale: "en-US",
    timezoneId: PARITY_TIME_ZONE, // the users' stored zone: <TimeZoneSync> must see no change
    reducedMotion: set === "rest" ? "reduce" : "no-preference",
    colorScheme: "light",
    baseURL: BASE,
  });
}

async function signIn(page: Page, email: string, next: string): Promise<void> {
  const hash = await tokenHashFor(email);
  await page.goto(`/auth/callback?token_hash=${hash}&type=magiclink&next=${encodeURIComponent(next)}`);
  await page.waitForLoadState("networkidle");
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((r) => {
              img.addEventListener("load", r, { once: true });
              img.addEventListener("error", r, { once: true });
            }),
        ),
    );
  });
}

async function collectBoxes(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const seen = new Map<string, number>();
    const out: { id: string; key: string; x: number; y: number; w: number; h: number }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-testid]"))) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || style.display === "none") continue;
      const id = el.dataset.testid!;
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      out.push({ id, key: n === 1 ? id : `${id}#${n}`, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    return out;
  });
}

async function captureOne(page: Page, screen: Screen, state: StateId, set: MotionSet, device: DeviceId): Promise<void> {
  const path = webPathFor(screen, state);
  const freezeAt = screen.freezeAt ?? DEFAULT_FREEZE;
  if (set === "frozen") {
    // Fresh clock per capture: paused before the page loads, so JS timers only move when told to.
    await page.clock.install({ time: fixedNow() });
    await page.clock.pauseAt(new Date(fixedNow().getTime() + 1000)); // ahead of the install time, which is already flowing
  } else {
    // Date pinned, timers free: relative times ("Synced 5 min ago") and the greeting read the same on every run.
    await page.clock.setFixedTime(fixedNow());
  }
  await page.goto(path);
  await settle(page);
  if (set === "frozen") {
    await page.clock.runFor(freezeAt);
    await page.evaluate((t) => {
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = t;
      }
    }, freezeAt);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const d = DEVICES[device];
  const name = captureName(screen.id, state, set);
  const dir = join(OUT, device);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), animations: set === "rest" ? "disabled" : "allow", caret: "hide", scale: "device" });
  const meta: CaptureMeta = {
    side: "web",
    screen: screen.id,
    state,
    set,
    device,
    width: d.width,
    height: d.height,
    scale: d.scale,
    root: { x: 0, y: 0, w: d.width, h: d.height },
    boxes: await collectBoxes(page),
    url: new URL(page.url()).pathname,
  };
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(meta, null, 2));
  console.log(`  ${device} ${name}  ${meta.boxes.length} ids  ${meta.url}`);
}

async function main() {
  loadStagingEnv();
  const seeded = readSeededUsers();
  const screens = ONLY ? SCREENS.filter((s) => ONLY.includes(s.id)) : SCREENS;
  if (screens.length === 0) throw new Error(`parity: no screens match ${ONLY?.join(",")}`);

  // Group the work by user so each browser context signs in once.
  const byUser = new Map<ParityUserName | null, { screen: Screen; state: StateId }[]>();
  for (const screen of screens) {
    for (const state of screen.states) {
      const user = STATE_USER[state];
      byUser.set(user, [...(byUser.get(user) ?? []), { screen, state }]);
    }
  }

  const browser = await chromium.launch();
  let failures = 0;
  try {
    for (const device of DEVICE_IDS) {
      for (const set of SETS) {
        for (const [user, jobs] of byUser) {
          const context = await newContext(browser, device, set);
          try {
            if (user) {
              const u = seeded.users[user];
              if (!u) throw new Error(`parity: user "${user}" is not seeded`);
              const first = await context.newPage();
              await signIn(first, u.email, user === "firstrun" ? "/onboarding" : user === "tour" ? "/tour" : "/more");
              await first.close();
            }
            for (const job of jobs) {
              const page = await context.newPage(); // a fresh page per capture: a clean clock and no carried-over state
              try {
                await captureOne(page, job.screen, job.state, set, device);
              } catch (e) {
                failures++;
                console.error(`  FAILED ${device} ${job.screen.id}-${job.state}-${set}: ${e instanceof Error ? e.message : e}`);
              } finally {
                await page.close();
              }
            }
          } finally {
            await context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`web captures → ${OUT}${failures ? ` (${failures} failed)` : ""}`);
  if (failures) process.exit(1);
}

if (process.argv[1] && /capture-web\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
