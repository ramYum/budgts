import {
  BACKDROP_CELL,
  BACKDROP_MUTED,
  BACKDROP_SKY,
  backdropSize,
  drawBackdrop,
  rectsPath,
  sceneRects,
} from "../../../src/lib/brand/scene-art";
import { snapPath } from "./snap";

/**
 * Crystal's sunset forest behind the signed-in app (option B, "Full backdrop", owner-approved 2026-10-02), from the one
 * scene source the web draws too (src/lib/brand/scene-art.ts): the grid, its merged rectangles and their path data are
 * the web's; only the last step is native, every cell edge snapped to the device-pixel grid (lib/brand/snap.ts), since
 * react-native-svg has no crispEdges.
 */
export { BACKDROP_CELL, BACKDROP_MUTED, BACKDROP_SKY, backdropSize };

export type BackdropSize = { cols: number; rows: number; land: number };
export type BackdropPaths = readonly (readonly [fill: string, d: string])[];

// A few sizes at most (portrait, landscape, a split screen); the scene is drawn once per size and ratio.
const cache = new Map<string, BackdropPaths>();
const CACHE_SIZES = 4;

/** The scene at a grid size as one path per colour, in px from its top-left corner, every edge on a device pixel. */
export function backdropPaths({ cols, rows, land }: BackdropSize, ratio: number): BackdropPaths {
  const key = `${cols}x${rows}@${land}/${ratio}`;
  let paths = cache.get(key);
  if (!paths) {
    paths = [...sceneRects(drawBackdrop(cols, rows, land))].map(
      ([fill, rects]) => [fill, snapPath(rectsPath(rects, 1), { unit: BACKDROP_CELL, ratio })] as const,
    );
    if (cache.size >= CACHE_SIZES) cache.delete(cache.keys().next().value!);
    cache.set(key, paths);
  }
  return paths;
}
