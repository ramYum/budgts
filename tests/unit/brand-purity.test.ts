import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The modules the native apps import straight from the web source (Metro
 * `watchFolders`, mobile/metro.config.js): the tokens, frames, robin and egg art and
 * icon table in src/lib/brand, Crystal's walk in src/lib/crystal, the display figures in src/lib/figures, and the
 * welcome guide's words and first-run gate (the pure files of src/components/tour and src/lib/tour). They run
 * in the browser, in Node (the generators), and under Hermes on iOS and
 * Android, so they must stay pure TypeScript: no package imports (Metro
 * resolves only mobile/node_modules, never the web app's), no React, no Next,
 * no DOM or Node APIs.
 */

const root = join(__dirname, "..", "..");
const SHARED_DIRS = ["src/lib/brand", "src/lib/crystal", "src/lib/figures"];
/** Pure files the app imports from folders that also hold web-only modules (React components, server loaders). */
const SHARED_FILES = ["src/components/tour/guide-copy.ts", "src/lib/tour/gate.ts", "src/lib/tour/steps.ts"];

const shared = [
  ...SHARED_DIRS.flatMap((dir) =>
    readdirSync(join(root, dir))
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => `${dir}/${f}`),
  ),
  ...SHARED_FILES,
];

/** `a/b/c.ts` + `../d/e.ts` → `a/d/e.ts` */
function resolveFrom(file: string, spec: string): string {
  const parts = file.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

const FORBIDDEN = [
  /\bdocument\./,
  /\bwindow\./,
  /\bnavigator\./,
  /\blocalStorage\b/,
  /\bprocess\./,
  /\brequire\(/,
  /\bimport\(/,
  /\bBuffer\b/,
  /\bfetch\(/,
];

describe("shared brand modules stay pure", () => {
  it("covers the files the app imports", () => {
    expect(shared).toEqual(
      expect.arrayContaining([
        "src/lib/brand/tokens.ts",
        "src/lib/brand/pixel-frame.ts",
        "src/lib/brand/robin-art.ts",
        "src/lib/brand/egg-art.ts",
        "src/lib/brand/icons.ts",
        "src/lib/crystal/roam.ts",
        "src/lib/figures/budget-trend.ts",
      ]),
    );
    // the app's own lists of what it shares (mobile/lib/brand/shared.ts, mobile/lib/tour/shared.ts) name only these
    for (const list of ["mobile/lib/brand/shared.ts", "mobile/lib/tour/shared.ts"]) {
      const appSide = readFileSync(join(root, list), "utf8");
      const named = [...appSide.matchAll(/from "\.\.\/\.\.\/\.\.\/(src\/[^"]+)"/g)].map((m) => m[1]!);
      expect(named.length, list).toBeGreaterThan(0);
      for (const m of named) expect(shared, m).toContain(`${m}.ts`);
    }
  });

  for (const file of shared) {
    it(`${file} imports only other shared modules, by relative .ts path`, () => {
      const text = readFileSync(join(root, file), "utf8");
      for (const m of text.matchAll(/^\s*(?:import|export)\b[^"';]*?from\s*["']([^"']+)["']/gm)) {
        const spec = m[1]!;
        expect(spec, `${file}: ${spec}`).toMatch(/^(?:\.\/|(?:\.\.\/)+)[\w/-]+\.ts$/);
        expect(shared, `${file}: ${spec}`).toContain(resolveFrom(file, spec));
      }
      expect(text, `${file}: bare import`).not.toMatch(/^\s*import\s+["']/m);
    });

    it(`${file} uses no DOM, Node or React API`, () => {
      const code = readFileSync(join(root, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      // (.ts, never .tsx: TypeScript itself rejects JSX in them)
      for (const re of FORBIDDEN) expect(code, `${file}: ${re}`).not.toMatch(re);
    });
  }
});
