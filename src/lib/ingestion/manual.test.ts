import { describe, expect, it } from "vitest";
import { transactionFormSchema } from "@/lib/validation/transaction";
import { ManualAdapter, normalizeManual } from "./manual";

const raw = {
  accountId: "0a2b8c1d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  categoryId: "1b3c9d2e-4f5a-4b6c-9d0e-1f2a3b4c5d6e",
  amount: "12.34",
  direction: "debit",
  occurredAt: "2026-09-07",
  description: "Groceries",
  note: "",
};

describe("ManualAdapter", () => {
  it("normalizes a valid form payload", () => {
    expect(ManualAdapter.normalize(raw)).toEqual({
      accountId: raw.accountId,
      categoryId: raw.categoryId,
      amount: 1234,
      direction: "debit",
      occurredAt: "2026-09-07T12:00:00.000Z",
      description: "Groceries",
      note: null,
      isTransfer: false,
      source: "manual",
      sourceRef: null,
      status: "confirmed",
    });
  });

  it("throws on an invalid payload", () => {
    expect(() => ManualAdapter.normalize({ ...raw, amount: "oops" })).toThrow();
  });

  it("never produces a dedupe key", () => {
    expect(ManualAdapter.dedupeKey(ManualAdapter.normalize(raw))).toBeNull();
  });
});

describe("normalizeManual", () => {
  it("maps already-validated form input without parsing again", () => {
    const parsed = transactionFormSchema.parse(raw);
    expect(normalizeManual(parsed)).toEqual(ManualAdapter.normalize(raw));
  });
});
