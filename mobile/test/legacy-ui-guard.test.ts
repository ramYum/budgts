import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One authoritative UI (Phase 3, docs/superpowers/plans/2026-09-30-phase3-native-screens.md).
 * The pre-redesign look lives in lib/theme.ts, components/ui.tsx and components/parts.tsx, and
 * the system spinner stands where the web shows a skeleton or a pending button. No file may
 * use them except the ones still waiting to be rebuilt; a lane that rebuilds a screen deletes
 * its line here, and the list reaches [] at the Phase 3 close-out (Task Z1), when the three
 * legacy modules are deleted.
 */
const LEGACY_ALLOWED = [
  "app/(app)/(tabs)/(activity)/activity.tsx",
  "app/(app)/(tabs)/(budgets)/budgets.tsx",
  "app/(app)/(tabs)/(home)/index.tsx",
  "app/(app)/(tabs)/(more)/accounts.tsx",
  "app/(app)/(tabs)/(more)/connected-banks.tsx",
  "app/(app)/_layout.tsx",
  "app/(app)/delete-account.tsx",
  "app/(app)/map-accounts.tsx",
  "app/(app)/transaction.tsx",
  "components/parts.tsx",
  "components/ui.tsx",
];

const ROOT = join(__dirname, "..");
const LEGACY_IMPORT = /from\s+["'](?:\.\.?\/)+(?:lib\/theme|components\/ui|components\/parts|theme|ui|parts)["']/;
const SPINNER = /\bActivityIndicator\b/;
const SOURCE = /\.tsx?$/;
const TEST = /\.test\.tsx?$/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    const isSource = SOURCE.test(name) && !TEST.test(name);
    return isSource ? [relative(ROOT, path).split("\\").join("/")] : [];
  });
}

describe("one authoritative UI", () => {
  const files = ["app", "components", "lib"].flatMap((d) => sources(join(ROOT, d)));

  it("no file outside the shrinking allow-list uses the pre-redesign modules or a system spinner", () => {
    const offenders = files
      .filter((f) => !LEGACY_ALLOWED.includes(f))
      .filter((f) => {
        const src = readFileSync(join(ROOT, f), "utf8");
        return LEGACY_IMPORT.test(src) || SPINNER.test(src);
      });
    expect(offenders).toEqual([]);
  });

  it("the allow-list names only files that still exist and still need it", () => {
    const stale = LEGACY_ALLOWED.filter((f) => {
      if (!files.includes(f)) return true;
      const src = readFileSync(join(ROOT, f), "utf8");
      return !(LEGACY_IMPORT.test(src) || SPINNER.test(src));
    });
    expect(stale).toEqual([]);
  });
});
