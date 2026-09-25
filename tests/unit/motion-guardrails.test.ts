/**
 * Motion guardrails: static checks for the 2026-09-25 "tapping a transaction
 * opens a translucent box and nothing else" bug. An entrance animation with
 * fill-mode `both`/`forwards` pins its end keyframe forever, and an ended
 * transform animation leaves `matrix(1, 0, 0, 1, 0, 0)` rather than `none`.
 * That makes the element the containing block for every position:fixed
 * descendant, so the bottom sheets (src/components/overlay.tsx) laid out
 * inside the page instead of the screen. See the note above the motion block
 * in src/app/globals.css.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const rel = (p: string) => relative(ROOT, p).split(sep).join("/");
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("motion guardrails", () => {
  it("no CSS animation holds its end state (fill-mode both/forwards)", () => {
    const sheets = walk(SRC).filter((p) => p.endsWith(".css"));
    expect(sheets.map(rel)).toEqual(
      expect.arrayContaining(["src/app/globals.css", "src/components/tour/guide.module.css"]),
    );
    const offenders = sheets.flatMap((p) =>
      (withoutComments(readFileSync(p, "utf8")).match(/animation(?:-fill-mode)?\s*:[^;]*;/g) ?? [])
        .filter((d) => /\b(both|forwards)\b/.test(d))
        .map((d) => `${rel(p)}: ${d}`),
    );
    expect(offenders).toEqual([]);
  });

  it("no Tailwind animation class holds its end state either", () => {
    const offenders = walk(SRC)
      .filter((p) => /\.tsx?$/.test(p))
      .filter((p) => /animate-\[[^\]]*\b(both|forwards)\b|fill-mode-(both|forwards)/.test(readFileSync(p, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
