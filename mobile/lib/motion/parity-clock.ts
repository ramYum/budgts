import { devLinkParams, isDev } from "../dev/fault";

/**
 * The parity capture's frozen clock (Phase 3 plan, Task P4): the ms a `?clock=` dev link pinned motion to, or null (motion
 * runs normally; always null in release builds). The web capture pauses every animation at the same ms, so both sides are
 * photographed at the same frame. One clock for all motion: every Reanimated CSS animation (stepped sprites included)
 * takes its delay from `useMotionTiming`, which pauses it at that ms.
 */
export function parityClockMs(dev: boolean = isDev()): number | null {
  return devLinkParams(dev).clockMs;
}

export type MotionTiming = { animationDelay: `${number}ms`; animationPlayState: "running" | "paused" };

/**
 * The timing props for an animation that starts `delayMs` after mount: as is, or, under a frozen clock, paused at that
 * instant (a negative delay seeks into the animation; paused holds it there).
 */
export function motionTiming(delayMs: number, frozenMs: number | null): MotionTiming {
  if (frozenMs === null) return { animationDelay: `${delayMs}ms`, animationPlayState: "running" };
  return { animationDelay: `${delayMs - frozenMs}ms`, animationPlayState: "paused" };
}

/** `motionTiming` with the parity clock, read when the component renders (the capture's link opens the screen). */
export function useMotionTiming(delayMs: number): MotionTiming {
  return motionTiming(delayMs, parityClockMs());
}
