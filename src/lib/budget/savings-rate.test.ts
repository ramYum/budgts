import { describe, expect, it } from "vitest";
import { savingsRate } from "./savings-rate";

describe("savingsRate", () => {
  it("test 7: an ordinary month, income 100.00, moneyLeft 30.00 -> 0.3", () => {
    expect(savingsRate(100_00, 30_00)).toBe(0.3);
  });

  it("test 8: overspent -- negative moneyLeft produces a negative rate, not clamped", () => {
    expect(savingsRate(100_00, -20_00)).toBe(-0.2);
  });

  it("test 9: zero income produces null, never 0", () => {
    expect(savingsRate(0, 0)).toBeNull();
  });

  it("test 10: negative income produces null, same as the zero case", () => {
    expect(savingsRate(-50_00, -50_00)).toBeNull();
  });

  it("test 11: money left exceeding income produces a rate over 1, not clamped", () => {
    expect(savingsRate(100_00, 150_00)).toBe(1.5);
  });
});
