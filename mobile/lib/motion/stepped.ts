import { useEffect } from "react";
import { useFrameCallback, useSharedValue, type SharedValue } from "react-native-reanimated";

/**
 * Sprite timing for the apps' motion: the web's `steps()` animations
 * (docs/BRAND_GUIDELINES.md → Motion, "cell"), on the UI thread. A clock
 * ticks whole steps of `stepMs`, so art jumps from frame to frame instead of
 * gliding between them, and it keeps time while the JS thread is busy (the
 * startup work the loading screen covers).
 */

export type SteppedTimeline = {
  /** how long one step lasts */
  stepMs: number;
  /** steps played once before the loop (an entrance) */
  intro: number;
  /** steps in the loop that repeats after it */
  loop: number;
};

/** The step showing `elapsedMs` into a timeline: the intro's steps, then the loop's, repeating. */
export function stepAt(elapsedMs: number, { stepMs, intro, loop }: SteppedTimeline): number {
  "worklet";
  const n = Math.floor(Math.max(0, elapsedMs) / stepMs);
  return n < intro ? n : intro + ((n - intro) % loop);
}

/**
 * The current step of a timeline as a shared value, advanced on the UI
 * thread from the display's frame clock. It writes only when the step
 * changes, so styles derived from it re-run once per step, not per frame.
 * `running: false` (Reduce Motion, or the screen gone) holds step 0 and
 * stops the frame callback.
 */
export function useSteppedClock(timeline: SteppedTimeline, running: boolean): SharedValue<number> {
  const step = useSharedValue(0);
  const { stepMs, intro, loop } = timeline;
  const clock = useFrameCallback((frame) => {
    "worklet";
    const next = stepAt(frame.timeSinceFirstFrame, { stepMs, intro, loop });
    if (next !== step.value) step.value = next;
  }, false);
  useEffect(() => {
    step.value = 0;
    clock.setActive(running);
    return () => clock.setActive(false);
    // (clock and step are stable across renders)
  }, [running]);
  return step;
}
