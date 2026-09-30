import { steps } from "react-native-reanimated";
import type { Keyframes } from "../tour/motion";

/**
 * Crystal's own motion and the sign-in stage's 8s beat (src/app/globals.css `robin-*`, `stage-*`, `saving-rise`, `wm-*`,
 * `rule-grow`, `ticker-*`), one to one. A web selector list is written out one selector per entry; the per-keyframe
 * timing rides on its keyframe. Pure data for `useKeyframes`.
 */

const hold = (entries: [string[], Record<string, unknown>][]): Keyframes => {
  const out: Keyframes = {};
  for (const [selectors, value] of entries) for (const s of selectors) out[s] = value;
  return out;
};

// ─── Robin ──────────────────────────────────────────────────────────────────

/** `robin-blink`: a single blink, then a double, every 4.8s (linear) */
export const ROBIN_BLINK = hold([
  [["0%", "30%", "34%", "84%", "87%", "90%", "93%", "100%"], { transform: [{ scaleY: 1 }] }],
  [["32%", "85.5%", "91.5%"], { transform: [{ scaleY: 0.1 }] }],
]);
/** A chirp: two quick beak-opens with the marks sounding, 40–60% into the cycle (steps(1, end): each value holds). */
export const ROBIN_BEAK_OPEN = hold([
  [["0%"], { opacity: 0 }],
  [["40%"], { opacity: 1 }],
  [["44%"], { opacity: 0 }],
  [["49%"], { opacity: 1 }],
  [["53%", "100%"], { opacity: 0 }],
]);
export const ROBIN_BEAK = hold([
  [["0%"], { opacity: 1 }],
  [["40%"], { opacity: 0 }],
  [["44%"], { opacity: 1 }],
  [["49%"], { opacity: 0 }],
  [["53%", "100%"], { opacity: 1 }],
]);
export const ROBIN_CHIRP = hold([
  [["0%"], { opacity: 0 }],
  [["40%"], { opacity: 1 }],
  [["46%"], { opacity: 0 }],
  [["49%"], { opacity: 1 }],
  [["60%", "100%"], { opacity: 0 }],
]);
/** the "?" and "z" of the curious and sleepy moods */
export const ROBIN_FLICKER = hold([
  [["0%", "55%", "100%"], { opacity: 1 }],
  [["62%"], { opacity: 0 }],
  [["70%"], { opacity: 1 }],
]);
/** `robin-hop`, 360ms steps(4, end): a 4px hop */
export const ROBIN_HOP = hold([
  [["0%", "100%"], { transform: [{ translateY: 0 }] }],
  [["40%"], { transform: [{ translateY: -4 }] }],
]);
export const STEP1 = steps(1, "jump-end");
export const STEPS2 = steps(2, "jump-end");
export const STEPS3 = steps(3, "jump-end");
export const STEPS4 = steps(4, "jump-end");

// ─── The sign-in stage: one 8s beat on the robin's 4px grid ─────────────────
//   1.0s hop two cells right   1.6s chirp ("+$" rises)   3.3s turn left, 3.5s two hops left
//   5.2s turn back, 5.6s chirp   6.6s hop home   7.1s the wordmark ripples

export const STAGE_MS = 8000;
const REST = ["0%", "12.5%", "16.25%", "43.75%", "47.5%", "51.25%", "82.5%", "86.25%", "100%"];
const AIR = ["14.375%", "45.625%", "49.375%", "84.375%"];

export const STAGE_WANDER = hold([
  [["0%", "12.5%"], { transform: [{ translateX: 0 }] }],
  [["16.25%", "43.75%"], { transform: [{ translateX: 8 }] }],
  [["47.5%"], { transform: [{ translateX: 0 }] }],
  [["51.25%", "82.5%"], { transform: [{ translateX: -8 }] }],
  [["86.25%", "100%"], { transform: [{ translateX: 0 }] }],
]);
export const STAGE_HOP = hold([
  [REST, { transform: [{ translateY: 0 }] }],
  [AIR, { transform: [{ translateY: -8 }] }],
]);
export const STAGE_SHADOW = hold([
  [REST, { transform: [{ scaleX: 1 }] }],
  [AIR, { transform: [{ scaleX: 0.6 }] }],
]);
/** steps(1, end): faces left from 3.3s to 5.2s */
export const STAGE_TURN = hold([
  [["0%"], { transform: [{ scaleX: 1 }] }],
  [["41.25%"], { transform: [{ scaleX: -1 }] }],
  [["65%", "100%"], { transform: [{ scaleX: 1 }] }],
]);

/** `saving-rise` (16s: two beats, two savings each): a "+$" rises from the beak and fades */
export const SAVING_MS = 16000;
export const SAVING_RISE: Keyframes = {
  "0%": { opacity: 0, transform: [{ translateY: 6 }], animationTimingFunction: STEPS3 },
  "3%": { opacity: 1, transform: [{ translateY: 0 }], animationTimingFunction: steps(12, "jump-end") },
  "15%": { opacity: 1, transform: [{ translateY: -24 }], animationTimingFunction: STEPS4 },
  "19%": { opacity: 0, transform: [{ translateY: -30 }] },
  "100%": { opacity: 0, transform: [{ translateY: -30 }] },
};

/** `wm-in` (360ms steps(3, end)): each letter steps in */
export const WM_IN: Keyframes = { from: { opacity: 0, transform: [{ translateY: 12 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } };
/** `wm-wave` (8s steps(1, end)): the letters ripple a font-pixel up as the robin lands */
export const WM_WAVE = hold([
  [["0%", "86%"], { transform: [{ translateY: 0 }] }],
  [["89%"], { transform: [{ translateY: -4 }] }],
  [["92%", "100%"], { transform: [{ translateY: 0 }] }],
]);
/** `rule-grow` (480ms steps(5, end), after 700ms) */
export const RULE_GROW: Keyframes = { from: { transform: [{ scaleX: 0 }] }, to: { transform: [{ scaleX: 1 }] } };

/**
 * `ticker-type` (20s, steps(n, end)): a line of `n` Geist Mono characters types, holds, erases, in its 4s slot. The web
 * box is content-box with the caret as its right border, so the drawn width is the typed width plus the caret's.
 */
export const TICKER_MS = 20000;
export const tickerType = (lineWidth: number, caret: number): Keyframes => ({
  "0%": { width: caret, opacity: 1 },
  "6%": { width: lineWidth + caret, opacity: 1 },
  "16%": { width: lineWidth + caret, opacity: 1 },
  "18.5%": { width: caret, opacity: 1 },
  "19%": { width: caret, opacity: 0 },
  "100%": { width: caret, opacity: 0 },
});
/** `ticker-caret` (0.9s steps(1, end)): the red caret at the typing edge blinks */
export const tickerCaret = (accent: string): Keyframes => ({
  "0%": { backgroundColor: accent },
  "50%": { backgroundColor: "transparent" },
  "100%": { backgroundColor: "transparent" },
});
