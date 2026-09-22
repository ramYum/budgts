import { beforeEach, describe, expect, it, vi } from "vitest";

const findItemByPlaidItemId = vi.fn();
const syncItem = vi.fn();
vi.mock("@/lib/plaid/item-store", () => ({ findItemByPlaidItemId: (...a: unknown[]) => findItemByPlaidItemId(...a) }));
vi.mock("@/server/plaid/service", () => ({ plaidDb: {}, syncItem: (...a: unknown[]) => syncItem(...a) }));

import { syncPlaidItemForUser } from "./sync-commands";

const USER = "user-a";
const ITEM_ID = "plaid-item-1";

function fakeSupabase(owned: { item_id: string } | null) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: owned, error: null }) }) }) }),
  } as never;
}

beforeEach(() => {
  findItemByPlaidItemId.mockReset();
  syncItem.mockReset();
});

describe("syncPlaidItemForUser", () => {
  it("says item_not_found when the item isn't visible to the caller (RLS)", async () => {
    const r = await syncPlaidItemForUser(fakeSupabase(null), USER, ITEM_ID);
    expect(r).toEqual({ outcome: "item_not_found" });
    expect(syncItem).not.toHaveBeenCalled();
  });

  it("says item_not_found when the record's owner doesn't match (defense in depth beyond RLS)", async () => {
    findItemByPlaidItemId.mockResolvedValue({ userId: "someone-else", itemId: ITEM_ID });
    const r = await syncPlaidItemForUser(fakeSupabase({ item_id: ITEM_ID }), USER, ITEM_ID);
    expect(r).toEqual({ outcome: "item_not_found" });
    expect(syncItem).not.toHaveBeenCalled();
  });

  it("syncs the caller's own item", async () => {
    findItemByPlaidItemId.mockResolvedValue({ userId: USER, itemId: ITEM_ID });
    syncItem.mockResolvedValue({ ok: true });
    expect(await syncPlaidItemForUser(fakeSupabase({ item_id: ITEM_ID }), USER, ITEM_ID)).toEqual({ outcome: "ok" });
  });

  it("reports ok with a warning, not a failure, when the sync itself doesn't finish", async () => {
    findItemByPlaidItemId.mockResolvedValue({ userId: USER, itemId: ITEM_ID });
    syncItem.mockResolvedValue({ ok: false });
    const r = await syncPlaidItemForUser(fakeSupabase({ item_id: ITEM_ID }), USER, ITEM_ID);
    expect(r).toEqual({ outcome: "ok", warning: "Connected, but the first sync didn't finish. It'll retry shortly." });
  });
});
