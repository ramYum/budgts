import { describe, expect, it } from "vitest";
import { fetchAllRows, type RowCount } from "./fetch-all-rows";

/** A fake paginated table: `rows` in order, served `from`..`to` inclusive like
 * PostgREST's range, with the exact total when the page asks for it. Records
 * every call and the most pages ever in flight at once. */
function fakeTable<T>(rows: T[], opts: { countOverride?: number } = {}) {
  const calls: Array<{ from: number; to: number; count: RowCount }> = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const buildPage = async (from: number, to: number, count: RowCount) => {
    calls.push({ from, to, count });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--;
    return {
      data: rows.slice(from, to + 1),
      error: null,
      count: count === "exact" ? (opts.countOverride ?? rows.length) : null,
    };
  };
  return { buildPage, calls, maxInFlight: () => maxInFlight };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("fetchAllRows", () => {
  it("returns everything from a single short page, in one request", async () => {
    const t = fakeTable([1, 2, 3]);
    expect(await fetchAllRows(t.buildPage, 5)).toEqual([1, 2, 3]);
    expect(t.calls).toEqual([{ from: 0, to: 4, count: "exact" }]);
  });

  it("returns an empty array when there are no rows at all", async () => {
    const t = fakeTable<number>([]);
    expect(await fetchAllRows(t.buildPage, 1000)).toEqual([]);
    expect(t.calls).toHaveLength(1);
  });

  it("returns every row, in order, across pages", async () => {
    const all = range(2500);
    const t = fakeTable(all);
    const rows = await fetchAllRows(t.buildPage, 1000);
    expect(rows).toEqual(all);
  });

  it("fetches the pages after the first all at once, sized from the first page's count", async () => {
    const t = fakeTable(range(7292)); // a heavy bank feed's 6-month window
    const rows = await fetchAllRows(t.buildPage, 1000);
    expect(rows).toHaveLength(7292);
    // one request for the first page + count, then pages 2–8 together
    expect(t.calls).toHaveLength(8);
    expect(t.maxInFlight()).toBe(7);
    expect(t.calls.slice(1).map((c) => c.from)).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 7000]);
  });

  it("asks for the count on the first page only", async () => {
    const t = fakeTable(range(2500));
    await fetchAllRows(t.buildPage, 1000);
    expect(t.calls.map((c) => c.count)).toEqual(["exact", undefined, undefined]);
  });

  it("confirms the end with one more page when the count is an exact multiple of the page size", async () => {
    const t = fakeTable(range(3000));
    expect(await fetchAllRows(t.buildPage, 1000)).toHaveLength(3000);
    expect(t.calls.map((c) => c.from)).toEqual([0, 1000, 2000, 3000]);
  });

  it("keeps paging while the last page comes back full (rows added after the count)", async () => {
    // The count said 2000, but 2500 rows are there by the time the pages run.
    const t = fakeTable(range(2500), { countOverride: 2000 });
    const rows = await fetchAllRows(t.buildPage, 1000);
    expect(rows).toEqual(range(2500));
    expect(t.calls.map((c) => c.from)).toEqual([0, 1000, 2000]);
  });

  it("throws when a page returns an error, without swallowing it", async () => {
    const buildPage = async () => ({ data: null, error: { message: "boom" }, count: null });
    await expect(fetchAllRows(buildPage, 1000)).rejects.toThrow("boom");
  });

  it("throws when a later page fails, rather than returning a partial set", async () => {
    const buildPage = async (from: number, to: number, count: RowCount) =>
      from === 0
        ? { data: range(to + 1), error: null, count: count === "exact" ? 3000 : null }
        : from === 2000
          ? { data: null, error: { message: "page 3 failed" }, count: null }
          : { data: range(1000), error: null, count: null };
    await expect(fetchAllRows(buildPage, 1000)).rejects.toThrow("page 3 failed");
  });

  it("refuses a full first page that came back without a count, instead of guessing", async () => {
    const buildPage = async (from: number, to: number) => ({ data: range(to - from + 1), error: null, count: null });
    await expect(fetchAllRows(buildPage, 1000)).rejects.toThrow(/count/);
  });

  it("handles a null data page as empty (defensive — Supabase types allow it)", async () => {
    let calls = 0;
    const buildPage = async () => {
      calls++;
      return { data: null, error: null, count: null };
    };
    expect(await fetchAllRows(buildPage, 1000)).toEqual([]);
    expect(calls).toBe(1);
  });
});
