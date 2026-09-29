import { describe, expect, it } from "vitest";
import { stepAt } from "./stepped";

describe("stepAt: sprite timing", () => {
  const timeline = { stepMs: 80, intro: 3, loop: 4 };

  it("holds each step for its whole duration, then jumps", () => {
    expect(stepAt(0, timeline)).toBe(0);
    expect(stepAt(79.9, timeline)).toBe(0);
    expect(stepAt(80, timeline)).toBe(1);
  });

  it("plays the intro once, then repeats the loop after it", () => {
    const steps = Array.from({ length: 12 }, (_, i) => stepAt(i * 80 + 1, timeline));
    expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6, 3, 4, 5, 6, 3]);
  });

  it("holds the last step of an intro with a one-step loop (an entrance that stays)", () => {
    expect(stepAt(10_000, { stepMs: 20, intro: 5, loop: 1 })).toBe(5);
  });

  it("never runs backwards before the clock starts", () => {
    expect(stepAt(-50, timeline)).toBe(0);
  });
});
