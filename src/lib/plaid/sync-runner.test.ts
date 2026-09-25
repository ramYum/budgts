import { describe, expect, it, vi } from "vitest";
import type { ClaimMode, PlaidItemRecord, SyncClaim } from "./item-store";
import type { SyncItemResult } from "./sync-item";
import { drainItem, runClaimedSync, sweepItems, type SyncRunnerDeps } from "./sync-runner";

const item = (itemId: string): PlaidItemRecord => ({
  id: `row-${itemId}`,
  userId: "u1",
  itemId,
  institutionId: null,
  accessTokenEnc: "enc",
  transactionsCursor: null,
  status: "active",
  lastSyncedAt: null,
});

const ok = (itemId: string, hasMore = false): SyncItemResult => ({
  itemId,
  ok: true,
  inserts: 1,
  updates: 0,
  softDeletes: 0,
  skipped: 0,
  hasMore,
  cursor: "c",
});
const fail = (itemId: string): SyncItemResult => ({ itemId, ok: false, error: "API_ERROR", retry: true });

/** A fake lease: one holder at a time, release reports the queued flag. */
function fakeDeps(opts: {
  results: SyncItemResult[] | ((itemId: string) => SyncItemResult);
  /** needs_sync value each successive release reports. Default false. */
  pendingAfter?: boolean[];
  claimable?: (itemId: string, mode: ClaimMode) => boolean;
  clock?: number[];
}): SyncRunnerDeps & {
  claim: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  sync: ReturnType<typeof vi.fn>;
} {
  const results = opts.results;
  let r = 0;
  let p = 0;
  let t = 0;
  return {
    claim: vi.fn(async (itemId: string, mode: ClaimMode): Promise<SyncClaim | null> =>
      opts.claimable && !opts.claimable(itemId, mode) ? null : { item: item(itemId), token: `tok-${itemId}` },
    ),
    release: vi.fn(async (_itemId: string, _token: string, resync: boolean) => resync || (opts.pendingAfter?.[p++] ?? false)),
    sync: vi.fn(async (i: PlaidItemRecord) => (typeof results === "function" ? results(i.itemId) : results[r++])),
    now: () => (opts.clock ? opts.clock[Math.min(t++, opts.clock.length - 1)] : 0),
  };
}

describe("runClaimedSync", () => {
  it("does nothing when the claim is not granted (another run holds the lease)", async () => {
    const deps = fakeDeps({ results: [], claimable: () => false });
    expect(await runClaimedSync(deps, "A", { kind: "requested" })).toEqual({ claimed: false });
    expect(deps.sync).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();
  });

  it("syncs the claimed row, then releases with resync=false on a complete success", async () => {
    const deps = fakeDeps({ results: [ok("A")] });
    const out = await runClaimedSync(deps, "A", { kind: "requested" });
    expect(out).toEqual({ claimed: true, result: ok("A"), morePending: false });
    expect(deps.release).toHaveBeenCalledWith("A", "tok-A", false);
  });

  it("releases with resync=true when the sync failed, so the sweep retries it", async () => {
    const deps = fakeDeps({ results: [fail("A")] });
    const out = await runClaimedSync(deps, "A", { kind: "due" });
    expect(deps.release).toHaveBeenCalledWith("A", "tok-A", true);
    expect(out).toMatchObject({ claimed: true, morePending: true });
  });

  it("releases with resync=true when pages are left (page cap hit)", async () => {
    const deps = fakeDeps({ results: [ok("A", true)] });
    await runClaimedSync(deps, "A", { kind: "due" });
    expect(deps.release).toHaveBeenCalledWith("A", "tok-A", true);
  });

  it("releases (resync=true) and rethrows when the sync itself throws", async () => {
    const deps = fakeDeps({ results: () => { throw new Error("db down"); } });
    await expect(runClaimedSync(deps, "A", { kind: "due" })).rejects.toThrow("db down");
    expect(deps.release).toHaveBeenCalledWith("A", "tok-A", true);
  });
});

describe("drainItem", () => {
  it("keeps going while the release reports more work (webhook during the run), switching to needs_sync-only claims", async () => {
    const deps = fakeDeps({ results: [ok("A"), ok("A")], pendingAfter: [true, false] });
    const results = await drainItem(deps, "A", { kind: "requested" }, 1000);
    expect(results).toHaveLength(2);
    expect(deps.claim.mock.calls.map((c) => c[1])).toEqual([{ kind: "requested" }, { kind: "due" }]);
  });

  it("continues a capped pagination until has_more clears", async () => {
    const deps = fakeDeps({ results: [ok("A", true), ok("A", true), ok("A")] });
    expect(await drainItem(deps, "A", { kind: "due" }, 1000)).toHaveLength(3);
  });

  it("stops after a failure instead of hammering (the sweep retries later)", async () => {
    const deps = fakeDeps({ results: [fail("A"), ok("A")] });
    expect(await drainItem(deps, "A", { kind: "due" }, 1000)).toEqual([fail("A")]);
  });

  it("does not start another round past the deadline", async () => {
    const deps = fakeDeps({ results: [ok("A", true), ok("A")], clock: [5000] });
    expect(await drainItem(deps, "A", { kind: "due" }, 1000)).toHaveLength(1);
  });

  it("returns nothing when the item cannot be claimed", async () => {
    const deps = fakeDeps({ results: [], claimable: () => false });
    expect(await drainItem(deps, "A", { kind: "due" }, 1000)).toEqual([]);
  });
});

describe("sweepItems", () => {
  it("drains each candidate with a due+stale claim and skips ones another run holds", async () => {
    const staleBefore = new Date(0);
    const deps = fakeDeps({ results: (id) => ok(id), claimable: (id) => id !== "B" });
    const results = await sweepItems(deps, ["A", "B", "C"], staleBefore, 1000);
    expect(results.map((r) => r.itemId)).toEqual(["A", "C"]);
    expect(deps.claim).toHaveBeenCalledWith("A", { kind: "due", staleBefore });
  });

  it("stops claiming new items once the time budget is spent", async () => {
    const deps = fakeDeps({ results: (id) => ok(id), clock: [0, 2000] });
    const results = await sweepItems(deps, ["A", "B", "C"], new Date(0), 1000);
    expect(results.map((r) => r.itemId)).toEqual(["A"]);
  });
});
