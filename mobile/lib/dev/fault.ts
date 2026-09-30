import { Linking } from "react-native";

/**
 * Dev-only parity hooks (Phase 3 plan, Task P4; tools/parity/README.md). A deep link opened by the parity capture can
 * carry three params, read here and nowhere else:
 *   ?fail=home,activity  — `authFetch` answers 503 for `/api/mobile/home…` and `/api/mobile/activity…` (the error state)
 *   ?hold=home           — the request never resolves (the loading skeleton)
 *   ?clock=4000          — motion is pinned 4000 ms in (lib/motion/parity-clock.ts), the web capture's frozen frame
 * Each link replaces the previous link's params, so every capture starts from exactly what its own link says.
 *
 * Release builds compile all of it out: every entry point returns early unless `__DEV__`, and nothing here is reachable
 * from a release bundle's behaviour (tested in fault.test.ts with `dev = false`).
 */

/** `__DEV__` where React Native defines it; false elsewhere (a plain Node test run). */
export function isDev(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export type DevLinkParams = { fail: readonly string[]; hold: readonly string[]; clockMs: number | null };

const NONE: DevLinkParams = { fail: [], hold: [], clockMs: null };
let current: DevLinkParams = NONE;

function list(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9/-]+$/i.test(s));
}

/** The parity params of a deep link (`budgts://budgets?fail=budgets`); anything else in the link is ignored. */
export function parseDevLink(url: string): DevLinkParams {
  const q = url.indexOf("?");
  if (q < 0) return NONE;
  const params = new URLSearchParams(url.slice(q + 1).split("#")[0]);
  const clock = params.get("clock");
  const clockMs = clock !== null && /^\d{1,7}$/.test(clock) ? Number(clock) : null;
  return { fail: list(params.get("fail")), hold: list(params.get("hold")), clockMs };
}

/** Takes a newly opened link's params (dev builds only). */
export function applyDevLink(url: string | null, dev: boolean = isDev()): void {
  if (!dev || url === null) return;
  current = parseDevLink(url);
}

export function devLinkParams(dev: boolean = isDev()): DevLinkParams {
  return dev ? current : NONE;
}

export function resetDevLink(): void {
  current = NONE;
}

/** Which fault, if any, applies to an API path (`/api/mobile/home?m=2026-09` matches `home`). */
export function faultFor(path: string, dev: boolean = isDev()): "fail" | "hold" | null {
  if (!dev) return null;
  const endpoint = path.replace(/^\/api\/mobile\//, "").split(/[?#]/)[0];
  const hit = (names: readonly string[]) => names.some((n) => endpoint === n || endpoint.startsWith(`${n}/`));
  if (hit(current.hold)) return "hold";
  if (hit(current.fail)) return "fail";
  return null;
}

/** The injected response for a faulted path, or null to make the real request. */
export function devFaultResponse(path: string, dev: boolean = isDev()): Promise<Response> | null {
  const fault = faultFor(path, dev);
  if (fault === "hold") return new Promise<Response>(() => {});
  if (fault === "fail") {
    return Promise.resolve(new Response(JSON.stringify({ error: "parity_fault" }), { status: 503, headers: { "Content-Type": "application/json" } }));
  }
  return null;
}

let installed = false;

/** Starts listening for parity links (idempotent; dev builds only). Called from `authFetch`, before any screen loads. */
export function installDevLinkListener(dev: boolean = isDev()): void {
  if (!dev || installed) return;
  installed = true;
  let linked = false; // a link opened since: the launch link must not overwrite it
  Linking.addEventListener("url", ({ url }) => {
    linked = true;
    applyDevLink(url, dev);
  });
  void Linking.getInitialURL().then((url) => {
    if (!linked) applyDevLink(url, dev);
  });
}
