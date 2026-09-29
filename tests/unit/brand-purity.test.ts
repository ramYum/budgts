import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The modules the native apps import straight from the web source (Metro
 * `watchFolders`, mobile/metro.config.js): the tokens, frames, robin art and
 * icon table in src/lib/brand, and Crystal's walk in src/lib/crystal. They run
 * in the browser, in Node (the generators), and under Hermes on iOS and
 * Android, so they must stay pure TypeScript: no package imports (Metro
 * resolves only mobile/node_modules, never the web app's), no React, no Next,
 * no DOM or Node APIs.
 */

const root = join(__dirname, "..", "..");
const SHARED_DIRS = ["src/lib/brand", "src/lib/crystal"];

const shared = SHARED_DIRS.flatMap((dir) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => `${dir}/${f}`),
);

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
        "src/lib/brand/icons.ts",
        "src/lib/crystal/roam.ts",
      ]),
    );
    // the app's own list of what it shares (mobile/lib/brand/shared.ts) names only these
    const appSide = readFileSync(join(root, "mobile/lib/brand/shared.ts"), "utf8");
    for (const m of appSide.matchAll(/from "\.\.\/\.\.\/\.\.\/(src\/lib\/[^"]+)"/g)) {
      expect(shared, m[1]).toContain(`${m[1]}.ts`);
    }
  });

  for (const file of shared) {
    it(`${file} imports only other shared modules, by relative .ts path`, () => {
      const text = readFileSync(join(root, file), "utf8");
      for (const m of text.matchAll(/^\s*(?:import|export)\b[^"';]*?from\s*["']([^"']+)["']/gm)) {
        const spec = m[1]!;
        expect(spec, `${file}: ${spec}`).toMatch(/^\.\/[\w-]+\.ts$/);
        const dir = file.slice(0, file.lastIndexOf("/"));
        expect(shared, `${file}: ${spec}`).toContain(`${dir}/${spec.slice(2)}`);
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
