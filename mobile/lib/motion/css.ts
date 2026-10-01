import { cubicBezier } from "react-native-reanimated";
import { MOTION } from "../brand/shared";

/**
 * The web's motion vocabulary (src/app/globals.css) as Reanimated 4 CSS
 * animations: the same keyframes, durations, delays and easing, run on the
 * UI thread. Entrances fill `backwards`, like the web's: they hold their
 * start through the delay, then let go, so the resting style is the final
 * frame (and the frame shown with motion off).
 */
export const EASE_OUT = cubicBezier(MOTION.easeOut[0], MOTION.easeOut[1], MOTION.easeOut[2], MOTION.easeOut[3]);

/**
 * A transform origin `x` px across and `y` (px or a percentage) down a view, as numbers React Native takes as they are.
 * Never write it as a "…px" string: React Native reads a string origin with /\d+px/, so a float such as
 * "54.00000000000001px" reads as 1px (Crystal turned about her left edge, off her shadow, not on her feet).
 * The only way to write a computed origin: test/transform-origin-guard.test.ts fails on any other (a template, a `+`,
 * or a string beyond `left|right|top|bottom|center|N%`).
 */
export const pxOrigin = (x: number, y: number | `${number}%`): [number, number | string, number] => [x, y, 0];

/** `@keyframes page-enter`: a new screen arrived. */
export const PAGE_ENTER = { from: { opacity: 0, transform: [{ translateY: 6 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } };

/** `@keyframes rise-in`: a section in the reading-order cascade. */
export const RISE_IN = { from: { opacity: 0, transform: [{ translateY: 10 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } };

/** `.reveal`'s delay for section `i`. */
export const revealDelayMs = (i: number) => i * MOTION.revealStepMs + MOTION.revealBaseMs;

/** `.reveal[data-reveal="shown"]`: a block that waited below the fold plays a little longer as it scrolls in. */
export const REVEAL_SHOWN_MS = 640;

/** `@keyframes cell-alarm`: an over-budget bar, once full, flashes twice (steps(1, end), 720ms). */
export const CELL_ALARM = {
  "0%": { opacity: 1 },
  "20%": { opacity: 0.2 },
  "40%": { opacity: 1 },
  "60%": { opacity: 0.2 },
  "80%": { opacity: 1 },
  "100%": { opacity: 1 },
};
export const CELL_ALARM_MS = 720;

/** `.px-bar`'s sweep delay for a bar that starts `start` steps after the page's first. */
export const sweepDelayMs = (start: number) => start * MOTION.cellStepMs + 300;
/** `.cells-over .px-bar`'s flash delay. */
export const alarmDelayMs = (start: number) => (start + 16) * MOTION.cellStepMs + 520;

/** `.roll-reel`: each digit's reel spins in left to right, then glides to each new value. */
export const ROLL_IN_MS = 1400;
export const ROLL_GLIDE_MS = 900;
export const rollDelayMs = (column: number) => column * 45 + 120;

/** `@keyframes cell-in` on steps(3, end), 240ms: a chart cell snaps in like a sprite (`.cell`). */
export const CELL_IN = { from: { opacity: 0, transform: [{ scale: 0.3 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } };
export const CELL_IN_MS = 240;
/** `.cell`'s delay for step `d` (`--d`): 22ms a step after 220ms. */
export const cellDelayMs = (d: number) => d * 22 + 220;

/** `@keyframes pop-in` on steps(3, end), 300ms: a tag or menu snaps in (`.pop`). */
export const POP_IN = { from: { opacity: 0, transform: [{ scale: 0.4 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } };
export const POP_MS = 300;

/** `@keyframes pip-in` on steps(3, end), 220ms: the tab marker and the bell's badge snap in (`.pip`). */
export const PIP_IN = { from: { transform: [{ scale: 0 }] }, to: { transform: [{ scale: 1 }] } };
export const PIP_MS = 220;
