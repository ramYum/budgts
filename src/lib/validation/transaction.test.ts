import { describe, expect, it } from "vitest";
import { dateToIso, transactionFormSchema } from "./transaction";

const base = {
  accountId: "0a2b8c1d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  categoryId: "1b3c9d2e-4f5a-4b6c-9d0e-1f2a3b4c5d6e",
  amount: "12.34",
  direction: "debit",
  occurredAt: "2026-09-07",
  description: "Groceries at Wegmans",
  note: "",
};

describe("transactionFormSchema", () => {
  it("parses a valid manual entry into clean values", () => {
    const parsed = transactionFormSchema.parse(base);
    expect(parsed).toMatchObject({
      accountId: base.accountId,
      categoryId: base.categoryId,
      amount: 1234,
      direction: "debit",
      occurredAt: "2026-09-07",
      description: "Groceries at Wegmans",
      note: null,
      isTransfer: false,
    });
  });

  it("treats an empty categoryId as uncategorized", () => {
    expect(transactionFormSchema.parse({ ...base, categoryId: "" }).categoryId).toBeNull();
  });

  it("coerces a checkbox 'on' to isTransfer true", () => {
    expect(transactionFormSchema.parse({ ...base, isTransfer: "on" }).isTransfer).toBe(true);
  });

  it("rejects a non-numeric amount", () => {
    const r = transactionFormSchema.safeParse({ ...base, amount: "abc" });
    expect(r.success).toBe(false);
  });

  it("rejects a zero or negative amount", () => {
    expect(transactionFormSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(transactionFormSchema.safeParse({ ...base, amount: "-5" }).success).toBe(false);
  });

  it("rejects a missing account", () => {
    expect(transactionFormSchema.safeParse({ ...base, accountId: "" }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(transactionFormSchema.safeParse({ ...base, occurredAt: "07/09/2026" }).success).toBe(false);
  });

  it("rejects an over-long description", () => {
    expect(transactionFormSchema.safeParse({ ...base, description: "x".repeat(201) }).success).toBe(false);
  });

  it("keeps a non-empty note", () => {
    expect(transactionFormSchema.parse({ ...base, note: "  paid cash  " }).note).toBe("paid cash");
  });
});

describe("dateToIso", () => {
  it("maps a calendar date to noon UTC", () => {
    expect(dateToIso("2026-09-07")).toBe("2026-09-07T12:00:00.000Z");
  });

  it("rejects a non ISO-date string", () => {
    expect(() => dateToIso("2026-9-7")).toThrow();
  });
});
