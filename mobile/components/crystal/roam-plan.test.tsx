import { describe, expect, it } from "vitest";
import { ROAM } from "../../lib/brand/shared";
import { advance, eventsOf, initialState, planUntil, replanAfterTap, standingAt, trimSteps, type RoamState } from "./roam-plan";

/** A seeded generator, so a plan is the same every run. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A generator that plays back fixed draws. */
const draws = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length]!;
};

const SPAN = 360; // a 412pt phone: the card's edge less 32 of inset and her 52
const STEP = 36 / SPAN;

describe("Crystal's walk plan (the web's timers, step for step)", () => {
  it("arrives in the middle facing right and stays put until her hello and note are done", () => {
    const s = initialState(draws(0.7));
    expect(s).toMatchObject({ at: 0, f: 0.5, facing: 1, dir: 1, holdUntil: ROAM.firstOutingMs, lastSaid: 7700 });
    const { next, events } = advance(s, SPAN, Math.random);
    expect(next).toMatchObject({ action: "outing", at: ROAM.firstOutingMs });
    expect(eventsOf([{ state: s, events }]).hops).toEqual([]);
  });

  it("an outing heading the way she faces starts at once; hops of 36px, 520ms apart", () => {
    const s: RoamState = { ...initialState(draws(0.7)), at: 8600 };
    // hops: floor(2 + 0.5 × 3) = 3
    const { steps } = planUntil(s, 8600 + 3 * 520, SPAN, draws(0.5));
    const hops = eventsOf(steps).hops;
    expect(hops.map((h) => h.at)).toEqual([8600, 9120, 9640]);
    expect(hops.map((h) => h.to)).toEqual([0.5 + STEP, 0.5 + 2 * STEP, 0.5 + 3 * STEP].map((x) => Math.round(x * 1e6) / 1e6));
    expect(eventsOf(steps).faces).toEqual([]);
  });

  it("turning the other way she looks first: the turn, then 420ms, then the hop", () => {
    const s: RoamState = { ...initialState(draws(0.2)), at: 8600 }; // heading left while facing right
    const { steps } = planUntil(s, 9100, SPAN, draws(0));
    const ev = eventsOf(steps);
    expect(ev.faces).toEqual([{ at: 8600, facing: -1 }]);
    expect(ev.hops[0]).toMatchObject({ at: 8600 + ROAM.turnMs, from: 0.5, to: 0.5 - STEP });
  });

  it("stops at an end and turns back on the next outing", () => {
    const s: RoamState = { ...initialState(draws(0.7)), at: 8600, f: 1 - STEP / 2, facing: 1, dir: 1 };
    const { steps } = planUntil(s, 40_000, SPAN, draws(0.99, 0.5, 0.9));
    const ev = eventsOf(steps);
    expect(ev.hops[0]!.to).toBe(1);
    expect(ev.hops[1]!.to).toBeLessThan(1);
    expect(ev.faces[0]!.facing).toBe(-1);
  });

  it("rests 4.5–8.5s between outings, pecking halfway 40% of the time", () => {
    const rest: RoamState = { ...initialState(draws(0.7)), action: "rest", at: 10_000, lastSaid: 9_000 };
    const pecked = advance(rest, SPAN, draws(0.5, 0.1));
    expect(pecked.next).toMatchObject({ action: "outing", at: 10_000 + 6500 });
    expect(pecked.events.pecks).toEqual([10_000 + 3250]);
    expect(advance(rest, SPAN, draws(0.5, 0.9)).events.pecks).toEqual([]);
  });

  it("cheers at most every 8s, only while resting and not held, and holds still while she talks", () => {
    const rest: RoamState = { ...initialState(draws(0.7)), action: "rest", at: 20_000, lastSaid: 12_000, holdUntil: 0 };
    const said = advance(rest, SPAN, draws(0.5, 0.9));
    expect(said.events.cheers).toEqual([{ at: 20_000, side: "right", index: 0 }]);
    expect(said.next).toMatchObject({ lastSaid: 20_000, holdUntil: 20_000 + ROAM.cheerMs, cheer: 1 });
    expect(advance({ ...rest, lastSaid: 12_001 }, SPAN, draws(0.5, 0.9)).events.cheers).toEqual([]);
    expect(advance({ ...rest, holdUntil: 20_001 }, SPAN, draws(0.5, 0.9)).events.cheers).toEqual([]);
    // her bubble opens toward the middle
    expect(advance({ ...rest, f: 0.8 }, SPAN, draws(0.5, 0.9)).events.cheers[0]!.side).toBe("left");
  });

  it("a plan worked out in stretches is the plan worked out at once", () => {
    const whole = planUntil(initialState(seeded(7)), 120_000, SPAN, seeded(8));
    const r1 = seeded(7);
    const r2 = seeded(8);
    const first = planUntil(initialState(r1), 60_000, SPAN, r2);
    const rest = planUntil(first.pending, 120_000, SPAN, r2);
    expect(eventsOf([...first.steps, ...rest.steps])).toEqual(eventsOf(whole.steps));
  });

  it("stays on the edge and keeps the web's rhythm over ten minutes", () => {
    const { steps } = planUntil(initialState(seeded(3)), 600_000, SPAN, seeded(4));
    const ev = eventsOf(steps);
    expect(ev.hops.length).toBeGreaterThan(50);
    for (const h of ev.hops) {
      expect(h.to).toBeGreaterThanOrEqual(0);
      expect(h.to).toBeLessThanOrEqual(1);
      expect(Math.abs(h.to - h.from)).toBeLessThanOrEqual(STEP + 1e-9);
    }
    for (let i = 1; i < ev.cheers.length; i++) expect(ev.cheers[i]!.at - ev.cheers[i - 1]!.at).toBeGreaterThanOrEqual(ROAM.cheerEveryMs);
    expect(ev.hops[0]!.at).toBeGreaterThanOrEqual(ROAM.firstOutingMs);
  });

  it("a tap mid-outing: the hop under way lands, the rest wait out her 4.1s hold, and no cheer talks over her line", () => {
    const rand = seeded(11);
    const plan = planUntil(initialState(seeded(10)), 60_000, SPAN, rand);
    const before = eventsOf(plan.steps);
    const tapAt = before.hops[1]!.at + 100; // just after her second hop took off
    const next = replanAfterTap(plan.steps, plan.pending, tapAt, 60_000, SPAN, seeded(12));
    const after = eventsOf(next.steps);
    expect(after.hops.filter((h) => h.at <= tapAt)).toEqual(before.hops.filter((h) => h.at <= tapAt));
    const later = after.hops.filter((h) => h.at > tapAt);
    expect(later[0]!.at).toBeGreaterThanOrEqual(tapAt + ROAM.tapHoldMs);
    const cheers = after.cheers.filter((c) => c.at > tapAt);
    if (cheers.length) expect(cheers[0]!.at).toBeGreaterThanOrEqual(tapAt + 850 + ROAM.cheerEveryMs);
    expect(standingAt(after.hops, tapAt)).toBe(before.hops[1]!.to);
  });

  it("a narrow edge (nothing to walk) keeps her resting in place", () => {
    const { steps } = planUntil({ ...initialState(seeded(1)), at: 8600 }, 60_000, 0, seeded(2));
    expect(eventsOf(steps).hops).toEqual([]);
  });
});

describe("trimming the walk as it is extended (review: she teleported to the middle)", () => {
  it("keeps her place and facing identical across every extend, for many walks", async () => {
    const { placeAt, facingAt } = await import("./motion");
    let broken = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = seeded(seed * 7919);
      let plan = planUntil(initialState(r), 60_000, SPAN, r);
      for (let now = 45_000; now < 300_000; now += 40_000) {
        const before = eventsOf(plan.steps);
        const more = planUntil(plan.pending, now + 60_000, SPAN, r);
        const steps = [...trimSteps(plan.steps, now), ...more.steps];
        const after = eventsOf(steps);
        for (const t of [now, now + 100, now + 1000]) {
          if (placeAt(after.hops, t) !== placeAt(before.hops, t) || facingAt(after.faces, t) !== facingAt(before.faces, t)) broken++;
        }
        plan = { steps, pending: more.pending };
      }
    }
    expect(broken).toBe(0);
  });
});
