import { cubicBezier, steps } from "react-native-reanimated";
import { EASE_OUT } from "../../lib/motion/css";
import type { Keyframes } from "../motion/keyframes";

/**
 * The web's welcome-guide keyframes (src/components/tour/guide.module.css), one to one. A web selector list
 * ("32%, 92%") is written out as one entry per selector; per-keyframe `animation-timing-function` rides on its keyframe.
 * Pure data: the views pick them up through `useKeyframes`.
 */

const fall = cubicBezier(0.55, 0, 1, 0.45);
const rise = cubicBezier(0, 0.55, 0.45, 1);

// ─── Card ───────────────────────────────────────────────────────────────────

export const ENTER_MS = 560;
export const RISE_MS = 640;
/** `.stage[data-dir="next|back"] .enter`: 70ms apart by cascade index */
export const enterDelayMs = (i: number) => i * 70;
/** `.stage[data-dir="none"] .enter`: the first card rises in */
export const riseDelayMs = (i: number) => i * 80 + 60;
/** `.word`: the heading, word by word */
export const wordDelayMs = (w: number) => w * 45 + 180;

export const ENTER_NEXT: Keyframes = { from: { opacity: 0, transform: [{ translateX: 32 }] }, to: { opacity: 1, transform: [{ translateX: 0 }] } };
export const ENTER_BACK: Keyframes = { from: { opacity: 0, transform: [{ translateX: -32 }] }, to: { opacity: 1, transform: [{ translateX: 0 }] } };
export const RISE: Keyframes = { from: { opacity: 0, transform: [{ translateY: 14 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } };
/** `word-in`: 0.5em up */
export const wordIn = (fontSize: number): Keyframes => ({
  from: { opacity: 0, transform: [{ translateY: fontSize / 2 }] },
  to: { opacity: 1, transform: [{ translateY: 0 }] },
});
export const POP: Keyframes = { from: { opacity: 0, transform: [{ scale: 0.4 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } };
export const STEPS3 = steps(3, "jump-end");
export const STEP1 = steps(1, "jump-end");
export { EASE_OUT };

// ─── Crystal ────────────────────────────────────────────────────────────────

export const DROP: Keyframes = {
  "0%": { opacity: 0, transform: [{ translateY: -190 }], animationTimingFunction: fall },
  "6%": { opacity: 1 },
  "36%": { transform: [{ translateY: 0 }], animationTimingFunction: rise },
  "50%": { transform: [{ translateY: -18 }], animationTimingFunction: fall },
  "62%": { opacity: 1, transform: [{ translateY: 0 }] },
  "100%": { opacity: 1, transform: [{ translateY: 0 }] },
};
const sq = (x: number, y: number) => ({ transform: [{ scaleX: x }, { scaleY: y }] });
export const SQUASH: Keyframes = {
  "0%": sq(1, 1),
  "35%": sq(1, 1),
  "39%": sq(1.14, 0.82),
  "47%": sq(0.95, 1.07),
  "55%": sq(1, 1),
  "63%": sq(1.06, 0.92),
  "70%": sq(1, 1),
  "100%": sq(1, 1),
};
export const dust = (dx: number): Keyframes => ({
  "0%": { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }] },
  "1%": { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }] },
  "100%": { opacity: 0, transform: [{ translateX: dx }, { translateY: -8 }] },
});
export const TWINKLE: Keyframes = {
  "0%": { opacity: 0, transform: [{ scale: 0.5 }] },
  "25%": { opacity: 1, transform: [{ scale: 1 }] },
  "50%": { opacity: 1, transform: [{ scale: 1 }] },
  "75%": { opacity: 0.4, transform: [{ scale: 0.75 }] },
  "100%": { opacity: 0, transform: [{ scale: 0.5 }] },
};

// ─── Welcome, bank: lit dots along a path ───────────────────────────────────

/** `flow`: starts dark, so the backwards fill keeps each dot unlit until its turn */
export const FLOW: Keyframes = { "0%": { opacity: 0 }, "0.1%": { opacity: 1 }, "10%": { opacity: 0 }, "100%": { opacity: 0 } };
export const TRAIL: Keyframes = { "0%": { opacity: 0 }, "0.1%": { opacity: 1 }, "30%": { opacity: 0 }, "100%": { opacity: 0 } };
/** `carry`: 7 steps of 12px across the link over 0–80%, then a beat of rest at the far end */
export const CARRY: Keyframes = { "0%": { transform: [{ translateX: 0 }] }, "80%": { transform: [{ translateX: 84 }] }, "100%": { transform: [{ translateX: 84 }] } };

// ─── Auto-capture ───────────────────────────────────────────────────────────

/** three rows land at 4%, 18% and 32% of the 6.4s loop, all clear at 92% */
export const feed = (landAt: number): Keyframes => {
  const hidden = { opacity: 0, transform: [{ translateY: -14 }, { scale: 0.98 }] };
  const shown = { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] };
  const gone = { opacity: 0, transform: [{ translateY: 6 }, { scale: 1 }] };
  return {
    "0%": hidden,
    [`${landAt}%`]: hidden,
    [`${landAt + 6}%`]: shown,
    "90%": shown,
    "97%": gone,
    "100%": gone,
  };
};
export const FEED_LAND = [4, 18, 32] as const;
export const BLINK: Keyframes = { "0%": { opacity: 1 }, "50%": { opacity: 0.25 }, "100%": { opacity: 0.25 } };

// ─── Currency ───────────────────────────────────────────────────────────────

export const AMOUNT_IN: Keyframes = {
  from: { opacity: 0, transform: [{ translateY: 10 }, { scale: 0.97 }] },
  to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
};

// ─── Auto-sort (5.2s loop: sorted at 30%, reset over the last 8%) ───────────

export const FLIP_IN: Keyframes = {
  "0%": { opacity: 0, transform: [{ scaleX: 0 }] },
  "26%": { opacity: 0, transform: [{ scaleX: 0 }] },
  "27%": { opacity: 1, transform: [{ scaleX: 0 }], animationTimingFunction: STEPS3 },
  "32%": { opacity: 1, transform: [{ scaleX: 1 }] },
  "92%": { opacity: 1, transform: [{ scaleX: 1 }] },
  "100%": { opacity: 0, transform: [{ scaleX: 1 }] },
};
export const SHOW_SORTED: Keyframes = { "0%": { opacity: 0 }, "32%": { opacity: 1 }, "96%": { opacity: 0 }, "100%": { opacity: 0 } };
export const SHOW_UNSORTED: Keyframes = { "0%": { opacity: 1 }, "32%": { opacity: 0 }, "96%": { opacity: 1 }, "100%": { opacity: 1 } };
const popLoop = (a: number, b: number, c: number, d: number, from: number): Keyframes => ({
  "0%": { opacity: 0, transform: [{ scale: from }] },
  [`${a}%`]: { opacity: 0, transform: [{ scale: from }] },
  [`${b}%`]: { opacity: 1, transform: [{ scale: 1 }] },
  [`${c}%`]: { opacity: 1, transform: [{ scale: 1 }] },
  [`${d}%`]: { opacity: 0, transform: [{ scale: 1 }] },
  "100%": { opacity: 0, transform: [{ scale: 1 }] },
});
export const SORTED_POP = popLoop(33, 38, 92, 96, 0.3);
export const GOT_IT = popLoop(40, 45, 90, 94, 0.4);
export const REMEMBER: Keyframes = {
  "0%": { opacity: 0, transform: [{ translateY: 8 }] },
  "50%": { opacity: 0, transform: [{ translateY: 8 }] },
  "58%": { opacity: 1, transform: [{ translateY: 0 }] },
  "90%": { opacity: 1, transform: [{ translateY: 0 }] },
  "96%": { opacity: 0, transform: [{ translateY: 0 }] },
  "100%": { opacity: 0, transform: [{ translateY: 0 }] },
};

// ─── Plan ───────────────────────────────────────────────────────────────────

export const COIN: Keyframes = {
  "0%": { opacity: 0, transform: [{ translateY: 8 }] },
  "12%": { opacity: 1, transform: [{ translateY: 0 }] },
  "60%": { opacity: 1, transform: [{ translateY: -9 }] },
  "78%": { opacity: 0, transform: [{ translateY: -13 }] },
  "100%": { opacity: 0, transform: [{ translateY: -13 }] },
};

// ─── Done ───────────────────────────────────────────────────────────────────

export const burst = (x: number, y: number, r: number): Keyframes => ({
  "0%": { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: "0deg" }] },
  "1%": { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: "0deg" }], animationTimingFunction: cubicBezier(0.1, 0.8, 0.3, 1) },
  "45%": { opacity: 1, transform: [{ translateX: x }, { translateY: y }, { rotate: `${r}deg` }], animationTimingFunction: cubicBezier(0.5, 0, 1, 1) },
  "100%": { opacity: 0, transform: [{ translateX: x }, { translateY: y + 56 }, { rotate: `${r * 2}deg` }] },
});
export const HOP: Keyframes = {
  "0%": { transform: [{ translateY: 0 }], animationTimingFunction: rise },
  "35%": { transform: [{ translateY: -14 }], animationTimingFunction: fall },
  "60%": { transform: [{ translateY: 0 }] },
  "75%": { transform: [{ translateY: -5 }] },
  "100%": { transform: [{ translateY: 0 }], animationTimingFunction: rise },
};
/**
 * `slot` with the web's delay `k × 1.5s − 6s` folded in: tab `k` is lit (captioned, and under the pip) for its own quarter of the 6s
 * loop, the same frames as the web's negative delay, without one.
 */
export const slot = (k: number): Keyframes => {
  const frames: Keyframes = { "0%": { opacity: k === 0 ? 1 : 0 } };
  if (k > 0) frames[`${k * 25}%`] = { opacity: 1 };
  frames[`${(k + 1) * 25}%`] = { opacity: 0 };
  if (k < 3) frames["100%"] = { opacity: 0 };
  return frames;
};

