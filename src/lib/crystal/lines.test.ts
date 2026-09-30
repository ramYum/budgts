import { describe, expect, it } from "vitest";
import { formatSavingsRate } from "@/lib/display/money";
import { crystalCheers, crystalLines } from "./lines";

describe("crystalLines", () => {
  it("greets by name when it fits the bubble, and generically when it doesn't", () => {
    expect(crystalLines("Alex", 0.3, formatSavingsRate).hello).toBe("Hi, Alex!");
    expect(crystalLines("Christopher", 0.3, formatSavingsRate).hello).toBe("Hi there!");
    expect(crystalLines("", 0.3, formatSavingsRate).hello).toBe("Hi there!");
  });

  it("leads with the month's note: the savings rate, overspending, or no income yet", () => {
    expect(crystalLines("Alex", 0.32, formatSavingsRate).lines[0]).toBe("32% saved!");
    expect(crystalLines("Alex", -0.11, formatSavingsRate).lines[0]).toBe("Spent > earned");
    expect(crystalLines("Alex", null, formatSavingsRate).lines[0]).toBe("No income yet");
  });
});

describe("crystalCheers", () => {
  it("cheers to the month's mood: celebrating, regrouping, or getting started", () => {
    expect(crystalCheers(0.32)).toContain("Future you says thanks!");
    expect(crystalCheers(-0.2)).toContain("Tomorrow's a fresh start");
    expect(crystalCheers(null)).toContain("Add income to begin!");
  });

  it("keeps every line short enough for her bubble, with no em-dashes", () => {
    for (const rate of [0.32, -0.2, null]) {
      const cheers = crystalCheers(rate);
      expect(cheers.length).toBeGreaterThanOrEqual(5);
      for (const line of cheers) {
        expect(line.length).toBeLessThanOrEqual(24);
        expect(line).not.toMatch(/[—–]/);
      }
    }
  });
});
