import { describe, expect, it } from "vitest";
import { mergePages, parseTransactionsPage, type MobileTransaction, type TransactionsPage } from "./transactions-api";

const txn = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  amount: 1234,
  direction: "debit",
  occurredAt: "2026-09-10T12:00:00+00:00",
  description: `Txn ${id}`,
  note: null,
  isTransfer: false,
  category: { id: "c1", name: "Groceries", color: "#0f0" },
  account: { id: "a1", name: "Wallet" },
  uncategorized: false,
  ...over,
});

describe("parseTransactionsPage", () => {
  it("accepts the server contract, tolerating fields it does not know (older apps must survive additive changes)", () => {
    const page = parseTransactionsPage({ version: 1, month: "2026-09", items: [{ ...txn("t1"), somethingNew: true }], nextCursor: null, extra: 1 });
    expect(page).toEqual({ month: "2026-09", items: [txn("t1")], nextCursor: null });
  });

  it("keeps a null category and a cursor", () => {
    const page = parseTransactionsPage({ version: 1, month: "2026-09", items: [txn("t1", { category: null, uncategorized: true })], nextCursor: "abc" });
    expect(page.items[0].category).toBeNull();
    expect(page.nextCursor).toBe("abc");
  });

  it.each([
    ["a non-integer amount", { items: [txn("t1", { amount: 12.34 })] }],
    ["an unknown direction", { items: [txn("t1", { direction: "sideways" })] }],
    ["a missing account", { items: [txn("t1", { account: null })] }],
    ["items that are not a list", { items: "nope" }],
    ["a missing month", { month: undefined }],
  ])("rejects %s", (_name, over) => {
    expect(() => parseTransactionsPage({ version: 1, month: "2026-09", items: [], nextCursor: null, ...over })).toThrow();
  });
});

describe("mergePages", () => {
  const page = (ids: string[], nextCursor: string | null): TransactionsPage => ({
    month: "2026-09",
    items: ids.map((id) => txn(id) as unknown as MobileTransaction),
    nextCursor,
  });

  it("appends the next page and adopts its cursor", () => {
    const merged = mergePages(page(["a", "b"], "c1"), page(["c"], null));
    expect(merged.items.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(merged.nextCursor).toBeNull();
  });

  it("never shows a row twice if a page overlaps (e.g. a row was added while paging)", () => {
    const merged = mergePages(page(["a", "b"], "c1"), page(["b", "c"], "c2"));
    expect(merged.items.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(merged.nextCursor).toBe("c2");
  });
});
