import { describe, expect, it } from "vitest";
import { parseGoals } from "./goals-api";

const goal = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  name: "Emergency fund",
  target: 500000,
  saved: 465000,
  remaining: 35000,
  pct: 93,
  complete: false,
  targetDate: "2027-04-01",
  ...over,
});
const body = (over: Record<string, unknown> = {}) => ({
  version: 1,
  currency: "USD",
  today: "2026-09-30",
  summary: { totalTarget: 500000, totalSaved: 465000, activeCount: 1, completeCount: 0 },
  goals: [goal()],
  ...over,
});

describe("parseGoals (server buildMobileGoals)", () => {
  it("accepts the contract, tolerating unknown fields", () => {
    expect(parseGoals({ ...body({ goals: [{ ...goal(), extra: 1 }] }), extra: true })).toEqual({
      currency: "USD",
      today: "2026-09-30",
      summary: { totalTarget: 500000, totalSaved: 465000, activeCount: 1, completeCount: 0 },
      goals: [goal()],
    });
  });

  it("allows no target date and a negative saved (over-withdrawn)", () => {
    const g = parseGoals(body({ goals: [goal({ targetDate: null, saved: -500, pct: 0 })] })).goals[0];
    expect(g.targetDate).toBeNull();
    expect(g.saved).toBe(-500);
  });

  it.each([
    ["a fractional amount", { goals: [goal({ saved: 1.5 })] }],
    ["a missing summary", { summary: undefined }],
    ["a non-boolean complete", { goals: [goal({ complete: "no" })] }],
  ])("rejects %s", (_n, over) => {
    expect(() => parseGoals(body(over))).toThrow();
  });
});
