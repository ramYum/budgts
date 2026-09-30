import { cubicBezier as cssBezier, steps } from "react-native-reanimated";
import { robinSize } from "../../lib/brand/robin-paths";

/**
 * The perch's keyframes, straight from globals.css (`crystal-*`), as
 * Reanimated 4 CSS animations: the same stops, durations, delays and per-stop
 * easing, run on the UI thread. Her own loops (chirp, blink, flicker) are the
 * brand Robin's; the flaps and chirp-back below play on her layers through its
 * `choreography`.
 */

/** Crystal on Home is 44px tall: two px per art cell (52 × 44). */
export const BIRD = robinSize(2);

const EASE_IN = cssBezier(0.55, 0, 1, 0.45);
const EASE_OUT = cssBezier(0, 0.55, 0.45, 1);

/** `crystal-arrive` (900ms, 120ms in): she drops from 64px above, bounces once, settles. */
export const ARRIVE = {
  "0%": { opacity: 0, transform: [{ translateY: -64 }], animationTimingFunction: EASE_IN },
  "8%": { opacity: 1 },
  "45%": { transform: [{ translateY: 0 }], animationTimingFunction: EASE_OUT },
  "62%": { transform: [{ translateY: -9 }], animationTimingFunction: EASE_IN },
  "78%": { opacity: 1, transform: [{ translateY: 0 }] },
  "100%": { opacity: 1, transform: [{ translateY: 0 }] },
};
export const ARRIVE_MS = 900;
export const ARRIVE_AT = 120;

const sq = (x: number, y: number) => [{ scaleX: x }, { scaleY: y }];

/** `crystal-land` (900ms ease-out, 120ms in): the squash as she touches down, and again after the bounce. */
export const LAND = {
  "0%": { transform: sq(1, 1) },
  "44%": { transform: sq(1, 1) },
  "49%": { transform: sq(1.12, 0.84) },
  "56%": { transform: sq(0.95, 1.06) },
  "62%": { transform: sq(1, 1) },
  "79%": { transform: sq(1.06, 0.92) },
  "88%": { transform: sq(1, 1) },
  "100%": { transform: sq(1, 1) },
};

/** An opacity track held between stops (every `steps(1, end)` keyframe below). */
function held(stops: [number, number][]) {
  return Object.fromEntries(stops.map(([at, opacity]) => [`${at}%`, { opacity }]));
}

/** `crystal-arrive-flap` (640ms, 120ms in): three wing beats on the way down. */
export const ARRIVE_FLAP = held([[0, 1], [12, 0], [24, 1], [36, 0], [48, 1], [60, 0], [100, 0]]);
export const ARRIVE_FLAP_MS = 640;

/** `crystal-react` (900ms): a tap's jump, from her feet. */
export const REACT = {
  "0%": { transform: [{ translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }], animationTimingFunction: cssBezier(0, 0, 0.58, 1) },
  "8%": { transform: [{ translateY: 0 }, { scaleX: 1.12 }, { scaleY: 0.86 }], animationTimingFunction: EASE_OUT },
  "30%": { transform: [{ translateY: -18 }, { scaleX: 0.95 }, { scaleY: 1.06 }] },
  "52%": { transform: [{ translateY: -16 }, { scaleX: 1 }, { scaleY: 1 }], animationTimingFunction: EASE_IN },
  "74%": { transform: [{ translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }] },
  "82%": { transform: [{ translateY: 0 }, { scaleX: 1.1 }, { scaleY: 0.9 }] },
  "92%": { transform: [{ translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }] },
  "100%": { transform: [{ translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }] },
};
export const REACT_MS = 900;
export const REACT_FLAP = held([[0, 0], [8, 1], [17, 0], [26, 1], [35, 0], [44, 1], [53, 0], [62, 1], [70, 0], [100, 0]]);
/** a tap's chirp back (600ms): the beak opens twice, the marks sound */
export const REACT_BEAK = held([[0, 1], [12, 0], [30, 1], [40, 0], [58, 1], [100, 1]]);
export const REACT_BEAK_OPEN = held([[0, 0], [12, 1], [30, 0], [40, 1], [58, 0], [100, 0]]);
export const REACT_CHIRP = held([[0, 0], [12, 1], [34, 0], [40, 1], [70, 0], [100, 0]]);
export const REACT_BEAK_MS = 600;

/** `crystal-dust` (560ms ease-out): a puff at her feet drifts out and up. */
export function dust(dx: number) {
  return {
    "0%": { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }] },
    "1%": { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }] },
    "100%": { opacity: 0, transform: [{ translateX: dx }, { translateY: -7 }] },
  };
}
export const DUST_MS = 560;

/** `crystal-token` (16s loop): a "+$" rises from her beak in 3px steps, then is gone for the rest of the cycle. */
export const TOKEN = {
  "0%": { opacity: 0, transform: [{ translateY: 3 }] },
  "2.4%": { opacity: 0, transform: [{ translateY: 3 }] },
  "2.5%": { opacity: 1, transform: [{ translateY: 0 }], animationTimingFunction: steps(6, "jump-end") },
  "9%": { opacity: 1, transform: [{ translateY: -18 }], animationTimingFunction: steps(2, "jump-end") },
  "10.5%": { opacity: 0, transform: [{ translateY: -21 }] },
  "100%": { opacity: 0, transform: [{ translateY: -21 }] },
};
export const TOKEN_MS = 16000;

/** `crystal-say`: a bubble pops from its tail in three steps, holds, pops away in two. */
export const SAY = {
  "0%": { opacity: 0, transform: [{ scale: 0.4 }], animationTimingFunction: steps(3, "jump-end") },
  "4%": { opacity: 1, transform: [{ scale: 1 }] },
  "94%": { opacity: 1, transform: [{ scale: 1 }], animationTimingFunction: steps(2, "jump-end") },
  "97%": { opacity: 0, transform: [{ scale: 0.6 }] },
  "100%": { opacity: 0, transform: [{ scale: 0.6 }] },
};

/** `crystal-burst` (900ms) for one heart or sparkle flying out to (x, y). */
export function burst(x: number, y: number) {
  return {
    "0%": { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0.4 }] },
    "12%": {
      opacity: 1,
      transform: [{ translateX: x * 0.35 }, { translateY: y * 0.35 }, { scale: 1 }],
      animationTimingFunction: cssBezier(0.1, 0.8, 0.3, 1),
    },
    "72%": { opacity: 1 },
    "100%": { opacity: 0, transform: [{ translateX: x }, { translateY: y }, { scale: 1 }] },
  };
}
export const BURST_MS = 900;
