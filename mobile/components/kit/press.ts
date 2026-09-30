import type { ViewStyle } from "react-native";
import { MOTION } from "../../lib/brand/shared";

/**
 * The web's `.press`: a tap is felt as a 0.98 scale while held. Always an
 * array, never undefined: a transform that turns undefined on release reaches
 * React Native's style processor as null and crashes it (2026-09-29).
 */
export function pressStyle(pressed: boolean): Pick<ViewStyle, "transform"> {
  return { transform: pressed ? [{ scale: MOTION.pressScale }] : [] };
}
