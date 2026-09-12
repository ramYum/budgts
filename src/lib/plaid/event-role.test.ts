import { describe, it, expect } from "vitest";
import { resolveEventRole, SPEND_SHAPED_PRIMARIES } from "./event-role";

describe("resolveEventRole", () => {
  // Test 1: LOAN_PAYMENTS + LOAN_PAYMENTS_CREDIT_CARD_PAYMENT → CARD_PAYMENT
  it("test 1: LOAN_PAYMENTS + LOAN_PAYMENTS_CREDIT_CARD_PAYMENT → CARD_PAYMENT", () => {
    const result = resolveEventRole({
      primary: "LOAN_PAYMENTS",
      detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
      isTransfer: false,
      direction: "debit",
    });
    expect(result).toBe("CARD_PAYMENT");
  });

  // Test 2: INCOME (any detailed) → INCOME
  it("test 2: INCOME (any detailed) → INCOME", () => {
    const result = resolveEventRole({
      primary: "INCOME",
      detailed: "INCOME_SALARY",
      isTransfer: false,
      direction: "credit",
    });
    expect(result).toBe("INCOME");
  });

  // Test 3: BANK_FEES + BANK_FEES_INTEREST_CHARGE → INTEREST
  it("test 3: BANK_FEES + BANK_FEES_INTEREST_CHARGE → INTEREST", () => {
    const result = resolveEventRole({
      primary: "BANK_FEES",
      detailed: "BANK_FEES_INTEREST_CHARGE",
      isTransfer: false,
      direction: "debit",
    });
    expect(result).toBe("INTEREST");
  });

  // Test 4: BANK_FEES + BANK_FEES_ATM_FEES → FEE
  it("test 4: BANK_FEES + BANK_FEES_ATM_FEES → FEE", () => {
    const result = resolveEventRole({
      primary: "BANK_FEES",
      detailed: "BANK_FEES_ATM_FEES",
      isTransfer: false,
      direction: "debit",
    });
    expect(result).toBe("FEE");
  });

  // Test 5: BANK_FEES + unrecognized detailed → FEE (fallback within BANK_FEES)
  it("test 5: BANK_FEES + unrecognized detailed → FEE", () => {
    const result = resolveEventRole({
      primary: "BANK_FEES",
      detailed: "BANK_FEES_FUTURE_UNKNOWN_VALUE",
      isTransfer: false,
      direction: "debit",
    });
    expect(result).toBe("FEE");
  });

  // Test 6: isTransfer: true + primary: TRANSFER_OUT → TRANSFER
  it("test 6: isTransfer: true + primary: TRANSFER_OUT → TRANSFER", () => {
    const result = resolveEventRole({
      primary: "TRANSFER_OUT",
      detailed: null,
      isTransfer: true,
      direction: "debit",
    });
    expect(result).toBe("TRANSFER");
  });

  // Test 7: isTransfer: true + primary: TRANSFER_IN + detailed: TRANSFER_IN_SAVINGS → TRANSFER
  it("test 7: isTransfer: true + primary: TRANSFER_IN + detailed: TRANSFER_IN_SAVINGS → TRANSFER", () => {
    const result = resolveEventRole({
      primary: "TRANSFER_IN",
      detailed: "TRANSFER_IN_SAVINGS",
      isTransfer: true,
      direction: "credit",
    });
    expect(result).toBe("TRANSFER");
  });

  // Test 8: direction: credit + primary: FOOD_AND_DRINK (spend-shaped) → REFUND
  it("test 8: direction: credit + primary: FOOD_AND_DRINK (spend-shaped) → REFUND", () => {
    const result = resolveEventRole({
      primary: "FOOD_AND_DRINK",
      detailed: null,
      isTransfer: false,
      direction: "credit",
    });
    expect(result).toBe("REFUND");
  });

  // Test 9: direction: debit + primary: GENERAL_MERCHANDISE (spend-shaped) → PURCHASE
  it("test 9: direction: debit + primary: GENERAL_MERCHANDISE (spend-shaped) → PURCHASE", () => {
    const result = resolveEventRole({
      primary: "GENERAL_MERCHANDISE",
      detailed: null,
      isTransfer: false,
      direction: "debit",
    });
    expect(result).toBe("PURCHASE");
  });

  // Test 10: primary: null → null
  it("test 10: primary: null → null", () => {
    const result = resolveEventRole({
      primary: null,
      detailed: null,
      isTransfer: false,
      direction: "debit",
    });
    expect(result).toBeNull();
  });

  // Test 11: LOAN_PAYMENTS + LOAN_PAYMENTS_MORTGAGE_PAYMENT → null
  it("test 11: LOAN_PAYMENTS + LOAN_PAYMENTS_MORTGAGE_PAYMENT → null", () => {
    const result = resolveEventRole({
      primary: "LOAN_PAYMENTS",
      detailed: "LOAN_PAYMENTS_MORTGAGE_PAYMENT",
      isTransfer: false,
      direction: "debit",
    });
    expect(result).toBeNull();
  });

  // Test 12: LOAN_PAYMENTS + detailed: null → null
  it("test 12: LOAN_PAYMENTS + detailed: null → null", () => {
    const result = resolveEventRole({
      primary: "LOAN_PAYMENTS",
      detailed: null,
      isTransfer: false,
      direction: "debit",
    });
    expect(result).toBeNull();
  });

  // Test 13: unrecognized/future primary + direction: debit → null
  it("test 13: unrecognized/future primary + direction: debit → null", () => {
    const result = resolveEventRole({
      primary: "SOME_FUTURE_PRIMARY",
      detailed: null,
      isTransfer: false,
      direction: "debit",
    });
    expect(result).toBeNull();
  });

  // Verify SPEND_SHAPED_PRIMARIES contains exactly the right values
  it("SPEND_SHAPED_PRIMARIES contains exactly the expected values", () => {
    const expected = new Set([
      "FOOD_AND_DRINK",
      "GENERAL_MERCHANDISE",
      "HOME_IMPROVEMENT",
      "MEDICAL",
      "PERSONAL_CARE",
      "GENERAL_SERVICES",
      "GOVERNMENT_AND_NON_PROFIT",
      "TRANSPORTATION",
      "TRAVEL",
      "RENT_AND_UTILITIES",
      "ENTERTAINMENT",
    ]);
    expect(SPEND_SHAPED_PRIMARIES).toEqual(expected);
  });
});
