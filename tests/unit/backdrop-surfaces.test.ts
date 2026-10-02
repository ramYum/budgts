import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FRAMES } from "../../src/lib/brand/pixel-frame";

/**
 * On the sunset backdrop the shell deepens --muted for text straight on the
 * sky; every surface must take the gray back (globals.css `.on-backdrop`), or
 * secondary text inside a card turns the sky's purple. Every stepped frame
 * paints a fill, so each one has to be in that rule: a new frame added to
 * pixel-frame.ts without it fails here.
 */
const css = readFileSync(join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8");
const rule = css.match(/\.on-backdrop\s*:is\(([^)]*)\)\s*\{\s*--muted:\s*var\(--ash\);\s*\}/);

describe("surfaces on the sunset backdrop", () => {
  it("restore the gray muted in one rule", () => {
    expect(rule).not.toBeNull();
  });

  it("covers every stepped frame in pixel-frame.ts", () => {
    const listed = new Set(rule![1]!.split(",").map((s) => s.trim()));
    for (const frame of FRAMES) expect(listed.has(`.${frame.name}`), frame.name).toBe(true);
  });

  it("covers the plain surfaces and form fields", () => {
    const listed = new Set(rule![1]!.split(",").map((s) => s.trim()));
    for (const s of [".card", ".bg-surface", "input", "textarea", "select"]) expect(listed.has(s), s).toBe(true);
  });
});
