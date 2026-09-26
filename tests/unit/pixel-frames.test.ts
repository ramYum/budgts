import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FRAMES, PALETTE, frameCells, framesCss } from "@/lib/brand/pixel-frame";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const grid = (spec: Parameters<typeof frameCells>[0]) =>
  frameCells(spec).map((row) => row.map((c) => (c === "line" ? "#" : c === "fill" ? "." : " ")).join(""));

describe("pixel frames", () => {
  it("the committed stylesheet is what the frame table generates", () => {
    // Regenerate with: node tools/generate-pixel-frames.mjs
    expect(read("src/app/pixel-frames.css")).toBe(framesCss());
  });

  it("paints only with the design tokens", () => {
    const css = read("src/app/globals.css");
    const token: Record<keyof typeof PALETTE, string> = {
      ink: "--charcoal",
      ash: "--ash",
      stone: "--stone",
      silver: "--silver",
      gray: "--gray",
      paper: "--paper",
      white: "--white",
      surface2: "--surface-2",
      signal: "--signal",
      signalStrong: "--signal-strong",
      signalInk: "--signal-ink",
      signalWash: "--signal-wash",
      signalLine: "--signal-line",
      growth: "--growth",
      growthWash: "--growth-wash",
      warnWash: "--warn-wash",
    };
    for (const [key, name] of Object.entries(token)) {
      expect(css, `${name} should be ${PALETTE[key as keyof typeof PALETTE]}`).toMatch(
        new RegExp(`${name}:\\s*${PALETTE[key as keyof typeof PALETTE]};`, "i"),
      );
    }
  });

  it("draws a card's corner as a three-step stair of 2px cells", () => {
    expect(grid({ r: 3, t: 1, k: 4 })).toEqual([
      "   ###   ",
      " ##...## ",
      " #.....# ",
      "#.......#",
      "#.......#",
      "#.......#",
      " #.....# ",
      " ##...## ",
      "   ###   ",
    ]);
  });

  it("keeps every state of a frame on the same box, so focus never shifts content", () => {
    for (const { name, k, states } of FRAMES) {
      for (const [suffix, spec] of states) expect(spec.k, `${name}${suffix}`).toBe(k);
    }
  });

  it("thickens a focused line inward without touching the edge's middle cell", () => {
    expect(() => frameCells({ r: 3, t: 2, k: 4 })).not.toThrow();
    expect(() => frameCells({ r: 3, t: 1, k: 3 })).toThrow();
  });
});
