import { describe, expect, it } from "vitest";
import { TABLE_TOPICS, topicsFor } from "./topics";

describe("realtime tables → the screens they refresh (web <RealtimeRefresh> placements)", () => {
  it("watches exactly the web's tables", () => {
    expect(Object.keys(TABLE_TOPICS).sort()).toEqual(["budgets", "savings_contributions", "savings_goals", "transactions"]);
  });

  it("a budgets change refreshes Budgets and Home; a goal change refreshes Goals and Home", () => {
    expect(topicsFor(["budgets"])).toEqual(["budgets", "home"]);
    expect(topicsFor(["savings_goals", "savings_contributions"])).toEqual(["goals", "home"]);
    expect(topicsFor(["transactions", "budgets"])).toEqual(["transactions", "home", "budgets", "accounts"]);
  });
});
