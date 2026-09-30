import { useCallback, useEffect, useState } from "react";
import { useFrameCallback, useSharedValue, type FrameInfo, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { parityClockMs } from "./parity-clock";

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
  /** steps in the loop that repeats after it; 1 holds the intro's end (a one-shot) */
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
 *
 * Time counts from a start held in a shared value, never from the frame
 * callback's own first frame: a callback re-registered for any reason can
 * never rewind the clock. Only a new timeline (or `running` turning on)
 * starts it over. A one-shot timeline (`loop: 1`) stops its frame callback
 * once it has played. `running: false` (Reduce Motion, or the screen gone)
 * holds step 0 and stops it.
 */
export function useSteppedClock(timeline: SteppedTimeline, running: boolean): SharedValue<number> {
  const { stepMs, intro, loop } = timeline;
  // A parity capture's frozen frame (dev builds only; null otherwise): show the step at that ms, run no clock.
  const pinned = running ? parityClockMs() : null;
  const step = useSharedValue(0);
  const start = useSharedValue(-1);
  const told = useSharedValue(false); // a one-shot's end reported to React, once
  const [played, setPlayed] = useState(false);

  const tick = useCallback(
    (frame: FrameInfo) => {
      "worklet";
      if (start.value < 0) start.value = frame.timestamp;
      const next = stepAt(frame.timestamp - start.value, { stepMs, intro, loop });
      if (next !== step.value) step.value = next;
      if (loop === 1 && next >= intro && !told.value) {
        told.value = true;
        scheduleOnRN(setPlayed, true);
      }
    },
    [stepMs, intro, loop, start, step, told],
  );
  const clock = useFrameCallback(tick, false);

  // A new timeline, or the clock switched on again, starts from the top.
  useEffect(() => {
    start.value = -1;
    step.value = pinned === null ? 0 : stepAt(pinned, { stepMs, intro, loop });
    told.value = false;
    setPlayed(false);
  }, [stepMs, intro, loop, running, pinned, start, step, told]);

  const active = running && !played && pinned === null;
  useEffect(() => {
    clock.setActive(active);
    return () => clock.setActive(false);
  }, [clock, active]);

  return step;
}
