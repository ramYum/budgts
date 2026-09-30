import { describe, expect, it } from "vitest";
import { displayName as webDisplayName } from "../../../src/lib/user/display-name";
import { greetingForHour as webGreeting } from "../../../src/lib/local-date";
import type { MobileHome } from "./contract";
import {
  displayName,
  figureVariant,
  greetingForHour,
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
  ...over,
});

describe("the mirrored web rules stay the web's", () => {
  it("displayName matches src/lib/user/display-name.ts", () => {
    for (const email of ["alex.lee+budgts@x.com", "sam@x.com", "o_neil@x.com", "@x.com", "", null, undefined, "ñandu-7@x.com", "z@x"])
      expect(displayName(email)).toBe(webDisplayName(email));
  });

  it("greetingForHour matches src/lib/local-date.ts at every hour", () => {
    for (let h = 0; h < 24; h++) expect(greetingForHour(h)).toBe(webGreeting(h));
  });
});

describe("Home presentation", () => {
  it("greets word by word, with or without a name", () => {
    expect(greetingWords(14, "Alex")).toEqual(["Good", "afternoon,", "Alex."]);
    expect(greetingWords(8, "")).toEqual(["Good", "morning."]);
  });

  it("steps the figure down past 13 characters (web figureSize)", () => {
    expect(figureVariant("$1,451.46")).toBe("tNumXl");
    expect(figureVariant("-$12,345,678.9")).toBe("tNumLg");
    expect(figureVariant("$1,234,567.89")).toBe("tNumXl"); // 13 exactly
    expect(figureVariant("-$1,234,567.89")).toBe("tNumLg");
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
