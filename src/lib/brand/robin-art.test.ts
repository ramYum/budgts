import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ROBIN_ART, ROBIN_FEET_X, ROBIN_H, ROBIN_W, type RobinMood, type RobinRun } from "./robin-art";

/** The pixels a static render paints (body, beak, eye, extra, in paint
 * order), one row per line, each cell its fill or ".". */
function raster(layers: RobinRun[][]): string[] {
  const grid = Array.from({ length: ROBIN_H }, () => Array<string>(ROBIN_W).fill("."));
  for (const layer of layers) for (const r of layer) for (let i = 0; i < r.w; i++) grid[r.y + 1]![r.x + 1 + i] = r.fill;
  return grid.map((row) => row.join(" "));
}

const sha = (rows: string[]) => createHash("sha256").update(rows.join("\n")).digest("hex");

describe("robin art", () => {
  // Pinned before the animation-only layers (beakOpen, wingUp) existed: the
  // logo, the mascot at rest and every app icon must stay pixel-identical.
  const PINNED: Record<RobinMood, string> = {
    normal: "a725d7be7a8f2c2390cc0b37b5fd7aaf7dc647f1f077b115958cda42519e9894",
    happy: "a725d7be7a8f2c2390cc0b37b5fd7aaf7dc647f1f077b115958cda42519e9894",
    curious: "f190e945ad4e3765dd10c1486f05d2a759de29bd649cf5b2627ff2dfec8e85c3",
    sleepy: "5f1482e0cfee6d3b187df58602c1c21c64d7ee5d63df2fa7b9b50e61362aa3f5",
  };

  it.each(Object.keys(PINNED) as RobinMood[])("keeps the static %s robin pixel-identical", (mood) => {
    const art = ROBIN_ART[mood];
    expect(sha(raster([art.body, art.beak, art.eye, art.extra]))).toBe(PINNED[mood]);
  });

  it("stands on ROBIN_FEET_X: its feet are centred there, so a turn pivoting on it keeps them over their shadow", () => {
    const rows = raster([ROBIN_ART.happy.body]).slice(-3); // the leg rows, bottom of the art
    const xs = rows.flatMap((row) => row.split(" ").flatMap((fill, x) => (fill === "#111111" ? [x] : [])));
    const mid = (Math.min(...xs) + Math.max(...xs) + 1) / 2 / ROBIN_W;
    expect(ROBIN_FEET_X).toBeCloseTo(mid, 6);
    // mirrored about that point (facing left), the feet land on the same cells
    const mirrored = xs.map((x) => Math.round(2 * ROBIN_FEET_X * ROBIN_W - x - 1)).sort((a, b) => a - b);
    expect(mirrored).toEqual([...xs].sort((a, b) => a - b));
  });

  it("raises the wing behind the head: the flap frame never paints the face or the breast", () => {
    for (const r of ROBIN_ART.happy.wingUp) {
      expect(r.x + r.w - 1).toBeLessThanOrEqual(8);
      expect(r.y).toBeLessThanOrEqual(14);
    }
  });

  it("covers the whole resting wing, so no dark cell shows through mid-flap", () => {
    const art = ROBIN_ART.happy;
    const rest = raster([art.body, art.beak, art.eye, art.extra]);
    const flap = raster([art.body, art.beak, art.wingUp, art.eye]);
    const WING = "#3b2a20";
    rest.forEach((row, y) =>
      row.split(" ").forEach((fill, x) => {
        // below the raised wing's reach, every resting-wing cell is repainted
        if (fill === WING && y > 9) expect(flap[y]!.split(" ")[x]).not.toBe(WING);
      }),
    );
  });
});
