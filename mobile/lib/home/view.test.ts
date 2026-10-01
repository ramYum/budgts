import { describe, expect, it } from "vitest";
import type { MobileHome } from "./contract";
import {
  greetingWords,
  heroLine,
  homeBlocks,
  keptPct,
  showsOverAlert,
  subtitle,
  whereNote,
} from "./view";

const home = (over: Partial<MobileHome> = {}): MobileHome => ({
  version: 1,
  month: "2026-09",
  today: "2026-09-19",
  currency: "USD",
  moneyLeft: 145146,
  income: 320000,
  spent: 174854,
  budgeted: 191000,
  leftToSpend: 16146,
  savingsRate: 0.4536,
  categories: [],
  recent: [],
  savings: null,
  bankConnected: true,
  suggestion: null,
  breakdown: [
    { name: "Dining", amount: 15000, share: 60 },
    { name: "Groceries", amount: 10000, share: 40 },
  ],
  trend: [
    { month: "2026-04", spend: 90000 },
    { month: "2026-05", spend: 120000 },
    { month: "2026-06", spend: 110000 },
    { month: "2026-07", spend: 130000 },
    { month: "2026-08", spend: 150000 },
    { month: "2026-09", spend: 174854 },
  ],
  trendChange: { total: 174854, delta: 24854, previousMonth: "2026-08" },
  expenseCategories: [
    { id: "a", name: "Groceries" },
    { id: "c", name: "Dining" },
  ],
  ...over,
});

describe("Home presentation", () => {
  it("greets word by word, with or without a name", () => {
    expect(greetingWords(14, "Alex")).toEqual(["Good", "afternoon,", "Alex."]);
    expect(greetingWords(8, "")).toEqual(["Good", "morning."]);
  });

  it("picks the subtitle and hero sentence as the web does", () => {
    expect(subtitle(home({ income: 0, spent: 0 }))).toBe("Let's get your month set up.");
    expect(subtitle(home())).toBe("You're doing well this month.");
    expect(subtitle(home({ savingsRate: -0.2 }))).toBe("Let's see where things stand.");
    expect(subtitle(home({ savingsRate: null }))).toBe("Let's see where things stand.");
    expect(heroLine(home({ income: 0, spent: 0, savingsRate: null }))).toBe("quiet");
    expect(heroLine(home({ income: 0, savingsRate: null, moneyLeft: -100 }))).toBe("no-income");
    expect(heroLine(home({ moneyLeft: -100, savingsRate: -0.1 }))).toBe("negative");
    expect(heroLine(home())).toBe("kept");
  });

  it("lights the hero cells from the server's rate, none when negative or absent", () => {
    expect(keptPct(0.4536)).toBeCloseTo(45.36);
    expect(keptPct(-0.3)).toBe(0);
    expect(keptPct(null)).toBe(0);
  });

  it("warns when the budgets pass the income, never on an empty month", () => {
    expect(showsOverAlert(home({ budgeted: 400000 }))).toBe(true);
    expect(showsOverAlert(home({ budgeted: 320000 }))).toBe(false);
    expect(showsOverAlert(home({ budgeted: 5000, income: 0, spent: 0 }))).toBe(false);
  });

  it("reads each Where it went row's state", () => {
    expect(whereNote({ budget: 0, actual: 500, state: "over" })).toBe("unplanned");
    expect(whereNote({ budget: 1000, actual: 1500, state: "over" })).toBe("over");
    expect(whereNote({ budget: 1000, actual: 500, state: "under" })).toBe("left");
    expect(whereNote({ budget: 0, actual: 0, state: "under" })).toBe("no-budget");
  });
});

describe("homeBlocks: the web's reveal numbers", () => {
  it("a full month with a suggestion, goals and an over-income plan", () => {
    const suggestion = { kind: "mover", categoryId: "c", name: "Food", amount: 1, delta: 1 } as const;
    const savings = { activeCount: 1, totalSaved: 1, totalTarget: 2 };
    expect(homeBlocks(home({ budgeted: 400000, suggestion, savings }))).toEqual({
      overAlert: 1,
      hero: 2,
      setup: null,
      where: 3,
      trend: 4,
      change: 5,
      savings: 6,
      recent: 7,
      breakdown: 8,
    });
  });

  it("a brand-new month: set-up steps, no trend, no breakdown", () => {
    expect(homeBlocks(home({ income: 0, spent: 0, budgeted: 0, bankConnected: false }))).toEqual({
      overAlert: null,
      hero: 1,
      setup: 2,
      where: 3,
      trend: null,
      change: null,
      savings: null,
      recent: 4,
      breakdown: null,
    });
  });

  it("an empty month keeps its set-up block while a step is open (no income is always one)", () => {
    const b = homeBlocks(home({ income: 0, spent: 0, budgeted: 5000, bankConnected: null }));
    expect(b.setup).toBe(2);
  });
});
