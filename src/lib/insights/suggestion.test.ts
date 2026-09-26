import { describe, expect, it } from "vitest";
import type { DashboardBar } from "@/lib/budget/dashboard";
import { pickSuggestion } from "./suggestion";

const bar = (over: Partial<DashboardBar> & Pick<DashboardBar, "categoryId" | "name">): DashboardBar => ({
  color: "#000",
  budget: 0,
  actual: 0,
  remaining: 0,
  pctUsed: 0,
  state: "under",
  ...over,
});

describe("pickSuggestion", () => {
  it("first asks for a budget on the biggest spending that has none", () => {
    const bars = [
      bar({ categoryId: "food", name: "Food", budget: 40000, actual: 11693 }),
      bar({ categoryId: "home", name: "Housing", actual: 145000, state: "over" }),
      bar({ categoryId: "fun", name: "Fun", actual: 3000, state: "over" }),
    ];
    expect(pickSuggestion(bars, [], 167193)).toEqual({
      kind: "unbudgeted",
      categoryId: "home",
      name: "Housing",
      amount: 145000,
      share: 87,
    });
  });

  it("otherwise points at the category that grew most against last month", () => {
    const bars = [
      bar({ categoryId: "food", name: "Food", budget: 40000, actual: 11693 }),
      bar({ categoryId: "car", name: "Car", budget: 15000, actual: 4200 }),
    ];
    const prev = [bar({ categoryId: "food", name: "Food", actual: 7845 }), bar({ categoryId: "car", name: "Car", actual: 4200 })];
    expect(pickSuggestion(bars, prev, 15893)).toEqual({
      kind: "mover",
      categoryId: "food",
      name: "Food",
      amount: 11693,
      delta: 3848,
    });
  });

  it("says nothing when nothing is unplanned and nothing grew", () => {
    const bars = [bar({ categoryId: "food", name: "Food", budget: 40000, actual: 5000 })];
    expect(pickSuggestion(bars, [bar({ categoryId: "food", name: "Food", actual: 9000 })], 5000)).toBeNull();
    expect(pickSuggestion([], [], 0)).toBeNull();
  });

  it("ignores categories with no budget and no spending", () => {
    const bars = [bar({ categoryId: "ins", name: "Insurances" })];
    expect(pickSuggestion(bars, [], 0)).toBeNull();
  });
});
