import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, has } from "../../../tests/unit/helpers/fake-supabase";
import { loadCategorySettings } from "./load-category-settings";

const CATS = [
  { id: "c1", name: "Food", kind: "expense", color: "#0a0", is_archived: false },
  { id: "c2", name: "Old", kind: "expense", color: "#aaa", is_archived: true },
];
const TXNS = [{ category_id: "c1" }, { category_id: "c1" }, { category_id: "c2" }];

afterEach(() => vi.useRealTimers());

describe("loadCategorySettings", () => {
  it("lists every category with this month's (in the user's zone) transaction count", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-30T23:30:00Z"), toFake: ["Date"] });
    const { supabase, log } = fakeSupabase((table) =>
      table === "categories" ? { data: CATS, count: CATS.length } : { data: TXNS, count: TXNS.length },
    );
    const data = await loadCategorySettings(supabase, { timeZone: "Asia/Tokyo", plaidEnabled: true });
    expect(data.month).toBe("2026-10");
    expect(data.items).toEqual([
      { ...CATS[0], txnCount: 2 },
      { ...CATS[1], txnCount: 1 },
    ]);
    const txnCalls = log.find((l) => l.table === "transactions")!.calls;
    expect(has(txnCalls, "gte", "occurred_at", "2026-10-01T00:00:00.000Z")).toBe(true);
    expect(has(txnCalls, "is", "removed_at", null)).toBe(true);
    expect(has(txnCalls, "is", "duplicate_of_id", null)).toBe(true);
  });

  it("throws on a failed read", async () => {
    const { supabase } = fakeSupabase(() => ({ error: { message: "x" } }));
    await expect(loadCategorySettings(supabase, { timeZone: "UTC", plaidEnabled: false })).rejects.toThrow();
  });
});
