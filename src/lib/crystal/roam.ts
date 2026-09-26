/**
 * Crystal's walk along the top edge of Home's Money left card
 * (src/components/crystal-perch.tsx). She's meant to be noticed, not to pull
 * focus from the figure she stands on: short outings of a few small hops,
 * long rests between them, turning back at each end.
 *
 * Positions are fractions of the edge she can stand on: 0 is the left end,
 * 1 the right end. She lands in the middle.
 */

export type Dir = -1 | 1;

export const ROAM = {
  /** where she lands: the middle of the edge */
  startF: 0.5,
  /** a hop's flight, then a beat on the ground before the next */
  hopMs: 360,
  hopGapMs: 160,
  /** a quick look before setting off the other way */
  turnMs: 420,
  /** rests between outings (ms), and hops per outing */
  restMs: [4500, 8500] as const,
  hops: [2, 4] as const,
  /** her first outing waits for the arrival's hello and note (done by 7.7s) */
  firstOutingMs: 8600,
  /** a tap's jump, then its line (said at 850ms for 3s): she stays put for it */
  tapHoldMs: 4100,
  /** a line of encouragement at most this often (ms, from her last line), on
   * screen for cheerMs while she stays put */
  cheerEveryMs: 8000,
  cheerMs: 3600,
} as const;

const settle = (x: number) => Math.round(x * 1e6) / 1e6;

/** One hop's length (px) for an edge `spanPx` long: small hops on a phone,
 * longer ones on a wide card, so a crossing takes about the same few outings. */
export function hopLength(spanPx: number): number {
  return spanPx < 480 ? 36 : 48;
}

/** Her next outing: up to `hops` steps the way she's heading, stopping at an
 * end. Already at an end, she turns back first. */
export function nextOuting(f: number, dir: Dir, step: number, hops: number): { dir: Dir; stops: number[] } {
  const heading: Dir = (dir < 0 && f <= 0) || (dir > 0 && f >= 1) ? ((-dir) as Dir) : dir;
  const stops: number[] = [];
  let x = f;
  for (let i = 0; i < hops; i++) {
    x = settle(Math.min(1, Math.max(0, x + heading * step)));
    stops.push(x);
    if (x === 0 || x === 1) break;
  }
  return { dir: heading, stops };
}

/** Her speech bubble opens toward the middle of the card, so it never runs
 * off an end (or off a phone's screen). */
export function bubbleSide(f: number): "left" | "right" {
  return f > 0.5 ? "left" : "right";
}
