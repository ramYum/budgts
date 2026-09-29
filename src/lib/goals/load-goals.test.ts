import { describe, expect, it } from "vitest";
import { goalProgress, goalsSummary } from "@/lib/budget/savings";
import { fakeSupabase, has } from "../../../tests/unit/helpers/fake-supabase";
import { loadGoalRows, loadGoals } from "./load-goals";

const GOALS = [
  { id: "g1", name: "Trip", target_amount: 100000, target_date: "2027-01-01", is_archived: false },
  { id: "g2", name: "Car", target_amount: 50000, target_date: null, is_archived: false },
];
const CONTRIBS = [
  { goal_id: "g1", amount: 30000 },
  { goal_id: "g1", amount: -5000 },
  { goal_id: "g2", amount: 60000 },
  { goal_id: "g-archived", amount: 999 },
];

function db(over: { goalsError?: boolean; contribError?: boolean; profileError?: boolean } = {}) {
  return fakeSupabase((table) => {
    if (table === "savings_goals") return over.goalsError ? { error: { message: "x" } } : { data: GOALS, count: GOALS.length };
    if (table === "savings_contributions")
      return over.contribError ? { error: { message: "x" } } : { data: CONTRIBS, count: CONTRIBS.length };
    if (table === "profiles") return over.profileError ? { error: { message: "x" } } : { data: { currency: "EUR" } };
    return { data: [] };
  });
}

describe("loadGoals", () => {
  it("is exactly goalProgress / goalsSummary over the rows (a move, not new math)", async () => {
    const data = await loadGoals(db().supabase, "u");
    const goals = GOALS.map((g) => ({
      id: g.id,
      name: g.name,
      targetAmount: g.target_amount,
      targetDate: g.target_date,
      isArchived: g.is_archived,
    }));
    const contributions = CONTRIBS.map((c) => ({ goalId: c.goal_id, amount: c.amount }));
    expect(data.items).toEqual(goals.map((g) => goalProgress(g, contributions)));
    expect(data.summary).toEqual(goalsSummary(goals, contributions));
    expect(data.items[0]).toMatchObject({ saved: 25000, remaining: 75000, pct: 25, complete: false });
    expect(data.items[1]).toMatchObject({ saved: 60000, remaining: 0, pct: 100, complete: true });
    expect(data.currency).toBe("EUR");
  });

  it("reads active goals and pages both tables with a unique order", async () => {
    const { supabase, log } = db();
    await loadGoalRows(supabase);
    const goals = log.find((l) => l.table === "savings_goals")!.calls;
    const contribs = log.find((l) => l.table === "savings_contributions")!.calls;
    expect(has(goals, "eq", "is_archived", false)).toBe(true);
    expect(has(goals, "order", "id")).toBe(true);
    expect(goals.some((c) => c[0] === "range")).toBe(true);
    expect(contribs.some((c) => c[0] === "range")).toBe(true);
  });

  it("throws on any failed read instead of showing a partial total", async () => {
    await expect(loadGoals(db({ goalsError: true }).supabase, "u")).rejects.toThrow();
    await expect(loadGoals(db({ contribError: true }).supabase, "u")).rejects.toThrow();
    await expect(loadGoals(db({ profileError: true }).supabase, "u")).rejects.toThrow();
  });
});
