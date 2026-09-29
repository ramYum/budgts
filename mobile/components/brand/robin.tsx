import { useMemo } from "react";
import { PixelRatio } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import type { RobinMood } from "../../lib/brand/shared";
import { robinLayer, robinSize, type RobinLayer } from "../../lib/brand/robin-paths";
import { snapPath } from "../../lib/brand/snap";

/**
 * Crystal, the Budgts robin, from the one art source (src/lib/brand/robin-art.ts)
 * at a whole number of px per art cell (`scale`: 4 draws her 88px tall, the
 * sign-in size), every cell edge on a whole device pixel (lib/brand/snap.ts).
 * The web's resting frame: beak shut and the mood's marks showing (chirp
 * marks, "?" or "z"), which is what the web shows with motion off. Her motion
 * (blink, chirp, flap) comes with Reanimated in Phase 3.
 *
 * Decorative unless given a `title`, like the web's <Robin>.
 */
export function Robin({
  mood = "normal",
  scale = 4,
  title,
  beakOpen = false,
  wingUp = false,
  testID,
}: {
  mood?: RobinMood;
  scale?: number;
  title?: string;
  /** mid-chirp frame: the open beak replaces the shut one */
  beakOpen?: boolean;
  /** a flap's raised-wing frame over the resting wing */
  wingUp?: boolean;
  testID?: string;
}) {
  const { width, height } = robinSize(scale);
  const ratio = PixelRatio.get();
  const layers = useMemo(() => {
    const names: RobinLayer[] = ["body", beakOpen ? "beakOpen" : "beak", ...(wingUp ? (["wingUp"] as const) : []), "eye", "extra"];
    // The art's grid starts at (-1, -1): cell x sits at (x + 1) · scale.
    return names.map((layer) => ({
      layer,
      paths: robinLayer(mood, layer).map(([fill, d]) => [fill, snapPath(d, { unit: scale, dx: scale, dy: scale, ratio })] as const),
    }));
  }, [mood, scale, beakOpen, wingUp, ratio]);
  return (
    <Svg
      testID={testID}
      width={width}
      height={height}
      accessible={!!title}
      accessibilityRole={title ? "image" : undefined}
      accessibilityLabel={title}
      accessibilityElementsHidden={!title}
      importantForAccessibility={title ? "yes" : "no-hide-descendants"}
    >
      {layers.map(({ layer, paths }) => (
        <G key={layer}>
          {paths.map(([fill, d]) => (
            <Path key={fill} d={d} fill={fill} />
          ))}
        </G>
      ))}
    </Svg>
  );
}
