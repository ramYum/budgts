import { ROBIN_ART, ROBIN_H, ROBIN_W, type RobinMood, type RobinRun } from "./shared";

/**
 * Crystal as SVG paths, from the one art source (src/lib/brand/robin-art.ts),
 * layer by layer as the web draws her (src/components/mascot.tsx): one path
 * per colour, each run a one-cell-tall rectangle, in art cells. The art's
 * grid starts at (-1, -1), so the viewBox does too.
 */

export type RobinLayer = "body" | "beak" | "beakOpen" | "wingUp" | "eye" | "extra";
export type ColorPaths = readonly (readonly [fill: string, d: string])[];

export const ROBIN_VIEWBOX = `-1 -1 ${ROBIN_W} ${ROBIN_H}`;

const cache = new Map<RobinRun[], ColorPaths>();

export function layerPaths(runs: RobinRun[]): ColorPaths {
  let paths = cache.get(runs);
  if (!paths) {
    const byFill = new Map<string, string>();
    for (const r of runs) byFill.set(r.fill, `${byFill.get(r.fill) ?? ""}M${r.x} ${r.y}h${r.w}v1h-${r.w}z`);
    paths = [...byFill];
    cache.set(runs, paths);
  }
  return paths;
}

export function robinLayer(mood: RobinMood, layer: RobinLayer): ColorPaths {
  return layerPaths(ROBIN_ART[mood][layer]);
}

/** Her size at a whole number of px per art cell, so every cell lands on whole pixels. */
export function robinSize(scale: number): { width: number; height: number } {
  if (!Number.isInteger(scale) || scale < 1) throw new Error(`robin scale must be a whole number ≥ 1, not ${scale}`);
  return { width: ROBIN_W * scale, height: ROBIN_H * scale };
}
