import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The web modules the native apps import straight from the web source (Metro
 * `watchFolders`, mobile/metro.shared.js `SHARED`): the brand tokens, frames,
 * art and icons, Crystal's walk, and the pure display helpers and screen
 * constants (formatting, dates, the deletion screen's words, category
 * options, the welcome guide's steps and words). They run in the browser, in
 * Node, and under Hermes on iOS and Android, so every one must stay pure
 * TypeScript: no package imports (Metro resolves only mobile/node_modules,
 * never the web app's), no path aliases, no React, no Next, no DOM or Node
 * APIs, and each lives inside a folder listed in `SHARED`.
 *
 * The set is discovered, not listed: every import in the app that reaches
 * into the web source, then every relative import of those files, all the
 * way down. So a helper can be shared from a folder that also holds server
 * code; only what the app actually imports must be pure.
 */

const root = join(__dirname, "..", "..");
const mobile = join(root, "mobile");

/** `SHARED` in mobile/metro.shared.js: the one list of web folders the app may read. */
function sharedDirs(): string[] {
  const src = readFileSync(join(mobile, "metro.shared.js"), "utf8");
  const m = src.match(/const SHARED = \[([^\]]*)\]/);
  if (!m) throw new Error("mobile/metro.shared.js: no SHARED list");
  return [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
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

const SPEC = /^\s*(?:import|export)\b[^"';]*?from\s*["']([^"']+)["']/gm;

function appSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === "android" || name === "ios" || name.startsWith(".")) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? appSources(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

function resolveTs(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

const rel = (p: string) => relative(root, p).replace(/\\/g, "/");

/** Every web file the app imports, directly or through another shared file, with who imports it. */
function sharedGraph(): Map<string, string> {
  const found = new Map<string, string>();
  const queue: string[] = [];
  const dirs = ["app", "components", "lib"].map((d) => join(mobile, d));
  for (const file of dirs.flatMap(appSources)) {
    for (const m of readFileSync(file, "utf8").matchAll(SPEC)) {
      if (!m[1]!.startsWith(".")) continue;
      const target = resolveTs(file, m[1]!);
      if (!target || !rel(target).startsWith("src/")) continue;
      if (!found.has(target)) {
        found.set(target, rel(file));
        queue.push(target);
      }
    }
  }
  while (queue.length) {
    const file = queue.shift()!;
    for (const m of readFileSync(file, "utf8").matchAll(SPEC)) {
      const target = m[1]!.startsWith(".") ? resolveTs(file, m[1]!) : null;
      if (target && !found.has(target)) {
        found.set(target, rel(file));
        queue.push(target);
      }
    }
  }
  return found;
}

describe("web modules the apps import stay pure", () => {
  const dirs = sharedDirs();
  const graph = sharedGraph();

  it("finds the brand sources the app is built on", () => {
    expect([...graph.keys()].map(rel)).toEqual(
      expect.arrayContaining([
        "src/lib/brand/tokens.ts",
        "src/lib/brand/pixel-frame.ts",
        "src/lib/brand/robin-art.ts",
        "src/lib/brand/icons.ts",
        "src/lib/crystal/roam.ts",
        "src/lib/display/money.ts",
        "src/lib/display/dates.ts",
      ]),
    );
  });

  for (const [file, importer] of graph) {
    const name = rel(file);
    it(`${name} (imported by ${importer}) sits in a SHARED folder and is plain .ts`, () => {
      expect(dirs.some((d) => name.startsWith(`${d}/`)), `${name}: add its folder to SHARED in mobile/metro.shared.js`).toBe(true);
      expect(name.endsWith(".ts"), `${name}: JSX never reaches the app from the web`).toBe(true);
    });

    it(`${name} imports only other shared files, by relative .ts path`, () => {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(SPEC)) {
        expect(m[1], `${name}: ${m[1]} (packages and "@/" aliases can't resolve in the app)`).toMatch(/^\.{1,2}\/[\w./-]+\.ts$/);
      }
      expect(text, `${name}: bare import`).not.toMatch(/^\s*import\s+["']/m);
    });

    it(`${name} uses no DOM, Node or React API`, () => {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const re of FORBIDDEN) expect(code, `${name}: ${re}`).not.toMatch(re);
    });
  }
});
