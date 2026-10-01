import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One request-id generator (Phase 3 Z0): every create's idempotency key comes from `newRequestId()` in
 * lib/api/request-id.ts, so app code holds exactly one `randomUUID` call, there. Test files (their mocks) are excluded.
 */
const ROOT = join(__dirname, "..");
const SOURCE = /\.tsx?$/;
const TEST = /\.test\.tsx?$/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return SOURCE.test(name) && !TEST.test(name) ? [relative(ROOT, path).split("\\").join("/")] : [];
  });
}

describe("one request-id generator", () => {
  it("app code calls randomUUID exactly once, in lib/api/request-id.ts", () => {
    const calls = ["app", "components", "lib"]
      .flatMap((d) => sources(join(ROOT, d)))
      .flatMap((f) => [...readFileSync(join(ROOT, f), "utf8").matchAll(/\brandomUUID\s*\(/g)].map(() => f));
    expect(calls).toEqual(["lib/api/request-id.ts"]);
  });

  it("no screen or component takes a generator injected as a prop", () => {
    const injected = ["app", "components"]
      .flatMap((d) => sources(join(ROOT, d)))
      .filter((f) => /\bnewRequestId\s*[:=]\s*[({]|\bnewRequestId\??:\s*\(\)\s*=>|newRequestId=\{/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(injected).toEqual([]);
  });
});
