/**
 * Plaid-integration: real Sandbox `/transactions/sync` responses flow cleanly
 * through the `PlaidTxnInput` type and `normalizePlaidTxn`. No DB.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizePlaidTxn } from "@/lib/plaid/adapter";
import { buildCategoryLookup } from "@/lib/plaid/category-map";
import { buildResolveCategory } from "@/lib/plaid/merchant-rules";
import type { AccountMapEntry, NormalizeCtx, PlaidTxnInput } from "@/lib/plaid/types";
import { createSandboxItemWithTxns, plaidTestClient, type SandboxItem } from "./_plaid";

const client = plaidTestClient();
let item: SandboxItem;
let added: PlaidTxnInput[] = [];

beforeAll(async () => {
  item = await createSandboxItemWithTxns(client);
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const s = await client.transactionsSync({ access_token: item.accessToken, cursor, count: 500 });
    added = added.concat(s.data.added as unknown as PlaidTxnInput[]);
    cursor = s.data.next_cursor;
    if (!s.data.has_more) break;
  }
});

afterAll(async () => {
  await client.itemRemove({ access_token: item.accessToken }).catch(() => {});
});

describe("real Sandbox transactions", () => {
  it("returns a non-empty added set with the fields the adapter reads", () => {
    expect(added.length).toBeGreaterThan(0);
    for (const t of added) {
      expect(typeof t.transaction_id).toBe("string");
      expect(typeof t.account_id).toBe("string");
      expect(typeof t.amount).toBe("number");
      expect(typeof t.date).toBe("string");
      expect(t.personal_finance_category === null || typeof t.personal_finance_category?.primary === "string").toBe(true);
    }
  });

  it("every real transaction normalizes to a txn or a typed skip (never throws)", () => {
    const accountMap = new Map<string, AccountMapEntry>(
      item.accounts.map((a) => [a.account_id, { plaidAccountRowId: `pa-${a.account_id}`, budgtsAccountId: "b-acct", ignored: false, signConvention: "standard" }]),
    );
    const ctx: NormalizeCtx = {
      accountMap,
      currency: "USD",
      resolveCategory: buildResolveCategory({
        merchantRules: new Map(),
        categoryLookup: buildCategoryLookup([
          ["Food / Groceries", "cat-food"],
          ["Transportation", "cat-tx"],
          ["Entertainment", "cat-ent"],
          ["Housing", "cat-house"],
          ["Personal Care", "cat-pc"],
          ["Salary", "cat-sal"],
          ["Other Income", "cat-oth"],
        ]),
      }),
    };

    let txns = 0;
    for (const t of added) {
      const res = normalizePlaidTxn(t, ctx);
      if (res.kind === "txn") {
        txns++;
        expect(res.txn.amount).toBeGreaterThan(0); // minor units, always > 0
        expect(["debit", "credit"]).toContain(res.txn.direction);
        expect(res.txn.source).toBe("bank");
        expect(res.txn.sourceRef).toBe(t.transaction_id);
        expect(new Date(res.txn.occurredAt).toString()).not.toBe("Invalid Date");
      } else {
        expect(["unknown-account", "ignored-account", "zero-amount"]).toContain(res.reason);
      }
    }
    expect(txns).toBeGreaterThan(0);
  });
});
