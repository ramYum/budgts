import { describe, expect, it } from "vitest";
import { contributionFormSchema, savingsGoalFormSchema } from "./savings";

const GOAL_ID = "1b3c9d2e-4f5a-4b6c-9d0e-1f2a3b4c5d6e";

describe("savingsGoalFormSchema", () => {
  const base = { name: "Emergency Fund", targetAmount: "10000", targetDate: "" };

  it("parses a valid goal, target into minor units, empty date to null", () => {
    expect(savingsGoalFormSchema.parse(base)).toEqual({
      name: "Emergency Fund",
      targetAmount: 1_000_000,
      targetDate: null,
    });
  });

  it("keeps a valid target date", () => {
    expect(savingsGoalFormSchema.parse({ ...base, targetDate: "2027-01-01" }).targetDate).toBe(
      "2027-01-01",
    );
  });

  it("trims and requires a name", () => {
    expect(savingsGoalFormSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
  });

  it("rejects a name over 60 chars", () => {
    expect(savingsGoalFormSchema.safeParse({ ...base, name: "x".repeat(61) }).success).toBe(false);
  });

  it("rejects a zero or negative target", () => {
    expect(savingsGoalFormSchema.safeParse({ ...base, targetAmount: "0" }).success).toBe(false);
    expect(savingsGoalFormSchema.safeParse({ ...base, targetAmount: "-5" }).success).toBe(false);
  });

  it("rejects a non-numeric target", () => {
    expect(savingsGoalFormSchema.safeParse({ ...base, targetAmount: "lots" }).success).toBe(false);
  });

  it("rejects a malformed target date", () => {
    expect(savingsGoalFormSchema.safeParse({ ...base, targetDate: "2027-1-1" }).success).toBe(false);
  });
});

describe("contributionFormSchema", () => {
  const base = { goalId: GOAL_ID, amount: "250.50", occurredAt: "2026-09-09", note: "" };

  it("parses a valid contribution into minor units", () => {
    expect(contributionFormSchema.parse(base)).toEqual({
      goalId: GOAL_ID,
      amount: 25050,
      occurredAt: "2026-09-09",
      note: null,
    });
  });

  it("keeps a trimmed note", () => {
    expect(contributionFormSchema.parse({ ...base, note: "  bonus  " }).note).toBe("bonus");
  });

  it("requires a positive amount (sign is applied server-side, not typed)", () => {
    expect(contributionFormSchema.safeParse({ ...base, amount: "-10" }).success).toBe(false);
    expect(contributionFormSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(contributionFormSchema.safeParse({ ...base, amount: "" }).success).toBe(false);
  });

  it("rejects a bad goal id", () => {
    expect(contributionFormSchema.safeParse({ ...base, goalId: "nope" }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(contributionFormSchema.safeParse({ ...base, occurredAt: "09/09/2026" }).success).toBe(
      false,
    );
  });

  it("rejects a note over 200 chars", () => {
    expect(contributionFormSchema.safeParse({ ...base, note: "x".repeat(201) }).success).toBe(false);
  });
});
