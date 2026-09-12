import type { EventRole } from "./types";

export interface EventRoleInput {
  primary: string | null;
  detailed: string | null;
  isTransfer: boolean;
  direction: "debit" | "credit";
}

/**
 * Spend-shaped primaries that can resolve to PURCHASE or REFUND.
 * Matches category-map.ts's PRIMARY_TO_CATEGORY_NAME spend categories,
 * minus INCOME/TRANSFER_IN/TRANSFER_OUT/LOAN_PAYMENTS/BANK_FEES
 * (which are handled by earlier rows of the resolution table).
 */
export const SPEND_SHAPED_PRIMARIES = new Set([
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

/**
 * Resolves a transaction's Event Role from its (already sign-corrected)
 * direction and Plaid PFC fields. Pure, deterministic, no I/O. Design:
 * docs/specs/2026-09-12-event-role-design.md §3. Every branch not listed
 * there returns null — never guess.
 */
export function resolveEventRole(input: EventRoleInput): EventRole | null {
  const { primary, detailed, isTransfer, direction } = input;

  // Row 1: LOAN_PAYMENTS + LOAN_PAYMENTS_CREDIT_CARD_PAYMENT → CARD_PAYMENT
  if (
    primary === "LOAN_PAYMENTS" &&
    detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"
  ) {
    return "CARD_PAYMENT";
  }

  // Row 2: INCOME (any detailed) → INCOME
  if (primary === "INCOME") {
    return "INCOME";
  }

  // Row 3: BANK_FEES + BANK_FEES_INTEREST_CHARGE → INTEREST
  if (primary === "BANK_FEES" && detailed === "BANK_FEES_INTEREST_CHARGE") {
    return "INTEREST";
  }

  // Row 4: BANK_FEES (any other detailed) → FEE
  if (primary === "BANK_FEES") {
    return "FEE";
  }

  // Row 5: isTransfer is true → TRANSFER
  if (isTransfer) {
    return "TRANSFER";
  }

  // Row 6: direction === "credit" + spend-shaped primary → REFUND
  if (direction === "credit" && SPEND_SHAPED_PRIMARIES.has(primary ?? "")) {
    return "REFUND";
  }

  // Row 7: direction === "debit" + spend-shaped primary → PURCHASE
  if (direction === "debit" && SPEND_SHAPED_PRIMARIES.has(primary ?? "")) {
    return "PURCHASE";
  }

  // Anything else → null (unresolved)
  return null;
}
