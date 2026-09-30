import { describe, expect, it } from "vitest";
import { savingsBarPct, savingsPct } from "./savings-pct";

describe("savingsPct (the rounded share: Goals' Total saved line, Home's savings badge)", () => {
  it("is 0 with no target", () => {
    expect(savingsPct(0, 0)).toBe(0);
    expect(savingsPct(5000, 0)).toBe(0);
  });

  it("is the whole percent of the target saved, Math.round (halves toward +infinity)", () => {
    expect(savingsPct(465000, 500000)).toBe(93);
    expect(savingsPct(1, 200)).toBe(1); // 0.5
    expect(savingsPct(1, 300)).toBe(0); // 0.33
    expect(savingsPct(2, 3)).toBe(67);
  });

  it("is uncapped past the target, and negative when more was withdrawn than saved", () => {
    expect(savingsPct(15000, 10000)).toBe(150);
    expect(savingsPct(-500, 10000)).toBe(-5);
  });
});

describe("savingsBarPct (the unrounded share Home's savings bar lights)", () => {
  it("is 0 with no target", () => {
    expect(savingsBarPct(5000, 0)).toBe(0);
  });

  it("is the exact percent, unrounded and unclamped (the bar clamps)", () => {
    expect(savingsBarPct(1, 3)).toBeCloseTo(33.3333333, 6);
    expect(savingsBarPct(465000, 500000)).toBe(93);
    expect(savingsBarPct(15000, 10000)).toBe(150);
    expect(savingsBarPct(-500, 10000)).toBe(-5);
  });
});
