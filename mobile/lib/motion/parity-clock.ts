import { devLinkParams, isDev } from "../dev/fault";

/**
 * The parity capture's frozen clock (Phase 3 plan, Task P4): the ms a `?clock=` dev link pinned motion to, or null (motion
 * runs normally; always null in release builds). The web capture pauses every animation at the same ms, so both sides are
 * photographed at the same frame.
 *
 * Motion code reads it once when it starts a timeline: `useSteppedClock` shows `stepAt(ms)` and stops its frame clock; a
 * Reanimated `withTiming` / `withDelay` driver sets its value to where it would be at `ms` instead of animating.
 */
export function parityClockMs(dev: boolean = isDev()): number | null {
  return devLinkParams(dev).clockMs;
}
