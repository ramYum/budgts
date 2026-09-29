import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { COLOR, ROBIN_FEET_X, ROLE, TYPE } from "../../lib/brand/shared";
import { robinSize } from "../../lib/brand/robin-paths";
import { Robin } from "./robin";
import { Text } from "./text";

/**
 * The sign-in brand moment (the web's src/app/(auth)/brand-stage.tsx) at rest:
 * Crystal on her ground shadow, the Dogica wordmark, TRACK : PLAN : GROW, a
 * short red rule and the first savings line. This is exactly what the web
 * shows with motion off; the 8s beat (hops, chirps, the typed ticker) arrives
 * with Reanimated in Phase 3.
 */

const SCALE = 4; // 88px tall, as on the web
const { width: ROBIN_WIDTH } = robinSize(SCALE);
const SHADOW = { width: 56, height: 8 };

/** `.pixel-corners`: a rectangle with 2px-stepped corners (globals.css), as a path. */
function pixelCornersPath(w: number, h: number): string {
  return [
    `M0 4H2V2H4V0H${w - 4}V2H${w - 2}V4H${w}`,
    `V${h - 4}H${w - 2}V${h - 2}H${w - 4}V${h}`,
    `H4V${h - 2}H2V${h - 4}H0Z`,
  ].join("");
}

export function BrandStage() {
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ paddingTop: 40, width: ROBIN_WIDTH }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Robin mood="happy" scale={SCALE} />
        <Svg
          width={SHADOW.width}
          height={SHADOW.height}
          style={{ marginTop: 4, marginLeft: ROBIN_FEET_X * ROBIN_WIDTH - SHADOW.width / 2 }}
        >
          <Path d={pixelCornersPath(SHADOW.width, SHADOW.height)} fill={ROLE.track} />
        </Svg>
      </View>

      <Text variant="pxFigureLg" style={{ marginTop: 24, lineHeight: TYPE.pxFigureLg.size }}>
        Budgts
      </Text>
      {/* `.font-pixel`: Dogica Pixel with 0.06em tracking, no word trim */}
      <Text
        variant="pxTag"
        color={ROLE.muted}
        style={{ marginTop: 16, letterSpacing: 0.06 * TYPE.pxTag.size }}
        accessibilityLabel="Track, plan, grow"
      >
        {"Track "}
        <Text variant="pxTag" color={COLOR.signal} style={{ letterSpacing: 0.06 * TYPE.pxTag.size }}>
          :
        </Text>
        {" Plan "}
        <Text variant="pxTag" color={COLOR.signal} style={{ letterSpacing: 0.06 * TYPE.pxTag.size }}>
          :
        </Text>
        {" Grow"}
      </Text>
      <View style={{ marginTop: 20, width: 40, height: 1, backgroundColor: ROLE.accent }} />
      <Text variant="mono" color={ROLE.muted} style={{ marginTop: 20 }} accessibilityElementsHidden importantForAccessibility="no">
        Every dollar has a job.
      </Text>
    </View>
  );
}
