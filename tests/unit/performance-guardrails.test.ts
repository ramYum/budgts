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

  it("server components and routes never select *", () => {
    const offenders = [join(SRC, "app"), join(SRC, "components")]
      .flatMap(sourceFiles)
      .filter((p) => /\.select\(\s*["']\*["']/.test(read(p)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  // Rule 6: realtime refreshes are coalesced. The behavior is covered by
  // realtime-refresh.test.tsx; this pins that the layout keeps using the
  // debounced component rather than an ad-hoc per-event router.refresh().
  it("only RealtimeRefresh subscribes to realtime channels, and it is debounced", () => {
    const subscribers = [join(SRC, "app"), join(SRC, "components"), join(SRC, "lib")]
      .flatMap(sourceFiles)
      .filter((p) => /\.channel\(/.test(code(p)))
      .map(rel);
    expect(subscribers).toEqual(["src/components/realtime-refresh.tsx"]);
    const rt = read(join(SRC, "components", "realtime-refresh.tsx"));
    expect(rt).toMatch(/DEBOUNCE_MS\s*=\s*\d{3,}/);
    expect(rt).toMatch(/removeChannel\(/);
  });

  // Rule 7: the heavy chart library stays out of the first-load bundle.
  it("recharts is only reached through a next/dynamic import", () => {
    const importers = [join(SRC, "app"), join(SRC, "components")]
      .flatMap(sourceFiles)
      .filter((p) => /from\s+["']recharts["']/.test(read(p)))
      .map(rel);
    expect(importers).toEqual(["src/components/spending-charts.tsx"]);
    const staticImporters = sourceFiles(SRC)
      .filter((p) => /from\s+["'][^"']*spending-charts["']/.test(read(p)))
      .map(rel);
    expect(staticImporters).toEqual([]);
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
});
