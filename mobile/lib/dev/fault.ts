/**
 * Development builds only: fault injection for parity captures of the states
 * a healthy staging account never shows (Phase 3 plan, P4). A capture opens a
 * screen's link with, for example:
 *   `?fail=home`          → GET /api/mobile/home answers 503 (the error screen)
 *   `?fail=home:offline`  → the request fails like a dropped connection (the offline screen)
 *   `?hold=home`          → the request never answers (the loading skeleton)
 * `home` matches any path under /api/mobile/home. The root layout sets these
 * from the link's params; release builds never do, and `devFault` answers
 * null there whatever was set.
 */
export type DevFault = { kind: "fail" } | { kind: "offline" } | { kind: "hold" };

let faults: { fail: string | null; hold: string | null } = { fail: null, hold: null };

const ENDPOINT = /^[a-z][a-z0-9/-]{0,60}$/;

function clean(v: unknown): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && ENDPOINT.test(s.replace(/:offline$/, "")) ? s : null;
}

export function setDevFaults(params: { fail?: unknown; hold?: unknown }): void {
  faults = __DEV__ ? { fail: clean(params.fail), hold: clean(params.hold) } : { fail: null, hold: null };
}

const matches = (endpoint: string, path: string) => {
  const base = `/api/mobile/${endpoint}`;
  return path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}?`);
};

/** The fault to apply to `path`, if any (always null in a release build). */
export function devFault(path: string): DevFault | null {
  if (!__DEV__) return null;
  if (faults.hold && matches(faults.hold, path)) return { kind: "hold" };
  if (faults.fail) {
    const offline = faults.fail.endsWith(":offline");
    const endpoint = faults.fail.replace(/:offline$/, "");
    if (matches(endpoint, path)) return offline ? { kind: "offline" } : { kind: "fail" };
  }
  return null;
}

/** The response a faulted request gets instead of the network's. */
export function faultResponse(fault: DevFault): Promise<Response> {
  if (fault.kind === "hold") return new Promise<Response>(() => {});
  if (fault.kind === "offline") return Promise.reject(new TypeError("Network request failed"));
  return Promise.resolve(new Response(JSON.stringify({ error: "unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } }));
}
