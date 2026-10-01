import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One authoritative UI (Phase 3, docs/superpowers/plans/2026-09-30-phase3-native-screens.md). The pre-redesign modules
 * (lib/theme.ts, components/ui.tsx, components/parts.tsx) are deleted, and the web shows a skeleton or a pending button
 * where a system spinner would stand: neither may come back.
 */
const ROOT = join(__dirname, "..");
const LEGACY_IMPORT = /from\s+["'](?:\.\.?\/)+(?:lib\/theme|components\/ui|components\/parts|theme|ui|parts)["']/;
const SPINNER = /\bActivityIndicator\b/;
const SOURCE = /\.tsx?$/;
const TEST = /\.test\.tsx?$/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return SOURCE.test(name) && !TEST.test(name) ? [relative(ROOT, path).split("\\").join("/")] : [];
  });
}

describe("one authoritative UI", () => {
  const files = ["app", "components", "lib"].flatMap((d) => sources(join(ROOT, d)));

  it("no file imports a pre-redesign module", () => {
    expect(files.filter((f) => LEGACY_IMPORT.test(readFileSync(join(ROOT, f), "utf8")))).toEqual([]);
  });

  it("no file uses a system spinner", () => {
    expect(files.filter((f) => SPINNER.test(readFileSync(join(ROOT, f), "utf8")))).toEqual([]);
  });
});
