import { describe, expect, it } from "vitest";
import { loadLedger, type FetchPage, type LedgerProgress } from "./ledger";
import type { MobileTransaction, TransactionsPage } from "./transactions-api";

const t = (id: string) => ({ id }) as MobileTransaction;
const page = (ids: string[], nextCursor: string | null): TransactionsPage => ({ month: "2026-09", items: ids.map(t), nextCursor });
const ok = (p: TransactionsPage) => ({ status: "ready" as const, data: p });
const fail = { status: "error" as const, kind: "network" as const, message: "Couldn't reach Budgts." };

function pages(script: Record<string, ReturnType<typeof ok> | typeof fail>) {
  const asked: (string | null)[] = [];
  const fetchPage: FetchPage = async (cursor) => {
    asked.push(cursor);
    return script[cursor ?? "first"]!;
  };
  return { fetchPage, asked };
}

const ids = (p: LedgerProgress | null) => (p && p.status === "ready" ? p.page.items.map((x) => x.id) : null);

describe("loadLedger: every row of the month, page after page", () => {
  it("follows the cursor to the end, reporting each page as it lands", async () => {
    const { fetchPage, asked } = pages({ first: ok(page(["a", "b"], "c1")), c1: ok(page(["c"], "c2")), c2: ok(page(["d"], null)) });
    const seen: (string[] | null)[] = [];
    const out = await loadLedger(fetchPage, { isCurrent: () => true, onProgress: (p) => seen.push(ids(p)) });
    expect(asked).toEqual([null, "c1", "c2"]);
    expect(seen).toEqual([["a", "b"], ["a", "b", "c"], ["a", "b", "c", "d"]]);
    expect(out).toMatchObject({ status: "ready", cursor: null, restError: null });
  });

  it("shows a row that arrives on two pages once", async () => {
    const { fetchPage } = pages({ first: ok(page(["a", "b"], "c1")), c1: ok(page(["b", "c"], null)) });
    expect(ids(await loadLedger(fetchPage, { isCurrent: () => true }))).toEqual(["a", "b", "c"]);
  });

  it("fails as a whole when the first page fails", async () => {
    const { fetchPage } = pages({ first: fail });
    expect(await loadLedger(fetchPage, { isCurrent: () => true })).toEqual({ status: "error", message: fail.message });
  });

  it("keeps the rows already loaded when a later page fails, with the cursor to resume from", async () => {
    const { fetchPage } = pages({ first: ok(page(["a"], "c1")), c1: fail });
    const out = await loadLedger(fetchPage, { isCurrent: () => true });
    expect(out).toMatchObject({ status: "ready", cursor: "c1", restError: fail.message });
    expect(ids(out)).toEqual(["a"]);
  });

  it("resumes from a cursor onto the rows it already has", async () => {
    const { fetchPage, asked } = pages({ c1: ok(page(["b"], null)) });
    const out = await loadLedger(fetchPage, { from: { page: page(["a"], "c1"), cursor: "c1" }, isCurrent: () => true });
    expect(asked).toEqual(["c1"]);
    expect(ids(out)).toEqual(["a", "b"]);
  });

  it("stops without another request once superseded (a new month, a newer refresh)", async () => {
    const { fetchPage, asked } = pages({ first: ok(page(["a"], "c1")), c1: ok(page(["b"], null)) });
    let current = true;
    const out = await loadLedger(fetchPage, {
      isCurrent: () => current,
      onProgress: () => {
        current = false;
      },
    });
    expect(out).toBeNull();
    expect(asked).toEqual([null]);
  });
});
