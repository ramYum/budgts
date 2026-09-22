import { describe, expect, it } from "vitest";
import type { MobileTransaction } from "./transactions-api";
import { draftFromTransaction, draftToPayload, emptyDraft, minorToInput, newRequestId, normalizeAmountInput, parseDraft, validateDraft } from "./form";

const ACCOUNT = "33333333-3333-4333-8333-333333333333";

describe("normalizeAmountInput", () => {
  it("accepts a decimal comma when it is unambiguous", () => {
    expect(normalizeAmountInput("12,34")).toBe("12.34");
    expect(normalizeAmountInput(" 7,5 ")).toBe("7.5");
  });

  it("leaves everything else for the server, the single authority on amount rules", () => {
    expect(normalizeAmountInput("12.34")).toBe("12.34");
    expect(normalizeAmountInput("1,234.50")).toBe("1,234.50"); // a thousands separator, not a decimal comma
    expect(normalizeAmountInput("abc")).toBe("abc");
  });
});

describe("minorToInput", () => {
  it("renders integer minor units as the decimal a person would type", () => {
    expect(minorToInput(1234)).toBe("12.34");
    expect(minorToInput(5)).toBe("0.05");
    expect(minorToInput(100000)).toBe("1000.00");
  });
});

describe("emptyDraft / validateDraft", () => {
  it("starts as an expense dated today with no account chosen", () => {
    expect(emptyDraft("2026-09-21", null)).toEqual({
      accountId: null,
      categoryId: null,
      amount: "",
      direction: "debit",
      date: "2026-09-21",
      description: "",
      note: "",
      isTransfer: false,
    });
  });

  it("asks for an account and an amount before it will submit", () => {
    expect(validateDraft(emptyDraft("2026-09-21", null))).toEqual({ accountId: "Choose an account", amount: "Enter an amount" });
    expect(validateDraft({ ...emptyDraft("2026-09-21", ACCOUNT), amount: "5" })).toEqual({});
  });
});

describe("draftToPayload", () => {
  it("builds the wire body: trimmed text, null for no category, request id for idempotency", () => {
    const payload = draftToPayload(
      { accountId: ACCOUNT, categoryId: null, amount: "12,34", direction: "credit", date: "2026-09-10", description: "  Refund ", note: " ", isTransfer: false },
      "req-1234abcd",
    );
    expect(payload).toEqual({
      accountId: ACCOUNT,
      categoryId: null,
      amount: "12.34",
      direction: "credit",
      occurredAt: "2026-09-10",
      description: "Refund",
      note: "",
      isTransfer: false,
      requestId: "req-1234abcd",
    });
  });

  it("omits the request id on an edit", () => {
    const payload = draftToPayload({ ...emptyDraft("2026-09-10", ACCOUNT), amount: "1" });
    expect("requestId" in payload).toBe(false);
  });
});

describe("draftFromTransaction", () => {
  it("turns a listed transaction back into an editable draft", () => {
    const t: MobileTransaction = {
      id: "t1",
      amount: 1234,
      direction: "debit",
      occurredAt: "2026-09-10T12:00:00+00:00",
      description: "Coffee",
      note: null,
      isTransfer: true,
      category: { id: "c1", name: "Dining", color: "#f00" },
      account: { id: ACCOUNT, name: "Wallet" },
      uncategorized: false,
    };
    expect(draftFromTransaction(t)).toEqual({
      accountId: ACCOUNT,
      categoryId: "c1",
      amount: "12.34",
      direction: "debit",
      date: "2026-09-10",
      description: "Coffee",
      note: "",
      isTransfer: true,
    });
  });
});

describe("parseDraft", () => {
  it("round-trips a draft passed between screens as a route param", () => {
    const d = { ...emptyDraft("2026-09-10", ACCOUNT), amount: "5.00", description: "Lunch" };
    expect(parseDraft(JSON.stringify(d))).toEqual(d);
  });

  it("returns null for anything that is not a well-formed draft, so the screen falls back to a blank form", () => {
    expect(parseDraft(undefined)).toBeNull();
    expect(parseDraft("not json")).toBeNull();
    expect(parseDraft(JSON.stringify({ amount: 5 }))).toBeNull();
    expect(parseDraft(JSON.stringify({ ...emptyDraft("2026-09-10", ACCOUNT), direction: "sideways" }))).toBeNull();
  });
});

describe("newRequestId", () => {
  it("is a fresh id that satisfies the server's request-id format", () => {
    let n = 0;
    const id = newRequestId(() => (n++ * 0.137) % 1);
    expect(id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(newRequestId(() => 0.5)).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });
});
