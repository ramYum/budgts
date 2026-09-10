import { describe, expect, it } from "vitest";
import { goalProgress, goalsSummary, type SavingsContribution, type SavingsGoal } from "./savings";

const goal = (over: Partial<SavingsGoal> = {}): SavingsGoal => ({
  id: "g1",
  name: "Emergency Fund",
  targetAmount: 1_000_000, // $10,000.00
  targetDate: null,
  isArchived: false,
  ...over,
});

const c = (goalId: string, amount: number): SavingsContribution => ({ goalId, amount });

describe("goalProgress", () => {
  it("sums this goal's contributions and computes remaining + pct", () => {
    const p = goalProgress(goal(), [c("g1", 200_000), c("g1", 50_000), c("other", 999)]);
    expect(p).toMatchObject({
      id: "g1",
      name: "Emergency Fund",
      target: 1_000_000,
      saved: 250_000,
      remaining: 750_000,
      pct: 25,
      complete: false,
    });
  });

  it("nets a withdrawal (negative contribution)", () => {
    const p = goalProgress(goal(), [c("g1", 300_000), c("g1", -100_000)]);
    expect(p.saved).toBe(200_000);
    expect(p.pct).toBe(20);
  });

  it("clamps pct to 100 and marks complete when saved >= target", () => {
    const p = goalProgress(goal(), [c("g1", 1_000_000), c("g1", 250_000)]);
    expect(p.pct).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.complete).toBe(true);
  });

  it("clamps pct to 0 when saved is negative (over-withdrawn)", () => {
    const p = goalProgress(goal(), [c("g1", 10_000), c("g1", -40_000)]);
    expect(p.saved).toBe(-30_000);
    expect(p.pct).toBe(0);
    // remaining is target - saved, so an over-withdrawal makes it exceed target
    expect(p.remaining).toBe(1_030_000);
  });

  it("handles a goal with no contributions", () => {
    const p = goalProgress(goal(), []);
    expect(p).toMatchObject({ saved: 0, pct: 0, remaining: 1_000_000, complete: false });
  });

  it("carries the target date through", () => {
    expect(goalProgress(goal({ targetDate: "2027-06-01" }), []).targetDate).toBe("2027-06-01");
  });
});

describe("goalsSummary", () => {
  it("totals non-archived goals and counts complete ones", () => {
    const goals = [
      goal({ id: "g1", targetAmount: 1_000_000 }),
      goal({ id: "g2", name: "Trip", targetAmount: 300_000 }),
      goal({ id: "g3", name: "Old", targetAmount: 500_000, isArchived: true }),
    ];
    const contributions = [
      c("g1", 250_000),
      c("g2", 300_000), // complete
      c("g3", 500_000), // archived, ignored
    ];
    expect(goalsSummary(goals, contributions)).toEqual({
      totalTarget: 1_300_000,
      totalSaved: 550_000,
      activeCount: 2,
      completeCount: 1,
    });
  });

  it("is all zeros with no goals", () => {
    expect(goalsSummary([], [])).toEqual({
      totalTarget: 0,
      totalSaved: 0,
      activeCount: 0,
      completeCount: 0,
    });
  });
});
