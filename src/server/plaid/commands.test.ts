import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests pin each command's own behaviour against a fake that answers only its own table. The ownership reads and
// the deletion-lock check (src/lib/ownership.ts) have their own tests (src/lib/ownership.test.ts);
// here every reference is the caller's own and nothing is locked.
vi.mock("@/lib/ownership", async (orig) => ({
  ...(await orig<typeof import("@/lib/ownership")>()),
  referencesVisible: async () => ({ ok: true }),
  missingOrLocked: async () => ({ ok: false, error: "missing" }),
}));
import type { SyncRunnerDeps } from "@/lib/plaid/sync-runner";

vi.mock("server-only", () => ({}));

const findItemByPlaidItemId = vi.fn();
const claimMissReason = vi.fn();
const after = vi.fn();
const drainItemInBackground = vi.fn();
let runner: SyncRunnerDeps;

vi.mock("next/server", () => ({ after: (fn: () => unknown) => after(fn) }));
vi.mock("@/lib/db", () => ({ db: () => ({ __db: true }) }));
vi.mock("@/lib/plaid/item-store", () => ({
  findItemByPlaidItemId: (...a: unknown[]) => findItemByPlaidItemId(...a),
  claimMissReason: (...a: unknown[]) => claimMissReason(...a),
}));
vi.mock("./service", () => ({
  syncRunner: () => runner,
  drainItemInBackground: (...a: unknown[]) => drainItemInBackground(...a),
}));

import { mapAccountsFor, setAccountImportingFor, syncConnectionFor } from "./commands";

const USER = "user-a";
const ITEM_ID = "plaid-item-1"; // Plaid's item id
const ITEM_ROW = "11111111-1111-4111-8111-111111111111"; // plaid_items.id
const PA_ROW = "22222222-2222-4222-8222-222222222222"; // plaid_accounts.id

type SyncOutcome = { ok: true; hasMore: boolean } | { ok: false };

/** The real runClaimedSync over a fake lease: `claimed` false = another run holds it. */
function fakeRunner(opts: { claimed?: boolean; outcome?: SyncOutcome; pendingAfter?: boolean } = {}) {
  const claimed = opts.claimed ?? true;
  const outcome = opts.outcome ?? { ok: true, hasMore: false };
  const calls = { claim: [] as unknown[][], release: [] as unknown[][], sync: [] as unknown[] };
  runner = {
    claim: async (itemId, mode) => {
      calls.claim.push([itemId, mode]);
      return claimed ? { item: { itemId, userId: USER } as never, token: "lease-1" } : null;
    },
    release: async (itemId, token, resync) => {
      calls.release.push([itemId, token, resync]);
      return opts.pendingAfter ?? false;
    },
    sync: async (item) => {
      calls.sync.push(item);
      return outcome.ok
        ? { itemId: ITEM_ID, ok: true, inserts: 0, updates: 0, softDeletes: 0, skipped: 0, hasMore: outcome.hasMore, cursor: "c" }
        : { itemId: ITEM_ID, ok: false, error: "x", retry: true };
    },
    now: () => 0,
  };
  return calls;
}

/**
 * A PostgREST-shaped fake: every `from(table)` chain records its calls and resolves to `answer(table, calls)`.
 * Writes are recorded in `writes` so a test can prove nothing was written.
 */
function fakeSupabase(answer: (table: string, calls: unknown[][]) => { data?: unknown; error?: { message: string } | null }) {
  const writes: { table: string; op: string; value: unknown; filters: unknown[][] }[] = [];
  const supabase = {
    from: (table: string) => {
      const calls: unknown[][] = [];
      const q: unknown = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "then") {
              const r = answer(table, calls);
              return (resolve: (v: unknown) => unknown) =>
                Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(resolve);
            }
            return (...args: unknown[]) => {
              calls.push([String(prop), ...args]);
              if (prop === "insert" || prop === "update") writes.push({ table, op: String(prop), value: args[0], filters: calls });
              return q;
            };
          },
        },
      );
      return q;
    },
  };
  return { supabase: supabase as never, writes };
}

beforeEach(() => {
  findItemByPlaidItemId.mockReset();
  claimMissReason.mockReset();
  after.mockReset();
  drainItemInBackground.mockReset();
  findItemByPlaidItemId.mockResolvedValue({ userId: USER, itemId: ITEM_ID });
});

describe("syncConnectionFor", () => {
  const owned = () => fakeSupabase((t) => (t === "plaid_items" ? { data: { item_id: ITEM_ID } } : {})).supabase;

  it("says not found when RLS hides the Item from the caller, and never reaches the sync engine", async () => {
    const calls = fakeRunner();
    const { supabase } = fakeSupabase(() => ({ data: null }));
    expect(await syncConnectionFor(supabase, USER, ITEM_ID)).toEqual({
      ok: false,
      error: "not_found",
      message: "That bank connection no longer exists.",
    });
    expect(findItemByPlaidItemId).not.toHaveBeenCalled();
    expect(calls.claim).toHaveLength(0);
  });

  it("says not found when the owner-level record belongs to someone else (the second ownership check)", async () => {
    const calls = fakeRunner();
    findItemByPlaidItemId.mockResolvedValue({ userId: "someone-else", itemId: ITEM_ID });
    expect(await syncConnectionFor(owned(), USER, ITEM_ID)).toMatchObject({ ok: false, error: "not_found" });
    expect(calls.claim).toHaveLength(0);
  });

  it("syncs the caller's own Item through the lease (a requested claim), then releases it", async () => {
    const calls = fakeRunner();
    expect(await syncConnectionFor(owned(), USER, ITEM_ID)).toEqual({ ok: true });
    expect(calls.claim).toEqual([[ITEM_ID, { kind: "requested" }]]);
    expect(calls.release).toEqual([[ITEM_ID, "lease-1", false]]);
    expect(after).not.toHaveBeenCalled();
  });

  it("keeps draining in the background when pages are left", async () => {
    fakeRunner({ outcome: { ok: true, hasMore: true }, pendingAfter: true });
    expect(await syncConnectionFor(owned(), USER, ITEM_ID)).toEqual({ ok: true });
    expect(after).toHaveBeenCalledTimes(1);
    after.mock.calls[0]![0]();
    expect(drainItemInBackground).toHaveBeenCalledWith(ITEM_ID);
  });

  it("reports ok with a warning, not a failure, when the sync itself doesn't finish", async () => {
    fakeRunner({ outcome: { ok: false } });
    expect(await syncConnectionFor(owned(), USER, ITEM_ID)).toEqual({
      ok: true,
      warning: "Connected, but the first sync didn't finish. It'll retry shortly.",
    });
  });

  it("says why the sync did not start when another run holds the lease", async () => {
    fakeRunner({ claimed: false });
    claimMissReason.mockResolvedValue({ kind: "busy", retryAfterSeconds: 120 });
    const r = await syncConnectionFor(owned(), USER, ITEM_ID);
    expect(r).toMatchObject({ ok: true, warning: expect.stringContaining("already running") });
  });
});

describe("mapAccountsFor", () => {
  const withItem = (over: { createAccountError?: boolean; linkError?: boolean } = {}) =>
    fakeSupabase((t, calls) => {
      if (t === "plaid_items") return { data: { item_id: ITEM_ID } };
      if (t === "accounts") return over.createAccountError ? { error: { message: "boom" } } : { data: { id: "new-account-1" } };
      if (t === "plaid_accounts") return over.linkError ? { error: { message: "boom" } } : {};
      throw new Error(`unexpected ${t} ${JSON.stringify(calls)}`);
    });

  it("says not found without writing anything when the Item isn't the caller's", async () => {
    const calls = fakeRunner();
    const { supabase, writes } = fakeSupabase(() => ({ data: null }));
    const r = await mapAccountsFor(supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "new", name: "Checking", type: "checking" }]);
    expect(r).toEqual({ ok: false, error: "not_found", message: "That bank connection no longer exists. Try connecting again." });
    expect(writes).toEqual([]);
    expect(calls.claim).toHaveLength(0);
  });

  it("creates a Budgts account for a 'new' entry and links it", async () => {
    fakeRunner();
    const { supabase, writes } = withItem();
    const r = await mapAccountsFor(supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "new", name: "Checking", type: "checking" }]);
    expect(r).toEqual({ ok: true });
    expect(writes.map((w) => [w.table, w.op, w.value])).toEqual([
      ["accounts", "insert", { user_id: USER, name: "Checking", type: "checking", source: "plaid" }],
      ["plaid_accounts", "update", { account_id: "new-account-1", link_state: "mapped" }],
    ]);
    // scoped to this Item's row and this Plaid account
    expect(writes[1]!.filters).toEqual(expect.arrayContaining([["eq", "plaid_item_id", ITEM_ROW], ["eq", "plaid_account_id", "pa1"]]));
  });

  it("points an 'existing' entry at the given account without creating one", async () => {
    fakeRunner();
    const { supabase, writes } = withItem();
    await mapAccountsFor(supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "existing", existingAccountId: "acct-9" }]);
    expect(writes.map((w) => [w.table, w.value])).toEqual([["plaid_accounts", { account_id: "acct-9", link_state: "mapped" }]]);
  });

  it("leaves an 'ignore' entry unimported", async () => {
    fakeRunner();
    const { supabase, writes } = withItem();
    await mapAccountsFor(supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "ignore" }]);
    expect(writes.map((w) => w.value)).toEqual([{ account_id: null, link_state: "ignored" }]);
  });

  it("runs the first sync after mapping, and warns (still ok) when it doesn't finish", async () => {
    const calls = fakeRunner({ outcome: { ok: false } });
    const r = await mapAccountsFor(withItem().supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "ignore" }]);
    expect(r).toEqual({ ok: true, warning: "Accounts saved. The first sync didn't finish — it'll retry shortly." });
    expect(calls.claim).toEqual([[ITEM_ID, { kind: "requested" }]]);
  });

  it("says why the first sync did not start, after saving the mapping", async () => {
    fakeRunner({ claimed: false });
    claimMissReason.mockResolvedValue({ kind: "unmapped" });
    const r = await mapAccountsFor(withItem().supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "ignore" }]);
    expect(r).toEqual({ ok: true, warning: "Accounts saved. Choose where this bank's new accounts go first — then it will sync." });
  });

  it("saves the mapping but never syncs when the owner-level record belongs to someone else", async () => {
    const calls = fakeRunner();
    findItemByPlaidItemId.mockResolvedValue({ userId: "someone-else", itemId: ITEM_ID });
    expect(await mapAccountsFor(withItem().supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "ignore" }])).toEqual({ ok: true });
    expect(calls.claim).toHaveLength(0);
  });

  it("reports a database failure creating the account", async () => {
    fakeRunner();
    const r = await mapAccountsFor(withItem({ createAccountError: true }).supabase, USER, ITEM_ROW, [
      { plaidAccountId: "pa1", mode: "new", name: "Checking", type: "checking" },
    ]);
    expect(r).toEqual({ ok: false, error: "failed", message: "Could not create the account. Try again." });
  });

  it("reports a database failure saving the link", async () => {
    fakeRunner();
    const r = await mapAccountsFor(withItem({ linkError: true }).supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "ignore" }]);
    expect(r).toEqual({ ok: false, error: "failed", message: "Could not save the account mapping. Try again." });
  });
});

describe("setAccountImportingFor", () => {
  const withRow = (row: { account_id: string | null; plaid_item_id: string } | null, updateError = false) =>
    fakeSupabase((t, calls) => {
      if (t === "plaid_accounts") {
        if (calls.some((c) => c[0] === "update")) return updateError ? { error: { message: "boom" } } : {};
        return { data: row };
      }
      if (t === "plaid_items") return { data: { item_id: ITEM_ID } };
      throw new Error(`unexpected ${t}`);
    });

  it("says not found when the account isn't the caller's", async () => {
    const { supabase, writes } = withRow(null);
    expect(await setAccountImportingFor(supabase, USER, PA_ROW, true)).toEqual({
      ok: false,
      error: "not_found",
      message: "That account no longer exists.",
    });
    expect(writes).toEqual([]);
  });

  it("refuses to turn importing on for an account that was never mapped (it needs a Budgts account)", async () => {
    const { supabase, writes } = withRow({ account_id: null, plaid_item_id: ITEM_ROW });
    expect(await setAccountImportingFor(supabase, USER, PA_ROW, true)).toEqual({
      ok: false,
      error: "invalid",
      message: "Choose which Budgts account to import into first.",
    });
    expect(writes).toEqual([]);
  });

  it("turning off keeps the mapped account (only link_state changes) and does not sync", async () => {
    const calls = fakeRunner();
    const { supabase, writes } = withRow({ account_id: "acct-1", plaid_item_id: ITEM_ROW });
    expect(await setAccountImportingFor(supabase, USER, PA_ROW, false)).toEqual({ ok: true });
    expect(writes.map((w) => w.value)).toEqual([{ link_state: "ignored" }]);
    expect(calls.claim).toHaveLength(0);
  });

  it("turning back on resumes the same account and syncs from now on", async () => {
    const calls = fakeRunner();
    const { supabase, writes } = withRow({ account_id: "acct-1", plaid_item_id: ITEM_ROW });
    expect(await setAccountImportingFor(supabase, USER, PA_ROW, true)).toEqual({ ok: true });
    expect(writes.map((w) => w.value)).toEqual([{ link_state: "mapped" }]);
    expect(calls.claim).toEqual([[ITEM_ID, { kind: "requested" }]]);
  });

  it("warns (still ok) when the resumed sync doesn't finish", async () => {
    fakeRunner({ outcome: { ok: false } });
    expect(await setAccountImportingFor(withRow({ account_id: "acct-1", plaid_item_id: ITEM_ROW }).supabase, USER, PA_ROW, true)).toEqual({
      ok: true,
      warning: "Importing resumed. The first sync didn't finish — it'll retry shortly.",
    });
  });

  it("reports a failed update", async () => {
    fakeRunner();
    expect(await setAccountImportingFor(withRow({ account_id: "acct-1", plaid_item_id: ITEM_ROW }, true).supabase, USER, PA_ROW, false)).toEqual({
      ok: false,
      error: "failed",
      message: "Could not update the import setting. Try again.",
    });
  });
});
