/**
 * Performance guardrails — static checks for the anti-patterns behind the
 * 2026-09-24 "the live app is extremely slow" incident (see "Performance
 * rules" in docs/conventions.md). Each check names the rule it protects, so a
 * failure says what regressed and why it matters. Behavioral coverage lives
 * next to the code (realtime-refresh.test.tsx, limited-history-banner.test.ts,
 * tests/e2e/router-cache.spec.ts); these catch the shape of a regression
 * before it ships.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { FUNCTION_MAX_DURATION_SECONDS, SYNC_LEASE_SECONDS } from "@/lib/plaid/item-store";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const DASHBOARD = join(SRC, "app", "(app)", "(dashboard)");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const rel = (p: string) => relative(ROOT, p).split(sep).join("/");
const isSource = (p: string) => /\.(ts|tsx)$/.test(p) && !/\.test\.(ts|tsx)$/.test(p);
const sourceFiles = (dir: string) => walk(dir).filter(isSource);
const read = (p: string) => readFileSync(p, "utf8");
/** Source with comments stripped, so a docstring naming an anti-pattern doesn't trip a check. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const isClient = (text: string) => /^\s*["']use client["']/m.test(text.slice(0, 200));

describe("performance guardrails", () => {
  // Rule 1: request-time identity comes from getSessionUser() (local JWT
  // verification via getClaims), never auth.getUser()/getSession(), which are
  // a network round trip to Supabase Auth on every call. Two of those per page
  // were the single biggest cost in the incident.
  it("read paths never call auth.getUser() or auth.getSession()", () => {
    const offenders = [join(SRC, "app"), join(SRC, "components"), join(SRC, "lib")]
      .flatMap(sourceFiles)
      .filter((p) => /auth\.(getUser|getSession)\(/.test(code(p)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("only the known write-path server actions use the network getUser()", () => {
    // Write actions may deliberately re-check the session against Auth. Adding
    // one is fine, but it must be a conscious choice: extend this list.
    const allowed = ["src/server/onboarding.ts", "src/server/tour.ts", "src/server/transactions.ts"];
    const users = sourceFiles(join(SRC, "server"))
      .filter((p) => /auth\.(getUser|getSession)\(/.test(code(p)))
      .map(rel)
      .sort();
    expect(users).toEqual(allowed);
  });

  // Rule 2: the client router cache must keep dynamic pages briefly, or every
  // tab tap waits on a full server render.
  it("keeps a non-zero client router cache for dynamic pages", () => {
    const stale = nextConfig.experimental?.staleTimes;
    expect(stale?.dynamic ?? 0).toBeGreaterThanOrEqual(30);
  });

  // Rule 3: a tap must paint something immediately.
  it("the dashboard group has a loading.tsx skeleton", () => {
    expect(existsSync(join(DASHBOARD, "loading.tsx"))).toBe(true);
  });

  // Rule 4: Home fetched the same transactions three times. One paginated
  // window fetch (sliced in memory per month) plus the bounded "recent 5".
  it("Home makes one paginated transactions fetch", () => {
    const home = read(join(DASHBOARD, "page.tsx"));
    expect(home.match(/fetchAllRows\(/g) ?? []).toHaveLength(1);
    expect((home.match(/\.from\("transactions"\)/g) ?? []).length).toBeLessThanOrEqual(2);
  });

  // Rule 5: every server-side transactions read is bounded — paginated via
  // fetchAllRows/.range(), capped with .limit(), a head-only count, or a
  // single row. An unbounded select is both slow and silently truncated at
  // PostgREST's 1000-row cap.
  it("server-rendered transactions queries are bounded", () => {
    const BOUNDED = /\.range\(|\.limit\(|head:\s*true|\.single\(|\.maybeSingle\(|fetchAllRows\(|applyNeedsCategoryFilter\(/;
    const offenders: string[] = [];
    for (const p of [join(SRC, "app"), join(SRC, "components")].flatMap(sourceFiles)) {
      const text = read(p);
      if (isClient(text)) continue;
      const lines = text.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!line.includes('.from("transactions")')) return;
        // The query's own chain: from a few lines above (a wrapping
        // fetchAllRows/applyNeedsCategoryFilter call) to the next query.
        const tail: string[] = [];
        for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
          if (lines[j].includes(".from(")) break;
          tail.push(lines[j]);
        }
        const window = [...lines.slice(Math.max(0, i - 3), i + 1), ...tail].join("\n");
        if (!BOUNDED.test(window)) offenders.push(`${rel(p)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  // Rule 3: fetchAllRows sizes its parallel pages from the first page's count,
  // so every caller's page builder must pass `count` to its select. Without it
  // a window over 1000 rows throws instead of paging (never a silent subset).
  it("every fetchAllRows page builder requests the count", () => {
    const offenders = sourceFiles(SRC)
      .filter((p) => !p.endsWith(join("supabase", "fetch-all-rows.ts")))
      .filter((p) => /fetchAllRows\s*(<[^>]*>)?\s*\(/.test(code(p)))
      .filter((p) => !/\{\s*count\s*\}\s*,?\s*\)/.test(code(p)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("server components and routes never select *", () => {
    const offenders = [join(SRC, "app"), join(SRC, "components")]
      .flatMap(sourceFiles)
      .filter((p) => /\.select\(\s*["']\*["']/.test(read(p)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  // Rule 6: realtime refreshes are coalesced, and only for changes the page
  // doesn't already show. The behavior is covered by
  // realtime-refresh-listener.test.tsx; this pins that nothing else opens a
  // channel and that the listener keeps its debounce + render-time gate.
  it("only RealtimeRefresh subscribes to realtime channels, and it is debounced and render-gated", () => {
    const subscribers = [join(SRC, "app"), join(SRC, "components"), join(SRC, "lib")]
      .flatMap(sourceFiles)
      .filter((p) => /\.channel\(/.test(code(p)))
      .map(rel);
    expect(subscribers).toEqual(["src/components/realtime-refresh-listener.tsx"]);
    const rt = read(join(SRC, "components", "realtime-refresh-listener.tsx"));
    expect(rt).toMatch(/DEBOUNCE_MS\s*=\s*\d{3,}/);
    expect(rt).toMatch(/removeChannel\(/);
    expect(rt).toMatch(/commit_timestamp/);
    expect(read(join(SRC, "components", "realtime-refresh.tsx"))).toMatch(/renderedAt=/);
  });

  // Rule 12: one refresh per edit. A server action's revalidateUserData()
  // re-renders the current page in its own response; a client
  // router.refresh() after it is a second full server render. The only
  // client refreshes left: the realtime listener (changes this tab didn't
  // make) and ConnectBank's cancel path (the exchange route handler created
  // the bank but can't update the page).
  it("client code never follows a server action with router.refresh(); actions revalidate through one helper", () => {
    const refreshers = [join(SRC, "app"), join(SRC, "components")]
      .flatMap(sourceFiles)
      .filter((p) => /router\.refresh\(\)/.test(code(p)))
      .map(rel)
      .sort();
    expect(refreshers).toEqual(["src/components/plaid/connect-bank.tsx", "src/components/realtime-refresh-listener.tsx"]);
    const revalidators = sourceFiles(SRC)
      .filter((p) => /revalidatePath\(/.test(code(p)))
      .map(rel);
    expect(revalidators).toEqual(["src/server/revalidate.ts"]);
  });

  // Rule 7: charts are server-rendered cell markup; no chart library ships.
  it("charts need no chart library in the client bundle", () => {
    const pkg = JSON.parse(read(join(ROOT, "package.json"))) as { dependencies?: Record<string, string> };
    for (const lib of ["recharts", "chart.js", "d3", "victory", "@nivo/core"]) {
      expect(pkg.dependencies?.[lib], lib).toBeUndefined();
    }
    const overview = read(join(SRC, "components", "spending-overview.tsx"));
    expect(overview).not.toMatch(/^"use client"/m);
  });

  // Rule 8: Zod (~370 KB of browser JS) is server-only. Client components take
  // plain option lists (account types, category colours, currencies) from
  // Zod-free modules; the schemas in src/lib/validation validate against them.
  it("client components never import Zod or the validation schemas", () => {
    const offenders = [join(SRC, "app"), join(SRC, "components")]
      .flatMap(sourceFiles)
      .filter((p) => isClient(read(p)))
      .filter((p) => /from\s+["'](zod|@\/lib\/validation\/[^"']+)["']/.test(code(p)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  // Rule 8: the service worker may only serve content-hashed build assets
  // cache-first; anything with a stable URL must revalidate, or a replaced
  // file is served stale forever.
  it("service worker is cache-first only for /_next/static", () => {
    const sw = read(join(ROOT, "public", "sw.js"));
    const imageBranch = sw.slice(sw.indexOf("svg|png"));
    expect(sw).toMatch(/startsWith\("\/_next\/static\/"\)\)\s*\{/);
    expect(imageBranch.slice(0, imageBranch.indexOf("return;"))).toMatch(/waitUntil\(/);
  });

  // Rule 10: a stopped worker must not delay page loads — navigation preload
  // starts the request while the worker boots, and navigations use it.
  it("service worker uses navigation preload for page loads", () => {
    const sw = read(join(ROOT, "public", "sw.js"));
    expect(sw).toMatch(/navigationPreload\?\.enable\(\)/);
    expect(sw.slice(sw.indexOf('request.mode === "navigate"'))).toMatch(/await event\.preloadResponse/);
  });

  // Rule 11: every Plaid sync goes through the per-Item lease (sync-runner.ts),
  // so the webhook, the user's actions and the sweep can never sync one Item
  // twice at once. A direct syncItem() call would bypass the claim.
  it("only the sync runner calls syncItem, and the Plaid sync routes bound their duration", () => {
    const callers = sourceFiles(SRC)
      .filter((p) => /from\s+["'][^"']*sync-item["']/.test(code(p)) && /\bsyncItem\b/.test(code(p)))
      .map(rel);
    expect(callers).toEqual(["src/lib/plaid/sync-runner.ts"]);
    for (const route of ["sync-due", "webhook"]) {
      expect(code(join(SRC, "app", "api", "plaid", route, "route.ts"))).toMatch(/export const maxDuration = \d+/);
    }
  });

  // Rule 11: the sync lease is derived from the platform's duration ceiling.
  // A holder can't outlive its function, so the lease only needs to cover the
  // longest function plus margin — every `maxDuration` in the app (route
  // handlers, and pages, whose value also bounds their server actions) must
  // stay at or under the ceiling the lease was derived from.
  it("no function may outlive the Plaid sync lease", () => {
    const declared = walk(join(SRC, "app"))
      .filter(isSource)
      .flatMap((p) => [...code(p).matchAll(/export const maxDuration = (\d+)/g)].map((m) => [rel(p), Number(m[1])] as const));
    expect(declared.length).toBeGreaterThan(0);
    for (const [, seconds] of declared) expect(seconds).toBeLessThanOrEqual(FUNCTION_MAX_DURATION_SECONDS);
    expect(SYNC_LEASE_SECONDS).toBeGreaterThan(FUNCTION_MAX_DURATION_SECONDS);
  });
});
