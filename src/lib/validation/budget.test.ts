import { describe, expect, it } from "vitest";
import { budgetFormSchema } from "./budget";

const base = {
  categoryId: "1b3c9d2e-4f5a-4b6c-9d0e-1f2a3b4c5d6e",
  month: "2026-09",
  amount: "400",
};

describe("budgetFormSchema", () => {
  it("parses a valid budget into minor units", () => {
    expect(budgetFormSchema.parse(base)).toEqual({
      categoryId: base.categoryId,
      month: "2026-09",
      amount: 40000,
    });
  });

  it("treats an empty amount as 0 (clears the budget)", () => {
    expect(budgetFormSchema.parse({ ...base, amount: "  " }).amount).toBe(0);
  });

  it("accepts two decimal places", () => {
    expect(budgetFormSchema.parse({ ...base, amount: "1,234.50" }).amount).toBe(123450);
  });

  it("rejects a negative amount", () => {
    expect(budgetFormSchema.safeParse({ ...base, amount: "-5" }).success).toBe(false);
  });

  it("rejects a non-numeric amount", () => {
    expect(budgetFormSchema.safeParse({ ...base, amount: "lots" }).success).toBe(false);
  });

  it("rejects a malformed month", () => {
    expect(budgetFormSchema.safeParse({ ...base, month: "2026-9" }).success).toBe(false);
  });

  it("rejects a bad category id", () => {
    expect(budgetFormSchema.safeParse({ ...base, categoryId: "nope" }).success).toBe(false);
  });
});
