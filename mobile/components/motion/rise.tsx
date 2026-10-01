import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { steps } from "react-native-reanimated";
import { useReducedMotion } from "./reduced-motion";
import { EASE_OUT, RISE_IN } from "../../lib/motion/css";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { usePlay } from "./reveal";

/** `.rise`: a one-off entrance placed by its own delay (globals.css, 520ms). Shared by Home, the welcome guide and Insights (moved from Lane B's components/home). */
export const RISE_MS = 520;

/** `@keyframes lamp-on`: a dim bulb catches, stutters, holds (760ms, steps(1, end)). */
export const LAMP_ON = {
  "0%": { opacity: 0.15 },
  "30%": { opacity: 1 },
  "42%": { opacity: 0.35 },
  "56%": { opacity: 1 },
  "66%": { opacity: 0.5 },
  "76%": { opacity: 1 },
  "100%": { opacity: 1 },
};
export const LAMP_MS = 760;

/**
 * The web's `.rise` (`style={at(ms)}`): the element rises 10px into place
 * `at` ms after the page's first frame. It waits with its block below the
 * fold (usePlay) and simply shows under Reduce Motion. One host view either
 * way, so a block that starts playing never remounts what is inside it.
 */
export function Rise({ at, children, style, testID }: { at: number; children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const reduced = useReducedMotion();
  const play = usePlay() && !reduced;
  const timing = useMotionTiming(at);
  return (
    <Animated.View
      testID={testID}
      style={[
        style,
        play
          ? {
              animationName: RISE_IN,
              animationDuration: `${RISE_MS}ms`,
              animationTimingFunction: EASE_OUT,
              animationFillMode: "backwards",
              ...timing,
            }
          : null,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** The web's `.lamp`: the idea tile switches on like a bulb, `at` ms in. */
export function Lamp({ at, children }: { at: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const play = usePlay() && !reduced;
  const timing = useMotionTiming(at);
  return (
    <Animated.View
      style={
        play
          ? {
              animationName: LAMP_ON,
              animationDuration: `${LAMP_MS}ms`,
              animationTimingFunction: steps(1, "jump-end"),
              animationFillMode: "backwards",
              ...timing,
            }
          : null
      }
    >
      {children}
    </Animated.View>
  );
}
