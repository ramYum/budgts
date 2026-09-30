import { View } from "react-native";
import Animated from "react-native-reanimated";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { BIRD, SAY } from "./keyframes";

/** A longer line wraps at 136px on a phone, so it never runs off screen. */
export const BUBBLE_MAX = 136;

/** The tail: a two-cell step pointing at her (web `.crystal-tail`, a 4×6 stepped polygon). */
function Tail({ side }: { side: "left" | "right" }) {
  // a bubble on her left points right: a full 2×6 column at its edge, then a 2×2 cell beyond it
  const outer = side === "left" ? { right: -4 } : { left: -4 };
  return (
    <View pointerEvents="none" style={[{ position: "absolute", top: "50%", marginTop: -3, width: 4, height: 6 }, outer]}>
      <View style={{ position: "absolute", top: 0, width: 2, height: 6, backgroundColor: ROLE.ink, [side === "left" ? "left" : "right"]: 0 }} />
      <View style={{ position: "absolute", top: 2, width: 2, height: 2, backgroundColor: ROLE.ink, [side === "left" ? "right" : "left"]: 0 }} />
    </View>
  );
}

/**
 * Crystal's speech bubble (web `Bubble`): an ink badge with her line in white
 * pixel caps, 6px down beside her, its tail pointing at her, opening toward
 * the middle of the card. It pops from its tail `atMs` in, holds, and pops
 * away after `forMs` (`crystal-say`); `still` shows it at rest (motion off:
 * the month's note stays).
 */
export function SpeechBubble({
  text,
  side,
  atMs,
  forMs,
  still = false,
  testID,
}: {
  text: string;
  side: "left" | "right";
  atMs: number;
  forMs: number;
  still?: boolean;
  testID?: string;
}) {
  const timing = useMotionTiming(atMs);
  const place = side === "left" ? { right: BIRD.width + 8 } : { left: BIRD.width + 8 };
  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        // a fixed box the badge sits in against her side, so the badge sizes to its line (the web's w-max, max 136px)
        {
          position: "absolute",
          top: 6,
          zIndex: 1,
          width: BUBBLE_MAX,
          alignItems: side === "left" ? "flex-end" : "flex-start",
          transformOrigin: side === "left" ? "100% 50%" : "0% 50%",
        },
        place,
        still
          ? null
          : {
              // after its moment, a bubble has said its piece
              opacity: 0,
              animationName: SAY,
              animationDuration: `${forMs}ms`,
              animationFillMode: "backwards",
              ...timing,
            },
      ]}
    >
      <View>
        <PixelFrame frame="px-badge-ink" style={{ paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text variant="pxTagBold" color={COLOR.white} textBreakStrategy="balanced" style={{ lineHeight: 12 }}>
            {text}
          </Text>
        </PixelFrame>
        <Tail side={side} />
      </View>
    </Animated.View>
  );
}
