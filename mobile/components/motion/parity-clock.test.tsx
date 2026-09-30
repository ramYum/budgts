import { afterEach, describe, expect, it } from "vitest";
import { applyDevLink, resetDevLink } from "../../lib/dev/fault";
import { motionTiming, parityClockMs } from "../../lib/motion/parity-clock";

afterEach(() => resetDevLink());

describe("the one parity clock", () => {
  it("runs every animation as timed when no clock is pinned", () => {
    expect(motionTiming(110, null)).toEqual({ animationDelay: "110ms", animationPlayState: "running" });
  });

  it("pauses an animation at the pinned instant (a negative delay seeks into it)", () => {
    expect(motionTiming(180, 500)).toEqual({ animationDelay: "-320ms", animationPlayState: "paused" });
  });

  it("takes the pin from the dev link, and never in a release build", () => {
    applyDevLink("budgts://budgets?clock=900", true);
    expect(parityClockMs(true)).toBe(900);
    expect(parityClockMs(false)).toBeNull();
  });
});
