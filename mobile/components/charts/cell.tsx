import type { StyleProp, ViewStyle } from "react-native";
import Animated, { steps, useReducedMotion } from "react-native-reanimated";
import { CELL_IN, CELL_IN_MS, cellDelayMs } from "../../lib/motion/css";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { usePlay } from "../motion/reveal";

/**
 * One chart mark (web `.cell`): a solid square that snaps in like a sprite,
 * `cell-in` on steps(3), `d` steps after the chart starts (22ms a step after
 * 220ms), so a column builds bottom-up and a ring builds clockwise. It waits
 * with its block below the fold, and simply shows under Reduce Motion.
 */
export function Cell({ d, color, style }: { d: number; color: string; style: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const play = usePlay() && !reduced;
  const timing = useMotionTiming(cellDelayMs(d));
  return (
    <Animated.View
      style={[
        style,
        { backgroundColor: color },
        play
          ? {
              animationName: CELL_IN,
              animationDuration: `${CELL_IN_MS}ms`,
              animationTimingFunction: steps(3, "jump-end"),
              animationFillMode: "backwards",
              ...timing,
            }
          : null,
      ]}
    />
  );
}
