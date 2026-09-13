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
    transferUserSet: false,
    accountExcluded: false,
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

  // Reviewer finding (qualify-integration final review, Important #2): a
  // malformed/unrecognized event_role must never silently make a row
  // disappear from every total the way a deliberately-excluded role
  // (CARD_PAYMENT/TRANSFER/CASH_ADVANCE/ADJUSTMENT) does. `as EventRole`
  // simulates data that bypassed the DB CHECK constraint and the TS type
  // boundary (e.g. a pre-constraint row, or any future writer that skips
  // validation) — countsForMonth must treat it as unresolved, falling
  // back to the same legacy `!isTransfer` path a null role takes, not as
  // a silent exclusion.
  it("falls back to the legacy !isTransfer path for an unrecognized event_role — never silently drops the row", () => {
    expect(
      countsForMonth(txn({ eventRole: "BOGUS_ROLE" as BudgetTxn["eventRole"], isTransfer: false }), "2026-09"),
    ).toBe(true);
  });

  it("an unrecognized event_role still excludes via the legacy path when isTransfer is true", () => {
    expect(
      countsForMonth(txn({ eventRole: "BOGUS_ROLE" as BudgetTxn["eventRole"], isTransfer: true }), "2026-09"),
    ).toBe(false);
  });

  // Task 4 (design: 2026-09-12 transfer-ownership §4, §10 items 5-9): the
  // new transferUserSet branch. Explicit user decision outranks any
  // machine-resolved eventRole — but never the three absolute gates above
  // it (month/status/duplicateOfId), which keep unconditional precedence
  // over everything, including a user's transfer decision.

  it("test 5: transferUserSet wins over a qualifying role — user's mark-as-transfer excludes a would-be PURCHASE", () => {
    expect(
      countsForMonth(txn({ transferUserSet: true, isTransfer: true, eventRole: "PURCHASE" }), "2026-09"),
    ).toBe(false);
  });

  it("test 6: transferUserSet wins over an excluding role — user's unmark qualifies a would-be TRANSFER", () => {
    expect(
      countsForMonth(txn({ transferUserSet: true, isTransfer: false, eventRole: "TRANSFER" }), "2026-09"),
    ).toBe(true);
  });

  it("test 7: transferUserSet false leaves an untouched row unaffected — regression guard, CARD_PAYMENT still excludes", () => {
    expect(
      countsForMonth(txn({ transferUserSet: false, isTransfer: false, eventRole: "CARD_PAYMENT" }), "2026-09"),
    ).toBe(false);
  });

  it("test 8: the status gate still outranks an explicit user transfer decision", () => {
    expect(
      countsForMonth(txn({ transferUserSet: true, isTransfer: false, status: "pending_review" }), "2026-09"),
    ).toBe(false);
  });

  it("test 9: the duplicateOfId gate still outranks an explicit user transfer decision", () => {
    expect(
      countsForMonth(txn({ transferUserSet: true, isTransfer: false, duplicateOfId: "canonical-row-id" }), "2026-09"),
    ).toBe(false);
  });

  // No-user-decision path: transferUserSet stays false, so behavior is
  // exactly as before Task 4 — the role branch (or, if unresolved, the
  // legacy !isTransfer fallback) decides, completely unaffected by this
  // new branch's existence.

  it("no-user-decision path: falls through to the role branch exactly as before", () => {
    expect(countsForMonth(txn({ transferUserSet: false, eventRole: "INCOME", direction: "credit" }), "2026-09")).toBe(
      true,
    );
  });

  it("no-user-decision path: falls through to the legacy !isTransfer check exactly as before", () => {
    expect(countsForMonth(txn({ transferUserSet: false, eventRole: null, isTransfer: true }), "2026-09")).toBe(false);
  });

  // Calculation-exclusion containment (design: 2026-09-13 Advancial
  // containment) — a new absolute gate alongside status/duplicateOfId,
  // reflecting an explicit owner decision that a Plaid account's data must
  // never participate in financial totals. Never set automatically.

  it("excludes an accountExcluded row even though every other condition qualifies", () => {
    expect(countsForMonth(txn({ accountExcluded: true }), "2026-09")).toBe(false);
  });

  it("accountExcluded gates before the role/effect branch — a qualifying PURCHASE role still excludes", () => {
    expect(countsForMonth(txn({ accountExcluded: true, eventRole: "PURCHASE" }), "2026-09")).toBe(false);
  });

  it("accountExcluded outranks an explicit user transfer decision, same tier as status/duplicateOfId", () => {
    expect(
      countsForMonth(txn({ accountExcluded: true, transferUserSet: true, isTransfer: false }), "2026-09"),
    ).toBe(false);
  });

  it("a non-excluded account continues to qualify normally — regression guard", () => {
    expect(countsForMonth(txn({ accountExcluded: false, eventRole: "PURCHASE" }), "2026-09")).toBe(true);
  });
});
