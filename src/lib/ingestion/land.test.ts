import { describe, expect, it } from "vitest";
import { landTransaction, toRow } from "./land";
import { UniqueViolationError } from "./types";
import type { NewTransactionRow, NormalizedTxn, TransactionRow, TransactionStore } from "./types";

const userId = "0a2b8c1d-3e4f-4a5b-8c9d-0e1f2a3b4c5d";

function normalized(over: Partial<NormalizedTxn> = {}): NormalizedTxn {
  return {
    accountId: "1b3c9d2e-4f5a-4b6c-9d0e-1f2a3b4c5d6e",
    categoryId: null,
    amount: 1234,
    direction: "debit",
    occurredAt: "2026-09-07T12:00:00.000Z",
    description: "Groceries",
    note: null,
    isTransfer: false,
    source: "manual",
    sourceRef: null,
    status: "confirmed",
    ...over,
  };
}

/** In-memory TransactionStore for tests. */
function fakeStore(seed: TransactionRow[] = []) {
  const rows = [...seed];
  const calls = { inserts: 0, finds: 0 };
  const store: TransactionStore = {
    async findExisting(uid, source, sourceRef) {
      calls.finds++;
      return rows.find((r) => r.user_id === uid && r.source === source && r.source_ref === sourceRef) ?? null;
    },
    async insert(row: NewTransactionRow) {
      calls.inserts++;
      const full: TransactionRow = { ...row, id: `id-${rows.length + 1}`, created_at: "2026-09-07T12:00:00.000Z" };
      rows.push(full);
      return full;
    },
  };
  return { store, rows, calls };
}

describe("toRow", () => {
  it("maps a NormalizedTxn to a snake_case insert row", () => {
    expect(toRow(userId, normalized({ categoryId: "cat-1", note: "cash" }))).toEqual({
      user_id: userId,
      account_id: "1b3c9d2e-4f5a-4b6c-9d0e-1f2a3b4c5d6e",
      category_id: "cat-1",
      amount: 1234,
      direction: "debit",
      occurred_at: "2026-09-07T12:00:00.000Z",
      description: "Groceries",
      note: "cash",
      source: "manual",
      source_ref: null,
      status: "confirmed",
      is_transfer: false,
    });
  });
});

describe("landTransaction", () => {
  it("inserts when there is no sourceRef (manual entries)", async () => {
    const { store, calls } = fakeStore();
    const row = await landTransaction(store, userId, normalized());
    expect(row.id).toBe("id-1");
    expect(calls).toEqual({ finds: 0, inserts: 1 });
  });

  it("inserts a sourced transaction that is not yet present", async () => {
    const { store, calls } = fakeStore();
    await landTransaction(store, userId, normalized({ source: "email", sourceRef: "msg-1" }));
    expect(calls).toEqual({ finds: 1, inserts: 1 });
  });

  it("is idempotent: returns the existing row and does not insert again", async () => {
    const first = fakeStore();
    const a = await landTransaction(first.store, userId, normalized({ source: "email", sourceRef: "msg-1" }));
    const b = await landTransaction(first.store, userId, normalized({ source: "email", sourceRef: "msg-1", amount: 9999 }));
    expect(b.id).toBe(a.id);
    expect(first.calls.inserts).toBe(1);
  });

  it("recovers when a concurrent insert wins the dedupe race", async () => {
    // Another request inserted the same source_ref between our findExisting and
    // our insert; the unique index rejects our insert with a 23505.
    const seed = fakeStore();
    const winner = await seed.store.insert(
      toRow(userId, normalized({ source: "email", sourceRef: "msg-1" })),
    );
    let checkedOnce = false;
    const store: TransactionStore = {
      async findExisting() {
        if (!checkedOnce) {
          checkedOnce = true; // pre-insert check misses (row not visible yet)
          return null;
        }
        return winner; // post-conflict re-check finds the row that landed first
      },
      async insert() {
        throw new UniqueViolationError("duplicate key value violates unique constraint");
      },
    };
    const row = await landTransaction(
      store,
      userId,
      normalized({ source: "email", sourceRef: "msg-1", amount: 9999 }),
    );
    expect(row.id).toBe(winner.id);
  });

  it("rethrows a unique violation when no matching row can be found", async () => {
    const store: TransactionStore = {
      async findExisting() {
        return null;
      },
      async insert() {
        throw new UniqueViolationError("duplicate key");
      },
    };
    await expect(
      landTransaction(store, userId, normalized({ source: "email", sourceRef: "msg-2" })),
    ).rejects.toBeInstanceOf(UniqueViolationError);
  });
});
