import { ROAM, bubbleSide, hopLength, nextOuting, type Dir } from "../../lib/brand/shared";

/**
 * Crystal's walk as a plan the UI thread plays (web src/components/crystal-perch.tsx,
 * whose timers this simulates step for step, with the shared rules of
 * src/lib/crystal/roam.ts). The plan is worked out ahead on the JS thread, a
 * minute at a time; a worklet then reads where she is at any instant of her
 * own clock, which runs only while she is on screen and the app is in front,
 * so there is no timer per hop and nothing per frame on the JS thread.
 *
 * Time is her own clock in ms from when she arrived (the arrival itself is
 * the CSS-ported entrance, the same 0 point). A tap changes what happens after
 * it: `replanAfterTap` keeps everything already under way and works the rest
 * out again, as the web's timers would see the tap.
 */

export type Action = "outing" | "hop" | "rest";

/** What the web's closure holds between its timers, at the moment `action` is due. */
export type RoamState = {
  at: number;
  action: Action;
  /** where she stands, 0 (left end) … 1 (right end) */
  f: number;
  dir: Dir;
  facing: Dir;
  holdUntil: number;
  lastSaid: number;
  cheer: number;
  stops: number[];
  i: number;
};

export type Hop = { at: number; from: number; to: number };
export type Face = { at: number; facing: Dir };
export type Cheer = { at: number; side: "left" | "right"; index: number };
export type Events = { hops: Hop[]; faces: Face[]; pecks: number[]; cheers: Cheer[] };

/** One of the web's timer callbacks, and what it set in motion. */
export type Step = { state: RoamState; events: Events };

export type Rand = () => number;

const none = (): Events => ({ hops: [], faces: [], pecks: [], cheers: [] });
const between = (rand: Rand, lo: number, hi: number) => lo + rand() * (hi - lo);

/** Her state on arrival: the middle of the edge, facing right, heading a random way, and quiet until her hello and note are done. */
export function initialState(rand: Rand): RoamState {
  return {
    at: 0,
    action: "outing",
    f: ROAM.startF,
    dir: rand() < 0.5 ? -1 : 1,
    facing: 1,
    holdUntil: ROAM.firstOutingMs,
    // her arrival's hello and note end at 7.7s: the first cheer counts from there
    lastSaid: 7700,
    cheer: 0,
    stops: [],
    i: 0,
  };
}

/** Runs the one callback due in `s`, on an edge `span` px long (her track less her own width). */
export function advance(s: RoamState, span: number, rand: Rand): { next: RoamState; events: Events } {
  const t = s.at;
  const events = none();
  if (s.action === "outing") {
    if (s.holdUntil > t) return { next: { ...s, at: s.holdUntil }, events };
    if (span <= 0) return { next: { ...s, action: "rest" }, events };
    const hops = Math.floor(between(rand, ROAM.hops[0], ROAM.hops[1] + 1));
    const plan = nextOuting(s.f, s.dir, hopLength(span) / span, hops);
    const turning = s.facing !== plan.dir;
    if (turning) events.faces.push({ at: t, facing: plan.dir });
    return {
      next: { ...s, action: "hop", at: t + (turning ? ROAM.turnMs : 0), dir: plan.dir, facing: plan.dir, stops: plan.stops, i: 0 },
      events,
    };
  }
  if (s.action === "hop") {
    // a tap mid-outing stops her where she lands
    if (s.i >= s.stops.length || s.holdUntil > t) return { next: { ...s, action: "rest" }, events };
    const to = s.stops[s.i]!;
    events.hops.push({ at: t, from: s.f, to });
    return { next: { ...s, f: to, i: s.i + 1, at: t + ROAM.hopMs + ROAM.hopGapMs }, events };
  }
  // rest: a line of encouragement, at most every cheerEveryMs, while she rests; then maybe a peck; then the next outing
  let { lastSaid, holdUntil, cheer } = s;
  if (t - lastSaid >= ROAM.cheerEveryMs && t >= holdUntil) {
    events.cheers.push({ at: t, side: bubbleSide(s.f), index: cheer });
    cheer += 1;
    lastSaid = t;
    holdUntil = Math.max(holdUntil, t + ROAM.cheerMs);
  }
  const ms = between(rand, ROAM.restMs[0], ROAM.restMs[1]);
  if (rand() < 0.4) events.pecks.push(t + ms / 2);
  return { next: { ...s, action: "outing", at: t + ms, lastSaid, holdUntil, cheer }, events };
}

/** Plays the plan forward from `from` until an action falls due after `until`; returns those steps and the next one due. */
export function planUntil(from: RoamState, until: number, span: number, rand: Rand): { steps: Step[]; pending: RoamState } {
  const steps: Step[] = [];
  let s = from;
  // a guard, not a limit anyone reaches: a minute holds a few dozen callbacks
  for (let n = 0; s.at <= until && n < 10_000; n++) {
    const { next, events } = advance(s, span, rand);
    steps.push({ state: s, events });
    s = next;
  }
  return { steps, pending: s };
}

/**
 * A tap at `now`: she stays put for the jump and its line (the web sets hold and last-said directly), so every
 * callback due after `now` is worked out again from the first of them; everything earlier stands, including a peck
 * a past rest already set for later.
 */
export function replanAfterTap(
  steps: Step[],
  pending: RoamState,
  now: number,
  until: number,
  span: number,
  rand: Rand,
): { steps: Step[]; pending: RoamState } {
  const kept = steps.filter((st) => st.state.at <= now);
  const firstLater = steps.find((st) => st.state.at > now)?.state ?? pending;
  const from = { ...firstLater, holdUntil: now + ROAM.tapHoldMs, lastSaid: now + 850 };
  const rest = planUntil(from, until, span, rand);
  return { steps: [...kept, ...rest.steps], pending: rest.pending };
}

/** Everything the steps set in motion, in time order per kind. */
export function eventsOf(steps: Step[]): Events {
  const all = none();
  for (const { events } of steps) {
    all.hops.push(...events.hops);
    all.faces.push(...events.faces);
    all.pecks.push(...events.pecks);
    all.cheers.push(...events.cheers);
  }
  all.pecks.sort((a, b) => a - b);
  return all;
}

/** Where she stands at `t` once every hop begun by then has landed (the next line's bubble side). */
export function standingAt(hops: Hop[], t: number): number {
  let f: number = ROAM.startF;
  for (const h of hops) if (h.at <= t) f = h.to;
  return f;
}
