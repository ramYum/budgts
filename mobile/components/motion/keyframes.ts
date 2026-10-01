import { useReducedMotion } from "./reduced-motion";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { usePlay } from "./reveal";

/**
 * Keyframe motion ported from the web's CSS (the welcome guide's guide.module.css, Crystal's and the sign-in stage's
 * globals.css keyframes) as Reanimated CSS keyframe animations declared on the views: the web's keyframes, durations, delays, easing and `steps()`, running on the UI thread from mount. Every
 * base style is the scene's finished state, so with Reduce Motion (or a block that may not play yet) the view simply
 * rests there, the web's motion-off frame.
 */

/** `{ "0%": {...}, "36%": {..., animationTimingFunction }, "100%": {...} }`: one entry per selector (no comma lists). */
export type Keyframes = Record<string, Record<string, unknown>>;

export type AnimationOptions = {
  duration: number;
  delay?: number;
  /** the web's `animation-timing-function` (default `ease`, as in CSS) */
  easing?: unknown;
  /** default 1; "infinite" for a loop */
  iterations?: number | "infinite";
  /** the web's fill: entrances are `backwards` (hold the first frame through the delay), loops without one are `none` */
  fill?: "backwards" | "none";
};

/**
 * The style that plays `keyframes` on a view, or nothing (the resting frame) under Reduce Motion, while the block waits
 * to play (`usePlay`), or when `enabled` is false. Delays go through `useMotionTiming`, so parity captures can freeze it.
 */
export function useKeyframes(keyframes: Keyframes, o: AnimationOptions, enabled = true): Record<string, unknown> {
  const reduced = useReducedMotion();
  const play = usePlay();
  const timing = useMotionTiming(o.delay ?? 0);
  if (reduced || !play || !enabled) return {};
  return {
    animationName: keyframes,
    animationDuration: `${o.duration}ms`,
    ...timing,
    animationTimingFunction: o.easing ?? "ease",
    animationIterationCount: o.iterations ?? 1,
    animationFillMode: o.fill ?? "backwards",
  };
}
