import { beforeEach, describe, expect, it, vi } from "vitest";
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
              if (prop === "insert" || prop === "update" || prop === "delete") writes.push({ table, op: String(prop), value: args[0], filters: calls });
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
      if (t === "plaid_accounts") {
        if (calls[0]?.[0] === "select") return { data: [{ plaid_account_id: "pa0", account_id: null }, { plaid_account_id: "pa1", account_id: null }] };
        return over.linkError ? { error: { message: "boom" } } : { data: [{ id: PA_ROW }] };
      }
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

  it("refuses an 'existing' entry pointing at an account the caller can't see (another user's), writing nothing", async () => {
    const calls = fakeRunner();
    const { supabase, writes } = fakeSupabase((t) => {
      if (t === "plaid_items") return { data: { item_id: ITEM_ID } };
      if (t === "accounts") return { data: null }; // RLS hides it
      return {};
    });
    const r = await mapAccountsFor(supabase, USER, ITEM_ROW, [
      { plaidAccountId: "pa0", mode: "new", name: "Checking", type: "checking" },
      { plaidAccountId: "pa1", mode: "existing", existingAccountId: "someone-elses" },
    ]);
    expect(r).toEqual({ ok: false, error: "invalid", message: "That account is no longer available. Refresh and choose again." });
    expect(writes).toEqual([]);
    expect(calls.claim).toHaveLength(0);
  });

  it("refuses an 'existing' entry pointing at an archived account", async () => {
    fakeRunner();
    const { supabase, writes } = fakeSupabase((t) => {
      if (t === "plaid_items") return { data: { item_id: ITEM_ID } };
      if (t === "accounts") return { data: { id: "acct-9", is_archived: true } };
      return {};
    });
    const r = await mapAccountsFor(supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "existing", existingAccountId: "acct-9" }]);
    expect(r).toMatchObject({ ok: false, error: "invalid" });
    expect(writes).toEqual([]);
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

describe("mapAccountsFor is idempotent and never splits an account's history", () => {
  const NEW = { plaidAccountId: "pa1", mode: "new" as const, name: "Checking", type: "checking" as const };
  type Link = { account_id: string | null; link_state: "mapped" | "ignored" | "unmapped" };
  const ALREADY_IMPORTED = { ok: false, error: "invalid", message: "That account is already imported. Refresh to see where it goes." };
  const PAUSED = { ok: false, error: "invalid", message: "That account is paused. Turn it back on from Connected banks." };

  /**
   * plaid_accounts answers by operation: the pre-read (`in`) sees `link`; a guarded update matches `updated` rows; the
   * loser's re-read (`maybeSingle`) sees `reread` (the winner's link). accounts: `open` says which ids are open.
   */
  function world(opts: { link: Link | null; reread?: Link | null; open?: Record<string, boolean>; updated?: number; deleteError?: boolean }) {
    return fakeSupabase((t, calls) => {
      const op = calls[0]?.[0];
      if (t === "plaid_items") return { data: { item_id: ITEM_ID } };
      if (t === "plaid_accounts") {
        if (op === "select" && calls.some((c) => c[0] === "maybeSingle")) {
          const r = opts.reread === undefined ? opts.link : opts.reread;
          return { data: r ? { plaid_account_id: "pa1", ...r } : null };
        }
        if (op === "select") return { data: opts.link ? [{ plaid_account_id: "pa1", ...opts.link }] : [] };
        return { data: Array.from({ length: opts.updated ?? 1 }, () => ({ id: PA_ROW })) };
      }
      if (t === "accounts") {
        if (op === "insert") return { data: { id: "new-account-1" } };
        if (op === "delete") return opts.deleteError ? { error: { message: "boom" } } : {};
        const id = calls.find((c) => c[0] === "eq" && c[1] === "id")?.[2] as string;
        const open = opts.open?.[id];
        return { data: open === undefined ? null : { id, name: "Everyday", source: "plaid", is_archived: !open } };
      }
      throw new Error(`unexpected ${t}`);
    });
  }

  it("a repeated 'new' for an account already imported creates nothing and repoints nothing, but still runs the sync", async () => {
    const calls = fakeRunner();
    const { supabase, writes } = world({ link: { account_id: "acct-1", link_state: "mapped" }, open: { "acct-1": true } });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [NEW])).toEqual({ ok: true });
    expect(writes).toEqual([]);
    expect(calls.claim).toEqual([[ITEM_ID, { kind: "requested" }]]);
  });

  it("a repeated 'existing' to the same account is a no-op", async () => {
    fakeRunner();
    const { supabase, writes } = world({ link: { account_id: "acct-1", link_state: "mapped" }, open: { "acct-1": true } });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "existing", existingAccountId: "acct-1" }])).toEqual({ ok: true });
    expect(writes).toEqual([]);
  });

  it.each([
    ["point it at a different account", { plaidAccountId: "pa1", mode: "existing" as const, existingAccountId: "acct-2" }],
    ["unmap it", { plaidAccountId: "pa1", mode: "ignore" as const }],
  ])("refuses to %s while it imports into an open account, writing nothing", async (_n, entry) => {
    const calls = fakeRunner();
    const { supabase, writes } = world({ link: { account_id: "acct-1", link_state: "mapped" }, open: { "acct-1": true, "acct-2": true } });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [entry])).toEqual(ALREADY_IMPORTED);
    expect(writes).toEqual([]);
    expect(calls.claim).toHaveLength(0);
  });

  it("an 'ignore' for a paused account (already ignored) is a no-op that keeps its account", async () => {
    const calls = fakeRunner();
    const { supabase, writes } = world({ link: { account_id: "acct-1", link_state: "ignored" }, open: { "acct-1": true } });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "ignore" }])).toEqual({ ok: true });
    expect(writes).toEqual([]);
    expect(calls.claim).toHaveLength(1);
  });

  it("an 'ignore' for an account already set not to import is a no-op", async () => {
    fakeRunner();
    const { supabase, writes } = world({ link: { account_id: null, link_state: "ignored" } });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "ignore" }])).toEqual({ ok: true });
    expect(writes).toEqual([]);
  });

  it.each([
    ["'new'", NEW],
    ["'existing' to another account", { plaidAccountId: "pa1", mode: "existing" as const, existingAccountId: "acct-2" }],
  ])("refuses %s for a paused account with the paused wording, writing nothing", async (_n, entry) => {
    fakeRunner();
    const { supabase, writes } = world({ link: { account_id: "acct-1", link_state: "ignored" }, open: { "acct-1": true, "acct-2": true } });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [entry])).toEqual(PAUSED);
    expect(writes).toEqual([]);
  });

  it("links an unmapped account only while it is still unmapped (the write is guarded on account_id is null)", async () => {
    fakeRunner();
    const { supabase, writes } = world({ link: { account_id: null, link_state: "unmapped" } });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [NEW])).toEqual({ ok: true });
    const link = writes.find((w) => w.table === "plaid_accounts")!;
    expect(link.value).toEqual({ account_id: "new-account-1", link_state: "mapped" });
    expect(link.filters).toEqual(expect.arrayContaining([["is", "account_id", null]]));
  });

  it("a 'new' that loses the race to another 'new' removes the account it created (scoped to the caller) and succeeds", async () => {
    fakeRunner();
    const { supabase, writes } = world({
      link: { account_id: null, link_state: "unmapped" },
      reread: { account_id: "winner-acct", link_state: "mapped" },
      open: { "winner-acct": true },
      updated: 0,
    });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [NEW])).toEqual({ ok: true });
    const del = writes.find((w) => w.table === "accounts" && w.op === "delete");
    expect(del?.filters).toEqual(expect.arrayContaining([["eq", "id", "new-account-1"], ["eq", "user_id", USER]]));
  });

  it("a 'new' that loses the race to an 'ignore' removes the account it created and is refused, not reported ok", async () => {
    fakeRunner();
    const { supabase, writes } = world({
      link: { account_id: null, link_state: "unmapped" },
      reread: { account_id: null, link_state: "ignored" },
      updated: 0,
    });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [NEW])).toEqual({
      ok: false,
      error: "invalid",
      message: "That account was set not to import. Refresh and choose again.",
    });
    expect(writes.filter((w) => w.table === "accounts" && w.op === "delete")).toHaveLength(1);
  });

  it("an 'existing' that loses the race to a different account is refused", async () => {
    fakeRunner();
    const { supabase, writes } = world({
      link: { account_id: null, link_state: "unmapped" },
      reread: { account_id: "acct-1", link_state: "mapped" },
      open: { "acct-1": true, "acct-2": true },
      updated: 0,
    });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "existing", existingAccountId: "acct-2" }])).toEqual(
      ALREADY_IMPORTED,
    );
    expect(writes.filter((w) => w.table === "accounts")).toEqual([]);
  });

  it("an 'existing' that loses the race to the same account succeeds", async () => {
    fakeRunner();
    const { supabase } = world({
      link: { account_id: null, link_state: "unmapped" },
      reread: { account_id: "acct-2", link_state: "mapped" },
      open: { "acct-2": true },
      updated: 0,
    });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [{ plaidAccountId: "pa1", mode: "existing", existingAccountId: "acct-2" }])).toEqual({ ok: true });
  });

  it("an 'ignore' that loses the race to another 'ignore' succeeds, and to a 'new' is refused", async () => {
    fakeRunner();
    const lostTo = (reread: Link) =>
      world({ link: { account_id: null, link_state: "unmapped" }, reread, open: { "acct-1": true }, updated: 0 }).supabase;
    const ignore = [{ plaidAccountId: "pa1", mode: "ignore" as const }];
    expect(await mapAccountsFor(lostTo({ account_id: null, link_state: "ignored" }), USER, ITEM_ROW, ignore)).toEqual({ ok: true });
    expect(await mapAccountsFor(lostTo({ account_id: "acct-1", link_state: "mapped" }), USER, ITEM_ROW, ignore)).toEqual(ALREADY_IMPORTED);
  });

  it("logs a failed delete of the loser's account with ids only, and still answers", async () => {
    fakeRunner();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { supabase } = world({
        link: { account_id: null, link_state: "unmapped" },
        reread: { account_id: "winner-acct", link_state: "mapped" },
        open: { "winner-acct": true },
        updated: 0,
        deleteError: true,
      });
      expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [NEW])).toEqual({ ok: true });
      expect(log).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(log.mock.calls[0]);
      expect(logged).toContain("new-account-1");
      expect(logged).not.toContain("Checking"); // the account's name never reaches the log
    } finally {
      log.mockRestore();
    }
  });

  it("the same account twice in one request is imported once", async () => {
    fakeRunner();
    let linked: string | null = null;
    const { supabase, writes } = fakeSupabase((t, calls) => {
      const op = calls[0]?.[0];
      if (t === "plaid_items") return { data: { item_id: ITEM_ID } };
      if (t === "plaid_accounts") {
        if (op === "select" && calls.some((c) => c[0] === "maybeSingle")) return { data: { plaid_account_id: "pa1", account_id: linked, link_state: "mapped" } };
        if (op === "select") return { data: [{ plaid_account_id: "pa1", account_id: null, link_state: "unmapped" }] };
        const won = linked === null;
        if (won) linked = (calls.find((c) => c[0] === "update")![1] as { account_id: string }).account_id;
        return { data: won ? [{ id: PA_ROW }] : [] };
      }
      if (t === "accounts") {
        if (op === "insert") return { data: { id: `new-${writes.length}` } };
        if (op === "select") return { data: { id: linked, name: "Checking", source: "plaid", is_archived: false } };
        return {};
      }
      throw new Error(`unexpected ${t}`);
    });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [NEW, NEW])).toEqual({ ok: true });
    const inserts = writes.filter((w) => w.table === "accounts" && w.op === "insert").length;
    const deletes = writes.filter((w) => w.table === "accounts" && w.op === "delete").length;
    expect(inserts - deletes).toBe(1);
  });

  it("a paused account whose Budgts account was archived can be imported again (the connect switch), guarded on its old account", async () => {
    fakeRunner();
    const { supabase, writes } = world({ link: { account_id: "acct-old", link_state: "ignored" }, open: { "acct-old": false } });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [NEW])).toEqual({ ok: true });
    const link = writes.find((w) => w.table === "plaid_accounts")!;
    expect(link.value).toEqual({ account_id: "new-account-1", link_state: "mapped" });
    expect(link.filters).toEqual(expect.arrayContaining([["eq", "account_id", "acct-old"]]));
  });

  it("says not found when the Plaid account isn't on this bank", async () => {
    fakeRunner();
    const { supabase, writes } = world({ link: null });
    expect(await mapAccountsFor(supabase, USER, ITEM_ROW, [NEW])).toEqual({
      ok: false,
      error: "not_found",
      message: "That bank account no longer exists. Try connecting again.",
    });
    expect(writes).toEqual([]);
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
