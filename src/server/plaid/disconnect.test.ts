import { beforeEach, describe, expect, it, vi } from "vitest";

const itemRemove = vi.fn();
const decryptToken = vi.fn();

vi.mock("@/lib/plaid/client", () => ({ plaidClient: () => ({ itemRemove }) }));
vi.mock("@/lib/plaid/config", () => ({ loadPlaidConfig: () => ({ tokenEncKey: Buffer.alloc(32) }) }));
vi.mock("@/lib/plaid/crypto", () => ({ decryptToken: (...a: unknown[]) => decryptToken(...a) }));

import { disconnectPlaidItem } from "./disconnect";

const PLAIN_TOKEN = "access-production-PLAIN-TOKEN-should-never-be-logged";
const CIPHERTEXT = "CIPHERTEXT-should-never-be-logged";

const plaidErr = (type: string, code: string) => ({ response: { status: 400, data: { error_type: type, error_code: code } } });

/** A Supabase stand-in that records every DELETE, so a test can prove what was (not) destroyed. */
function fakeSupabase(opts: { item?: { id: string; access_token_enc: string } | null; deleteFails?: boolean } = {}) {
  const item = opts.item === undefined ? { id: "row-1", access_token_enc: CIPHERTEXT } : opts.item;
  const deletes: string[] = [];
  const client = {
    from(table: string) {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: item, error: null }) }) }),
        delete: () => ({
          eq: async () => {
            deletes.push(table);
            return { error: opts.deleteFails ? { message: "db exploded" } : null };
          },
        }),
      };
    },
  };
  return { client: client as never, deletes };
}

const call = (client: never, strict?: boolean) =>
  disconnectPlaidItem(client, { userId: "u1", itemId: "item-1", ...(strict === undefined ? {} : { strict }) });

let logged: unknown[][] = [];
beforeEach(() => {
  itemRemove.mockReset();
  decryptToken.mockReset();
  decryptToken.mockReturnValue(PLAIN_TOKEN);
  logged = [];
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args));
  }
});

describe("disconnectPlaidItem — strict removal (account deletion)", () => {
  it("removes the Item at Plaid with the DECRYPTED token, then deletes the local row", async () => {
    itemRemove.mockResolvedValue({ data: {} });
    const { client, deletes } = fakeSupabase();

    const result = await call(client, true);

    expect(result).toEqual({ ok: true, purged: false });
    expect(decryptToken).toHaveBeenCalledWith(CIPHERTEXT, expect.any(Buffer));
    expect(itemRemove).toHaveBeenCalledWith({ access_token: PLAIN_TOKEN });
    expect(deletes).toEqual(["plaid_items"]);
  });

  it("treats 'already removed at Plaid' (ITEM_NOT_FOUND) as idempotent success and still clears the local row", async () => {
    itemRemove.mockRejectedValue(plaidErr("ITEM_ERROR", "ITEM_NOT_FOUND"));
    const { client, deletes } = fakeSupabase();

    const result = await call(client, true);

    expect(result).toEqual({ ok: true, purged: false });
    expect(deletes).toEqual(["plaid_items"]);
  });

  it.each([
    ["an unusable token (also what a misconfigured PLAID_ENV looks like)", plaidErr("INVALID_INPUT", "INVALID_ACCESS_TOKEN")],
    ["a Plaid rate limit", plaidErr("RATE_LIMIT_EXCEEDED", "RATE_LIMIT_EXCEEDED")],
    ["a Plaid 5xx", plaidErr("API_ERROR", "INTERNAL_SERVER_ERROR")],
    ["planned maintenance", plaidErr("API_ERROR", "PLANNED_MAINTENANCE")],
    ["a transport failure (Plaid unreachable, no response at all)", Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })],
    ["an unrecognised thrown value", "boom"],
  ])("STOPS on %s: the local row — the retry handle — is preserved and the failure is reported", async (_label, failure) => {
    itemRemove.mockRejectedValue(failure);
    const { client, deletes } = fakeSupabase();

    const result = await call(client, true);

    expect(result.ok).toBe(false);
    expect(deletes).toEqual([]); // nothing destroyed: the encrypted token is still there to retry with
  });

  it("STOPS when the stored token cannot be decrypted, without calling Plaid or deleting anything", async () => {
    decryptToken.mockImplementation(() => {
      throw new Error("Unsupported state or unable to authenticate data");
    });
    const { client, deletes } = fakeSupabase();

    const result = await call(client, true);

    expect(result.ok).toBe(false);
    expect(itemRemove).not.toHaveBeenCalled();
    expect(deletes).toEqual([]);
  });

  it("reports a generic failure — no Plaid codes, no token, no ciphertext — to the caller", async () => {
    itemRemove.mockRejectedValue(plaidErr("INVALID_INPUT", "INVALID_ACCESS_TOKEN"));
    const { client } = fakeSupabase();

    const result = await call(client, true);

    expect(JSON.stringify(result)).not.toMatch(/INVALID_ACCESS_TOKEN|access-production|CIPHERTEXT|ITEM_/);
  });

  it("never logs the access token, the ciphertext or a raw Plaid body — on any path", async () => {
    const { client } = fakeSupabase();
    for (const failure of [plaidErr("INVALID_INPUT", "INVALID_ACCESS_TOKEN"), plaidErr("ITEM_ERROR", "ITEM_NOT_FOUND"), new Error("net down")]) {
      itemRemove.mockRejectedValueOnce(failure);
      await call(client, true);
    }
    itemRemove.mockResolvedValueOnce({ data: {} });
    await call(client, true);

    const everything = JSON.stringify(logged);
    expect(everything).not.toContain(PLAIN_TOKEN);
    expect(everything).not.toContain(CIPHERTEXT);
    expect(everything).not.toContain("error_type"); // a raw response body
  });

  it("is retry-safe: if Plaid removal succeeded but the local delete failed, a retry sees ITEM_NOT_FOUND and completes", async () => {
    itemRemove.mockResolvedValueOnce({ data: {} });
    const first = fakeSupabase({ deleteFails: true });
    expect((await call(first.client, true)).ok).toBe(false);

    itemRemove.mockRejectedValueOnce(plaidErr("ITEM_ERROR", "ITEM_NOT_FOUND"));
    const second = fakeSupabase();
    expect(await call(second.client, true)).toEqual({ ok: true, purged: false });
    expect(second.deletes).toEqual(["plaid_items"]);
  });

  it("reports an unknown Item as 404 without calling Plaid", async () => {
    const { client, deletes } = fakeSupabase({ item: null });

    expect(await call(client, true)).toEqual({ ok: false, status: 404, error: "unknown item" });
    expect(itemRemove).not.toHaveBeenCalled();
    expect(deletes).toEqual([]);
  });
});

describe("disconnectPlaidItem — default (manual 'disconnect bank') behaviour is unchanged", () => {
  it("still disconnects locally when Plaid's removal fails: a revoked/expired Item must remain disconnectable by the user", async () => {
    itemRemove.mockRejectedValue(plaidErr("INVALID_INPUT", "INVALID_ACCESS_TOKEN"));
    const { client, deletes } = fakeSupabase();

    expect(await call(client)).toEqual({ ok: true, purged: false });
    expect(deletes).toEqual(["plaid_items"]);
  });

  it("still disconnects locally when the token cannot be decrypted", async () => {
    decryptToken.mockImplementation(() => {
      throw new Error("bad key");
    });
    const { client, deletes } = fakeSupabase();

    expect(await call(client, false)).toEqual({ ok: true, purged: false });
    expect(deletes).toEqual(["plaid_items"]);
  });
});

// --- Database failures while tearing the connection down -------------------------------------
//
// Reproduced on staging: the background sync (pg_cron, ~30s) locks `transactions` rows and then
// updates its parent `plaid_items` row, while a disconnect deletes that parent row and cascades to
// the same transactions. Postgres breaks the cycle by aborting one side with 40P01 (deadlock). If
// that side is the disconnect, Plaid has already removed the Item, and the user was shown
// "could not disconnect". A deadlock victim is meant to be retried.

type DbError = { code?: string; message: string };
type Chain = { eq: () => Chain; in: () => Chain; then: PromiseLike<{ error: DbError | null }>["then"] };

const DEADLOCK: DbError = { code: "40P01", message: "deadlock detected" };
const SERIALIZATION: DbError = { code: "40001", message: "could not serialize access" };

/** A Supabase stand-in whose DELETE results are scripted per table, in order, and which records every attempt. */
function scriptedSupabase(script: {
  plaid_items?: (DbError | null)[];
  transactions?: (DbError | null)[];
  accounts?: { id: string }[];
  accountsError?: DbError | null;
}) {
  const attempts: string[] = [];
  const queues: Record<string, (DbError | null)[]> = {
    plaid_items: [...(script.plaid_items ?? [])],
    transactions: [...(script.transactions ?? [])],
  };
  const client = {
    from(table: string) {
      return {
        select: () => ({
          eq: () =>
            Object.assign(
              Promise.resolve({
                data: script.accountsError ? null : (script.accounts ?? [{ id: "acct-1" }]),
                error: script.accountsError ?? null,
              }),
              { maybeSingle: async () => ({ data: { id: "row-1", access_token_enc: CIPHERTEXT }, error: null }) },
            ),
        }),
        delete: () => {
          const chain: Chain = {
            eq: () => chain,
            in: () => chain,
            then: (onFulfilled, onRejected) => {
              attempts.push(table);
              const queue = queues[table] ?? [];
              const error = queue.length ? queue.shift()! : null;
              return Promise.resolve({ error }).then(onFulfilled, onRejected);
            },
          };
          return chain;
        },
      };
    },
  };
  return { client: client as never, attempts };
}

const callPurge = (client: never) => disconnectPlaidItem(client, { userId: "u1", itemId: "item-1", purge: true });

describe("disconnectPlaidItem — database deadlocks and other failures", () => {
  beforeEach(() => {
    itemRemove.mockResolvedValue({ data: {} });
  });

  it("retries the connection delete when Postgres aborts it as a deadlock victim, and then succeeds", async () => {
    const { client, attempts } = scriptedSupabase({ plaid_items: [DEADLOCK] });

    expect(await call(client)).toEqual({ ok: true, purged: false });
    expect(attempts).toEqual(["plaid_items", "plaid_items"]);
  });

  it("does not ask Plaid to remove the Item again when only the database step is retried", async () => {
    const { client } = scriptedSupabase({ plaid_items: [DEADLOCK, DEADLOCK] });

    await call(client);

    expect(itemRemove).toHaveBeenCalledTimes(1);
  });

  it("also retries a serialization failure (40001)", async () => {
    const { client, attempts } = scriptedSupabase({ plaid_items: [SERIALIZATION] });

    expect((await call(client)).ok).toBe(true);
    expect(attempts).toEqual(["plaid_items", "plaid_items"]);
  });

  it("gives up after a bounded number of deadlocks with a generic error, so the user sees a retryable failure", async () => {
    const { client, attempts } = scriptedSupabase({ plaid_items: Array(10).fill(DEADLOCK) });

    expect(await call(client)).toEqual({ ok: false, status: 500, error: "could not disconnect" });
    expect(attempts).toEqual(["plaid_items", "plaid_items", "plaid_items", "plaid_items"]);
  });

  it("does not retry other database errors", async () => {
    const { client, attempts } = scriptedSupabase({ plaid_items: [{ code: "23503", message: "fk violation" }] });

    expect(await call(client)).toEqual({ ok: false, status: 500, error: "could not disconnect" });
    expect(attempts).toEqual(["plaid_items"]);
  });

  it("retries a deadlock on the transaction purge, and removes the connection only after the purge succeeded", async () => {
    const { client, attempts } = scriptedSupabase({ transactions: [DEADLOCK] });

    expect(await callPurge(client)).toEqual({ ok: true, purged: true });
    expect(attempts).toEqual(["transactions", "transactions", "plaid_items"]);
  });

  it("does not report success when the purge the user asked for failed: the connection row is kept so they can retry", async () => {
    const { client, attempts } = scriptedSupabase({ transactions: [{ message: "db exploded" }] });

    expect(await callPurge(client)).toEqual({ ok: false, status: 500, error: "could not disconnect" });
    expect(attempts).toEqual(["transactions"]); // plaid_items was NOT deleted
  });

  it("does not report success when the accounts to purge cannot be looked up", async () => {
    const { client, attempts } = scriptedSupabase({ accountsError: { message: "db exploded" } });

    expect(await callPurge(client)).toEqual({ ok: false, status: 500, error: "could not disconnect" });
    expect(attempts).toEqual([]); // nothing was deleted
  });

  it("never logs a token or ciphertext while retrying", async () => {
    const { client } = scriptedSupabase({ plaid_items: [DEADLOCK, DEADLOCK] });

    await call(client);

    const everything = JSON.stringify(logged);
    expect(everything).not.toContain(PLAIN_TOKEN);
    expect(everything).not.toContain(CIPHERTEXT);
  });
});
