import { describe, expect, it } from "vitest";
import { countsForMonth } from "./qualify";
import type { BudgetTxn } from "./types";

function txn(over: Partial<BudgetTxn>): BudgetTxn {
  return {
    categoryId: null,
    amount: 1000,
    direction: "debit",
    occurredAt: new Date("2026-09-10T12:00:00Z"),
    status: "confirmed",
    isTransfer: false,
    duplicateOfId: null,
    eventRole: null,
    ...over,
  };
}

describe("countsForMonth", () => {
  it("counts an ordinary confirmed, non-transfer, non-duplicate row in its month", () => {
    expect(countsForMonth(txn({}), "2026-09")).toBe(true);
  });

  it("excludes a confirmed duplicate even though every other condition qualifies", () => {
    expect(countsForMonth(txn({ duplicateOfId: "canonical-row-id" }), "2026-09")).toBe(false);
  });

  it("excludes a duplicate regardless of direction, amount, or category", () => {
    expect(
      countsForMonth(
        txn({ duplicateOfId: "canonical-row-id", direction: "credit", amount: 999999, categoryId: "groceries" }),
        "2026-09",
      ),
    ).toBe(false);
  });

  it("still excludes transfers and pending_review rows independent of duplicateOfId", () => {
    expect(countsForMonth(txn({ isTransfer: true }), "2026-09")).toBe(false);
    expect(countsForMonth(txn({ status: "pending_review" }), "2026-09")).toBe(false);
  });

  it("still respects the month filter for a non-duplicate row", () => {
    expect(countsForMonth(txn({ occurredAt: new Date("2026-08-15T00:00:00Z") }), "2026-09")).toBe(false);
  });

  it("qualifies a PURCHASE-role debit as spend", () => {
    expect(countsForMonth(txn({ eventRole: "PURCHASE", direction: "debit" }), "2026-09")).toBe(true);
  });

  it("qualifies a REFUND-role credit (nets downstream, not tested here)", () => {
    expect(countsForMonth(txn({ eventRole: "REFUND", direction: "credit" }), "2026-09")).toBe(true);
  });

  it("qualifies an INCOME-role credit", () => {
    expect(countsForMonth(txn({ eventRole: "INCOME", direction: "credit" }), "2026-09")).toBe(true);
  });

  // Regression test for the live double-counting bug (design §1): a
  // CARD_PAYMENT-role transaction is not flagged isTransfer and has no
  // category, so under the OLD countsForMonth it fell into "counts as
  // spend" alongside the purchases it pays off. budgetEffectOf resolves
  // CARD_PAYMENT to NONE, so it must be excluded here.
  it("excludes a CARD_PAYMENT-role transaction — the live double-counting bug", () => {
    expect(countsForMonth(txn({ eventRole: "CARD_PAYMENT" }), "2026-09")).toBe(false);
  });

  it("excludes a TRANSFER-role transaction", () => {
    expect(countsForMonth(txn({ eventRole: "TRANSFER" }), "2026-09")).toBe(false);
  });

  it("qualifies a FEE-role transaction", () => {
    expect(countsForMonth(txn({ eventRole: "FEE" }), "2026-09")).toBe(true);
  });

  it("qualifies an INTEREST-role transaction", () => {
    expect(countsForMonth(txn({ eventRole: "INTEREST" }), "2026-09")).toBe(true);
  });

  it("excludes a CASH_ADVANCE-role transaction", () => {
    expect(countsForMonth(txn({ eventRole: "CASH_ADVANCE" }), "2026-09")).toBe(false);
  });

  it("excludes an ADJUSTMENT-role transaction — UNKNOWN effect excludes, not just documents", () => {
    expect(countsForMonth(txn({ eventRole: "ADJUSTMENT" }), "2026-09")).toBe(false);
  });

  it("excludes a CARD_PAYMENT-role transaction that is pending_review — status gates before the role branch", () => {
    expect(countsForMonth(txn({ eventRole: "CARD_PAYMENT", status: "pending_review" }), "2026-09")).toBe(false);
  });

  it("excludes a CARD_PAYMENT-role transaction with duplicateOfId set — duplicate gate isn't bypassed by a role", () => {
    expect(countsForMonth(txn({ eventRole: "CARD_PAYMENT", duplicateOfId: "x" }), "2026-09")).toBe(false);
  });

  // Precedence proof for the status gate: PURCHASE resolves to EXPENSE and
  // would qualify (true) if the status gate did not run before the role
  // branch. Unlike tests 10/11 (CARD_PAYMENT, which excludes via the role
  // branch regardless of ordering), a qualifying role here means the only
  // way to get `false` is if `status !== "confirmed"` short-circuits first.
  it("excludes a PURCHASE-role pending_review transaction — precedence proof that status gates before the role branch", () => {
    expect(
      countsForMonth(txn({ eventRole: "PURCHASE", direction: "debit", status: "pending_review" }), "2026-09"),
    ).toBe(false);
  });

  // Precedence proof for the duplicateOfId gate: same reasoning as above —
  // PURCHASE would qualify (true) if duplicateOfId didn't short-circuit
  // before the role branch is reached.
  it("excludes a PURCHASE-role duplicate transaction — precedence proof that duplicateOfId gates before the role branch", () => {
    expect(
      countsForMonth(txn({ eventRole: "PURCHASE", direction: "debit", duplicateOfId: "some-id" }), "2026-09"),
    ).toBe(false);
  });

  it("excludes a null-role transfer — legacy path, unchanged", () => {
    expect(countsForMonth(txn({ eventRole: null, isTransfer: true }), "2026-09")).toBe(false);
  });

  it("qualifies a null-role non-transfer — legacy path, unchanged", () => {
    expect(countsForMonth(txn({ eventRole: null, isTransfer: false }), "2026-09")).toBe(true);
  });

  it("qualifies a PURCHASE-role transaction even with isTransfer true — is_transfer is never consulted once a role resolves", () => {
    expect(countsForMonth(txn({ eventRole: "PURCHASE", isTransfer: true }), "2026-09")).toBe(true);
  });
});
