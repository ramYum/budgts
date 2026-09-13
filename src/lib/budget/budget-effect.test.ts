import { describe, expect, it } from "vitest";
import { budgetEffectOf } from "./budget-effect";

describe("budgetEffectOf", () => {
  it("PURCHASE -> EXPENSE", () => {
    expect(budgetEffectOf("PURCHASE", "debit")).toBe("EXPENSE");
  });

  it("REFUND -> EXPENSE_REVERSAL (NOT EXPENSE — spec §7 distinct label)", () => {
    const result = budgetEffectOf("REFUND", "credit");
    expect(result).toBe("EXPENSE_REVERSAL");
    expect(result).not.toBe("EXPENSE");
  });

  it("INCOME -> INCOME", () => {
    expect(budgetEffectOf("INCOME", "credit")).toBe("INCOME");
  });

  it("CARD_PAYMENT -> NONE", () => {
    expect(budgetEffectOf("CARD_PAYMENT", "debit")).toBe("NONE");
  });

  it("TRANSFER -> NONE", () => {
    expect(budgetEffectOf("TRANSFER", "debit")).toBe("NONE");
  });

  it("FEE -> EXPENSE", () => {
    expect(budgetEffectOf("FEE", "debit")).toBe("EXPENSE");
  });

  it("INTEREST -> EXPENSE", () => {
    expect(budgetEffectOf("INTEREST", "debit")).toBe("EXPENSE");
  });

  it("P2P_PAYMENT debit -> EXPENSE", () => {
    expect(budgetEffectOf("P2P_PAYMENT", "debit")).toBe("EXPENSE");
  });

  it("P2P_PAYMENT credit -> INCOME", () => {
    expect(budgetEffectOf("P2P_PAYMENT", "credit")).toBe("INCOME");
  });

  it("CASH_ADVANCE -> NONE", () => {
    expect(budgetEffectOf("CASH_ADVANCE", "debit")).toBe("NONE");
  });

  it("ADJUSTMENT -> UNKNOWN", () => {
    expect(budgetEffectOf("ADJUSTMENT", "debit")).toBe("UNKNOWN");
  });

  it("null eventRole -> null (NOT UNKNOWN — spec §2 kept-distinct invariant)", () => {
    const result = budgetEffectOf(null, "debit");
    expect(result).toBe(null);
    expect(result).not.toBe("UNKNOWN");
  });

  it("direction-irrelevance: PURCHASE with credit is still EXPENSE (only P2P_PAYMENT is direction-sensitive)", () => {
    expect(budgetEffectOf("PURCHASE", "credit")).toBe("EXPENSE");
  });
});
