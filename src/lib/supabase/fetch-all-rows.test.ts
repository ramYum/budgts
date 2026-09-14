import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./fetch-all-rows";

function fakePages<T>(pages: T[][]) {
  const calls: Array<{ from: number; to: number }> = [];
  const buildPage = async (from: number, to: number) => {
    calls.push({ from, to });
    const pageIndex = Math.floor(from / (to - from + 1));
    return { data: pages[pageIndex] ?? [], error: null };
  };
  return { buildPage, calls };
}

describe("fetchAllRows", () => {
  it("returns everything from a single short page", async () => {
    const { buildPage } = fakePages([[1, 2, 3]]);
    const rows = await fetchAllRows(buildPage, 5);
    expect(rows).toEqual([1, 2, 3]);
  });

  it("keeps paging while a page comes back exactly full", async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => i);
    const page2 = Array.from({ length: 3 }, (_, i) => i + 100);
    const page3 = [999];
    const { buildPage, calls } = fakePages([page1, page2, page3]);
    const rows = await fetchAllRows(buildPage, 3);
    expect(rows).toEqual([0, 1, 2, 100, 101, 102, 999]);
    expect(calls).toEqual([
      { from: 0, to: 2 },
      { from: 3, to: 5 },
      { from: 6, to: 8 },
    ]);
  });

  it("stops exactly when a page comes back empty", async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => i);
    const { buildPage, calls } = fakePages([page1, []]);
    const rows = await fetchAllRows(buildPage, 3);
    expect(rows).toEqual([0, 1, 2]);
    expect(calls).toHaveLength(2);
  });

  it("returns an empty array when there are no rows at all", async () => {
    const { buildPage } = fakePages([[]]);
    const rows = await fetchAllRows(buildPage, 1000);
    expect(rows).toEqual([]);
  });

  it("throws when a page returns an error, without swallowing it", async () => {
    const buildPage = async () => ({ data: null, error: { message: "boom" } });
    await expect(fetchAllRows(buildPage, 1000)).rejects.toThrow("boom");
  });

  it("handles a null data page as empty (defensive — Supabase types allow it)", async () => {
    let calls = 0;
    const buildPage = async () => {
      calls++;
      return { data: null, error: null };
    };
    const rows = await fetchAllRows(buildPage, 1000);
    expect(rows).toEqual([]);
    expect(calls).toBe(1);
  });

  it("fetches a realistic multi-thousand-row dataset in the right number of pages", async () => {
    const total = 2500;
    const all = Array.from({ length: total }, (_, i) => i);
    const pages = [all.slice(0, 1000), all.slice(1000, 2000), all.slice(2000, 2500)];
    const { buildPage, calls } = fakePages(pages);
    const rows = await fetchAllRows(buildPage, 1000);
    expect(rows).toHaveLength(total);
    expect(rows[0]).toBe(0);
    expect(rows[total - 1]).toBe(total - 1);
    expect(calls).toHaveLength(3);
  });
});
