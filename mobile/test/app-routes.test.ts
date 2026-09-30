import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Expo Router makes every file under app/ a route and Metro bundles it, so a test there drags vitest (and vite) into
 * the app's bundle and breaks it (found merging p3-c-auth, 2026-09-30). Screen tests live beside their components.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("app/ holds routes only", () => {
  it("has no test files", () => {
    const root = join(__dirname, "..", "app");
    expect(files(root).filter((f) => /\.test\.tsx?$/.test(f)).map((f) => relative(root, f))).toEqual([]);
  });
});
