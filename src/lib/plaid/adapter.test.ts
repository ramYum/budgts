import { describe, expect, it } from "vitest";
import { normalizePlaidTxn } from "./adapter";
import { UnknownPfcPrimaryError } from "./category-map";
import type { AccountMapEntry, NormalizeCtx, PlaidTxnInput } from "./types";

const CHECKING = "acct-plaid-1";
const BUDGTS_ACCT = "budgts-acct-1";

const accountMap = new Map<string, AccountMapEntry>([
  [CHECKING, { plaidAccountRowId: "pa-row-1", budgtsAccountId: BUDGTS_ACCT, ignored: false, signConvention: "standard" }],
  ["acct-ignored", { plaidAccountRowId: "pa-row-2", budgtsAccountId: "x", ignored: true, signConvention: "standard" }],
]);

function ctx(over: Partial<NormalizeCtx> = {}): NormalizeCtx {
  return {
    accountMap,
    currency: "USD",
    resolveCategory: ({ merchantEntityId, merchantName, description, primary }) => {
      if (merchantEntityId === "ent-remembered") return "cat-remembered";
      // stand-in for the R2 merchant-knowledge layer
      if ((merchantName ?? description ?? "").toLowerCase().includes("netflix")) return "cat-entertainment";
      if (primary === "FOOD_AND_DRINK") return "cat-food";
      if (primary === "INCOME") return "cat-salary";
      if (primary === "WEIRD_NEW") throw new UnknownPfcPrimaryError("WEIRD_NEW");
      return null;
    },
    ...over,
  };
}

function txn(over: Partial<PlaidTxnInput> = {}): PlaidTxnInput {
  return {
    transaction_id: "txn-1",
    account_id: CHECKING,
    amount: 12.34,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
    date: "2026-09-08",
    name: "SQ *BLUE BOTTLE",
    merchant_name: "Blue Bottle Coffee",
    merchant_entity_id: "ent-bluebottle",
    pending: false,
    pending_transaction_id: null,
    personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE", confidence_level: "HIGH" },
    ...over,
  };
}

function expectTxn(r: ReturnType<typeof normalizePlaidTxn>) {
  if (r.kind !== "txn") throw new Error(`expected a txn, got skip:${(r as { reason: string }).reason}`);
  return r.txn;
}

describe("normalizePlaidTxn", () => {
  it("normalises a routine debit", () => {
    const input = txn();
    const t = expectTxn(normalizePlaidTxn(input, ctx()));
    expect(t.raw).toBe(input); // the raw Plaid payload is stored verbatim
    expect(t).toMatchObject({
      accountId: BUDGTS_ACCT,
      plaidAccountRowId: "pa-row-1",
      amount: 1234,
      direction: "debit",
      description: "Blue Bottle Coffee",
      isTransfer: false,
      source: "bank",
      sourceRef: "txn-1",
      status: "confirmed",
      pending: false,
      pendingSourceRef: null,
      merchantName: "Blue Bottle Coffee",
      merchantEntityId: "ent-bluebottle",
      plaidCategoryPrimary: "FOOD_AND_DRINK",
      plaidPfcConfidence: "HIGH",
      categoryId: "cat-food",
      note: null,
    });
    expect(t.occurredAt).toBe("2026-09-08T00:00:00.000Z");
    expect(t.authorizedAt).toBeNull();
  });

  it("treats a negative amount as a credit (income / refund)", () => {
    const t = expectTxn(
      normalizePlaidTxn(
        txn({ amount: -2000, personal_finance_category: { primary: "INCOME", detailed: "INCOME_WAGES", confidence_level: "VERY_HIGH" } }),
        ctx(),
      ),
    );
    expect(t.direction).toBe("credit");
    expect(t.amount).toBe(200000);
    expect(t.categoryId).toBe("cat-salary");
  });

  it("refund: negative amount that maps to an expense category stays a credit there", () => {
    const t = expectTxn(
      normalizePlaidTxn(txn({ amount: -12.34 }), ctx()), // FOOD_AND_DRINK
    );
    expect(t.direction).toBe("credit");
    expect(t.categoryId).toBe("cat-food");
  });

  it("prefers datetime/authorized_datetime over the date fields", () => {
    const t = expectTxn(
      normalizePlaidTxn(
        txn({ datetime: "2026-09-08T14:30:00Z", authorized_datetime: "2026-09-07T22:05:00Z" }),
        ctx(),
      ),
    );
    expect(t.occurredAt).toBe("2026-09-08T14:30:00.000Z");
    expect(t.authorizedAt).toBe("2026-09-07T22:05:00.000Z");
  });

  it("falls back to authorized_date when there is no authorized_datetime", () => {
    const t = expectTxn(normalizePlaidTxn(txn({ authorized_date: "2026-09-07" }), ctx()));
    expect(t.authorizedAt).toBe("2026-09-07T00:00:00.000Z");
  });

  it("uses name when merchant_name is absent", () => {
    const t = expectTxn(normalizePlaidTxn(txn({ merchant_name: null }), ctx()));
    expect(t.description).toBe("SQ *BLUE BOTTLE");
    expect(t.merchantName).toBeNull();
  });

  it("flags TRANSFER_IN / TRANSFER_OUT and never categorises them", () => {
    for (const primary of ["TRANSFER_IN", "TRANSFER_OUT"]) {
      const t = expectTxn(
        normalizePlaidTxn(
          txn({ personal_finance_category: { primary, detailed: `${primary}_ACCOUNT_TRANSFER`, confidence_level: "HIGH" } }),
          ctx(),
        ),
      );
      expect(t.isTransfer).toBe(true);
      expect(t.categoryId).toBeNull();
    }
  });

  it("carries pending + pending_transaction_id through", () => {
    const t = expectTxn(
      normalizePlaidTxn(txn({ pending: true, transaction_id: "pend-1" }), ctx()),
    );
    expect(t.pending).toBe(true);
    const posted = expectTxn(
      normalizePlaidTxn(txn({ pending: false, transaction_id: "post-1", pending_transaction_id: "pend-1" }), ctx()),
    );
    expect(posted.pending).toBe(false);
    expect(posted.pendingSourceRef).toBe("pend-1");
  });

  it("skips a zero-amount transaction (the amount > 0 CHECK forbids storing it)", () => {
    const r = normalizePlaidTxn(txn({ amount: 0 }), ctx());
    expect(r).toEqual({ kind: "skip", reason: "zero-amount", transactionId: "txn-1" });
  });

  it("skips an unknown account", () => {
    expect(normalizePlaidTxn(txn({ account_id: "nope" }), ctx())).toMatchObject({ kind: "skip", reason: "unknown-account" });
  });

  it("skips an ignored account", () => {
    expect(normalizePlaidTxn(txn({ account_id: "acct-ignored" }), ctx())).toMatchObject({
      kind: "skip",
      reason: "ignored-account",
    });
  });

  it("lands a currency-mismatched txn as pending_review (excluded from rollups)", () => {
    const t = expectTxn(normalizePlaidTxn(txn({ iso_currency_code: "EUR" }), ctx({ currency: "USD" })));
    expect(t.status).toBe("pending_review");
    expect(t.amount).toBe(1234); // still recorded, just not counted
  });

  it("does not throw on an unknown PFC primary — lands uncategorised", () => {
    const t = expectTxn(
      normalizePlaidTxn(
        txn({ personal_finance_category: { primary: "WEIRD_NEW", detailed: "WEIRD_NEW_THING", confidence_level: "HIGH" } }),
        ctx(),
      ),
    );
    expect(t.categoryId).toBeNull();
    expect(t.plaidCategoryPrimary).toBe("WEIRD_NEW");
  });

  it("per-merchant memory wins over the PFC map", () => {
    const t = expectTxn(normalizePlaidTxn(txn({ merchant_entity_id: "ent-remembered" }), ctx()));
    expect(t.categoryId).toBe("cat-remembered");
  });

  it("passes merchant_name + name into resolveCategory (drives name-based categorization)", () => {
    const t = expectTxn(
      normalizePlaidTxn(
        txn({
          merchant_entity_id: null,
          merchant_name: "Netflix",
          name: "NETFLIX.COM",
          personal_finance_category: {
            primary: "GENERAL_MERCHANDISE",
            detailed: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES",
            confidence_level: "LOW",
          },
        }),
        ctx(),
      ),
    );
    expect(t.categoryId).toBe("cat-entertainment");
  });

  it("falls back to `name` when merchant_name is null", () => {
    const t = expectTxn(
      normalizePlaidTxn(txn({ merchant_entity_id: null, merchant_name: null, name: "NETFLIX.COM" }), ctx()),
    );
    expect(t.categoryId).toBe("cat-entertainment");
  });

  it("handles a transaction with no personal_finance_category", () => {
    const t = expectTxn(normalizePlaidTxn(txn({ personal_finance_category: null }), ctx()));
    expect(t.categoryId).toBeNull();
    expect(t.plaidCategoryPrimary).toBeNull();
    expect(t.isTransfer).toBe(false);
  });

  it.each([
    ["12", 1200],
    ["12.3", 1230],
    ["0.05", 5],
    ["1234.5", 123450],
  ])("converts amount %s -> %d minor units", (amt, minor) => {
    const t = expectTxn(normalizePlaidTxn(txn({ amount: Number(amt) }), ctx()));
    expect(t.amount).toBe(minor);
  });

  it("flips direction for an account with an inverted sign convention", () => {
    const invertedMap = new Map(accountMap);
    invertedMap.set(CHECKING, { ...invertedMap.get(CHECKING)!, signConvention: "inverted" });
    // Plaid says amount > 0 = outflow; under an inverted feed that's actually inflow.
    const input = txn({ amount: 12.34 });
    const t = expectTxn(normalizePlaidTxn(input, ctx({ accountMap: invertedMap })));
    expect(t.direction).toBe("credit");
    expect(t.status).toBe("confirmed");
    expect(t.pendingReason).toBeNull();
  });

  it("keeps direction unchanged for an account with a standard sign convention", () => {
    const input = txn({ amount: 12.34 });
    const t = expectTxn(normalizePlaidTxn(input, ctx()));
    expect(t.direction).toBe("debit");
    expect(t.pendingReason).toBeNull();
  });

  it("lands as pending_review with reason sign_convention_unknown while the account's convention is unresolved", () => {
    const unknownMap = new Map(accountMap);
    unknownMap.set(CHECKING, { ...unknownMap.get(CHECKING)!, signConvention: "unknown" });
    const input = txn({ amount: 12.34 });
    const t = expectTxn(normalizePlaidTxn(input, ctx({ accountMap: unknownMap })));
    expect(t.status).toBe("pending_review");
    expect(t.pendingReason).toBe("sign_convention_unknown");
    // Direction still reflects the raw (uncorrected) mapping while unknown —
    // finalization is responsible for flipping it later if warranted.
    expect(t.direction).toBe("debit");
  });

  it("prefers currency_mismatch as the pending reason over sign_convention_unknown when both apply", () => {
    const unknownMap = new Map(accountMap);
    unknownMap.set(CHECKING, { ...unknownMap.get(CHECKING)!, signConvention: "unknown" });
    const input = txn({ amount: 12.34, iso_currency_code: "EUR" });
    const t = expectTxn(normalizePlaidTxn(input, ctx({ accountMap: unknownMap })));
    expect(t.status).toBe("pending_review");
    expect(t.pendingReason).toBe("currency_mismatch");
  });

  describe("eventRole", () => {
    it("resolves LOAN_PAYMENTS/LOAN_PAYMENTS_CREDIT_CARD_PAYMENT to CARD_PAYMENT, independent of category resolution", () => {
      const t = expectTxn(
        normalizePlaidTxn(
          txn({
            personal_finance_category: {
              primary: "LOAN_PAYMENTS",
              detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
              confidence_level: "HIGH",
            },
          }),
          ctx({
            resolveCategory: ({ primary }) => (primary === "LOAN_PAYMENTS" ? "cat-loan-payment" : null),
          }),
        ),
      );
      expect(t.eventRole).toBe("CARD_PAYMENT");
      // categoryId still comes from the normal category-resolution path — the
      // two computations run independently and don't interfere.
      expect(t.categoryId).toBe("cat-loan-payment");
    });

    it("resolves TRANSFER_IN to TRANSFER without changing isTransfer's own value", () => {
      const t = expectTxn(
        normalizePlaidTxn(
          txn({
            personal_finance_category: {
              primary: "TRANSFER_IN",
              detailed: "TRANSFER_IN_ACCOUNT_TRANSFER",
              confidence_level: "HIGH",
            },
          }),
          ctx(),
        ),
      );
      expect(t.eventRole).toBe("TRANSFER");
      expect(t.isTransfer).toBe(true);
    });

    it("resolves INCOME to INCOME using the already sign-corrected direction on an inverted account", () => {
      const invertedMap = new Map(accountMap);
      invertedMap.set(CHECKING, { ...invertedMap.get(CHECKING)!, signConvention: "inverted" });
      const t = expectTxn(
        normalizePlaidTxn(
          txn({
            amount: -2000,
            personal_finance_category: { primary: "INCOME", detailed: "INCOME_WAGES", confidence_level: "HIGH" },
          }),
          ctx({ accountMap: invertedMap }),
        ),
      );
      expect(t.eventRole).toBe("INCOME");
    });

    it("computes a non-null eventRole even for a currency-mismatched pending_review row", () => {
      const t = expectTxn(normalizePlaidTxn(txn({ iso_currency_code: "EUR" }), ctx())); // FOOD_AND_DRINK, debit
      expect(t.status).toBe("pending_review");
      expect(t.pendingReason).toBe("currency_mismatch");
      expect(t.eventRole).toBe("PURCHASE");
      expect(t.eventRole).not.toBeNull();
    });

    it("never reaches event-role resolution on the zero-amount / unknown-account skip paths", () => {
      const zero = normalizePlaidTxn(txn({ amount: 0 }), ctx());
      expect(zero).toEqual({ kind: "skip", reason: "zero-amount", transactionId: "txn-1" });

      const unknown = normalizePlaidTxn(txn({ account_id: "nope" }), ctx());
      expect(unknown).toMatchObject({ kind: "skip", reason: "unknown-account" });
    });
  });
});
