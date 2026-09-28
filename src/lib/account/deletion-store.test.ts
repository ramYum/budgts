import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDeletionStore, DeletionPreconditionError, pgErrorCode, retryOnDeadlock } from "./deletion-store";

const pgError = (code: string, message = "boom") => Object.assign(new Error(message), { code });
/** drizzle-orm wraps the driver's error: the SQLSTATE is on `.cause`, not on the error itself. */
const wrapped = (code: string) => Object.assign(new Error("Failed query: delete from x\nparams: some-user-id"), { cause: pgError(code) });
const noSleep = async () => {};

describe("pgErrorCode", () => {
  it("reads the SQLSTATE from a raw driver error and from drizzle's wrapper", () => {
    expect(pgErrorCode(pgError("40P01"))).toBe("40P01");
    expect(pgErrorCode(wrapped("57014"))).toBe("57014");
  });

  it.each([
    ["undefined", undefined],
    ["a plain error", new Error("deadlock detected")], // the words are not the signature
    ["a non-string code", Object.assign(new Error("x"), { code: 40001 })],
    ["a node network code (not a SQLSTATE)", Object.assign(new Error("x"), { code: "ECONNRESET" })],
  ])("finds no SQLSTATE in %s", (_label, err) => {
    expect(pgErrorCode(err)).toBeUndefined();
  });
});

/**
 * The retry claim is "Postgres aborted THIS transaction as a deadlock victim, and a transaction that is aborted
 * rolls back completely, so running it again cannot repeat or half-apply anything". That is true of 40P01 and of
 * nothing else on this list.
 */
describe("retryOnDeadlock — only a deadlock victim is retried", () => {
  it("retries a 40P01 and returns the eventual result", async () => {
    const run = vi.fn().mockRejectedValueOnce(pgError("40P01")).mockResolvedValueOnce("done");

    expect(await retryOnDeadlock(run, { sleep: noSleep })).toBe("done");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("recognises a 40P01 that drizzle wrapped", async () => {
    const run = vi.fn().mockRejectedValueOnce(wrapped("40P01")).mockResolvedValueOnce("done");

    expect(await retryOnDeadlock(run, { sleep: noSleep })).toBe("done");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("is bounded: gives up after the maximum attempts and rethrows the deadlock, never returning success", async () => {
    const run = vi.fn().mockRejectedValue(pgError("40P01"));

    await expect(retryOnDeadlock(run, { attempts: 4, sleep: noSleep })).rejects.toMatchObject({ code: "40P01" });
    expect(run).toHaveBeenCalledTimes(4);
  });

  it("backs off between attempts (growing, jittered), never in a tight loop", async () => {
    const delays: number[] = [];
    const run = vi.fn().mockRejectedValue(pgError("40P01"));

    await retryOnDeadlock(run, { attempts: 4, sleep: async (ms) => void delays.push(ms) }).catch(() => {});

    expect(delays).toHaveLength(3);
    expect(delays[0]).toBeGreaterThanOrEqual(50);
    expect(delays[1]).toBeGreaterThan(delays[0] - 50); // doubles, allowing for the jitter
    expect(delays[2]).toBeGreaterThanOrEqual(200);
  });

  it.each([
    ["a statement timeout (57014): re-running would just time out again, and hides a real cost problem", pgError("57014")],
    ["a lock timeout (55P03): the other writer is still holding it", pgError("55P03")],
    ["a foreign-key violation (23503): the data itself refused it", pgError("23503")],
    ["a unique violation (23505)", pgError("23505")],
    ["a serialization failure (40001): not produced under read committed, and not measured here", pgError("40001")],
    ["a wrapped statement timeout", wrapped("57014")],
    ["an error with the deadlock WORDS but no code", new Error("deadlock detected")],
    ["a connection reset", Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })],
    ["a precondition failure (a bank connection appeared)", new DeletionPreconditionError("a bank connection still exists")],
    ["a non-error value", "boom"],
  ])("does NOT retry %s: exactly one attempt", async (_label, error) => {
    const run = vi.fn().mockRejectedValue(error);

    await expect(retryOnDeadlock(run, { sleep: noSleep })).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("logs the retry without anything identifying", async () => {
    const logged: unknown[][] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => void logged.push(args));
    try {
      const run = vi.fn().mockRejectedValueOnce(wrapped("40P01")).mockResolvedValueOnce("ok");
      await retryOnDeadlock(run, { sleep: noSleep });

      expect(logged.length).toBe(1);
      expect(JSON.stringify(logged)).not.toContain("some-user-id"); // the wrapper's message embeds it; the log must not
    } finally {
      spy.mockRestore();
    }
  });
});

/** A stand-in for the drizzle handle: `transaction` runs the callback against a `tx` that answers every statement. */
function fakeDb(script: { onTransaction?: () => void; countN?: number; plaidItems?: number } = {}) {
  let transactions = 0;
  const executed: string[] = [];
  const answer = (q: unknown) => {
    const chunks = JSON.stringify((q as { queryChunks?: unknown }).queryChunks ?? q);
    executed.push(chunks);
    const isPlaid = chunks.includes("plaid_items") && chunks.includes("select (select count");
    const n = isPlaid ? (script.plaidItems ?? 0) : (script.countN ?? 0);
    return Object.assign([{ n }], { count: 1 });
  };
  const db = {
    execute: async (q: unknown) => answer(q),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      transactions++;
      script.onTransaction?.();
      return cb({ execute: async (q: unknown) => answer(q) });
    },
  };
  return { db: db as never, transactions: () => transactions };
}

describe("createDeletionStore — deleteOwnedData", () => {
  it("runs as ONE transaction and reports the rows deleted per table", async () => {
    const { db, transactions } = fakeDb();

    const out = await createDeletionStore({ db, sleep: noSleep }).deleteOwnedData("u1");

    expect(transactions()).toBe(1);
    expect(Object.keys(out.deleted)).toEqual([
      "transactions", "recurring_series", "savings_contributions", "savings_goals", "budgets",
      "plaid_merchant_rules", "categories", "accounts", "profiles",
    ]); // the FK-safe order: transactions before accounts (transactions.account_id is RESTRICT)
  });

  it("retries the whole transaction when Postgres picks it as a deadlock victim, and only then", async () => {
    let attempt = 0;
    const { db, transactions } = fakeDb({
      onTransaction: () => {
        if (++attempt <= 2) throw wrapped("40P01");
      },
    });

    await createDeletionStore({ db, sleep: noSleep }).deleteOwnedData("u1");

    expect(transactions()).toBe(3);
  });

  it("does not retry a statement timeout: it surfaces, so the caller reports a failure", async () => {
    const { db, transactions } = fakeDb({
      onTransaction: () => {
        throw wrapped("57014");
      },
    });

    await expect(createDeletionStore({ db, sleep: noSleep }).deleteOwnedData("u1")).rejects.toBeTruthy();
    expect(transactions()).toBe(1);
  });

  it("refuses (rolls back) if a bank connection exists: deleting around it would orphan a live Plaid item", async () => {
    const { db } = fakeDb({ plaidItems: 1 });

    await expect(createDeletionStore({ db, sleep: noSleep }).deleteOwnedData("u1")).rejects.toBeInstanceOf(DeletionPreconditionError);
  });

  it("refuses (rolls back) if any owned row is still there when it is done: success must mean nothing survives", async () => {
    const { db } = fakeDb({ countN: 2 });

    await expect(createDeletionStore({ db, sleep: noSleep }).deleteOwnedData("u1")).rejects.toThrow(/owned rows remain/);
  });
});
