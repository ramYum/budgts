import type { CSSProperties } from "react";
import { BACKDROP_CELL, cloudSprite, rectsPath, sceneRects } from "@/lib/brand/scene-art";
import styles from "./drifting-clouds.module.css";

/** Puffs ([dx, radius] in cells, scene-art.ts `cloud`), the cloud's top edge in
 * px, how long one crossing takes, and how far into it the cloud is at load. */
type Drift = { puffs: [number, number][]; top: number; seconds: number; offset: number };

// Six clouds at their own heights: the big near ones cross in under two
// minutes, the small far ones take longer, so the sky has depth without a
// parallax script. Offsets spread them across the screen at load.
const CLOUDS: Drift[] = [
  { puffs: [[0, 6], [9, 9.5], [21, 8], [31, 6], [39, 4]], top: 28, seconds: 100, offset: 22 },
  { puffs: [[0, 4], [6, 6.5], [14, 5], [21, 3.5]], top: 108, seconds: 130, offset: 85 },
  { puffs: [[0, 2.5], [5, 4], [10, 3], [15, 2]], top: 186, seconds: 160, offset: 64 },
  { puffs: [[0, 5], [8, 8], [18, 6.5], [26, 4.5]], top: 262, seconds: 110, offset: 88 },
  { puffs: [[0, 2.2], [4, 3.4], [9, 2.4]], top: 352, seconds: 150, offset: 105 },
  { puffs: [[0, 3.5], [6, 6], [13, 4.5], [19, 3]], top: 430, seconds: 120, offset: 12 },
];

/**
 * The sky above the homepage hero, alive: six of the backdrop's own clouds
 * (scene-art.ts `cloudSprite`, at Crystal's 2 px grain) drift right to left
 * behind the page, endlessly, on CSS transforms only (no script). Motion off,
 * they hold still where they are. Sits after <Backdrop> inside the page's
 * positioned root, so it paints over the sky and under every word.
 */
export function DriftingClouds() {
  return (
    <div aria-hidden className={styles.sky}>
      {CLOUDS.map(({ puffs, top, seconds, offset }) => {
        const g = cloudSprite(puffs);
        const style: CSSProperties = { top, animationDuration: `${seconds}s`, animationDelay: `-${offset}s` };
        return (
          <svg
            key={top}
            className={styles.cloud}
            width={g.w * BACKDROP_CELL}
            height={g.h * BACKDROP_CELL}
            viewBox={`0 0 ${g.w} ${g.h}`}
            shapeRendering="crispEdges"
            style={style}
          >
            {[...sceneRects(g)].map(([fill, rects]) => (
              <path key={fill} fill={fill} d={rectsPath(rects, 1)} />
            ))}
          </svg>
        );
      })}
    </div>
  );
}
