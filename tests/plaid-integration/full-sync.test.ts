/**
 * Plaid-integration + DB: the whole ingestion path with real Sandbox data.
 *   Sandbox Item  ->  encrypted plaid_items row  ->  runClaimedSync() (lease -> syncItem -> release)
 *   ->  runSync -> adapter -> apply-sync -> PlaidSyncStore  ->  staging Postgres
 *
 * This is the "E2E transaction flow" minus the browser UI.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptToken } from "@/lib/plaid/crypto";
import { findItemByPlaidItemId } from "@/lib/plaid/item-store";
import { plaidSyncRunnerDeps, runClaimedSync } from "@/lib/plaid/sync-runner";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { MERCHANT_KNOWLEDGE } from "@/lib/plaid/merchant-knowledge";
import { normalizeMerchantName } from "@/lib/plaid/merchant-name";
import {
  categoryIdByName,
  cleanupUser,
  createSandboxItemWithTxns,
  db,
  mainAccountId,
  pg,
  plaidTestClient,
  seedUser,
  type SandboxItem,
} from "./_plaid";

const client = plaidTestClient();
const tokenEncKey = loadPlaidConfig().tokenEncKey;

let userId: string;
let accountId: string;
let itemRowId: string;
let sandbox: SandboxItem;

beforeAll(async () => {
  userId = await seedUser();
  accountId = await mainAccountId(userId);
  await categoryIdByName(userId, "Food / Groceries"); // sanity: trigger seeded

  sandbox = await createSandboxItemWithTxns(client);

  const [item] = await pg<{ id: string }[]>`
    insert into public.plaid_items (user_id, item_id, institution_name, access_token_enc, status, needs_sync)
    values (${userId}, ${sandbox.itemId}, 'Sandbox (First Platypus)',
            ${encryptToken(sandbox.accessToken, tokenEncKey)}, 'active', true)
    returning id`;
  itemRowId = item.id;

  // Map every account to the one "Main" Budgts account (fine for the test).
  for (const a of sandbox.accounts) {
    await pg`
      insert into public.plaid_accounts (user_id, plaid_item_id, plaid_account_id, account_id, link_state, name, type)
      values (${userId}, ${itemRowId}, ${a.account_id}, ${accountId}, 'mapped', ${a.name}, ${a.type})`;
  }
});

afterAll(async () => {
  await client.itemRemove({ access_token: sandbox.accessToken }).catch(() => {});
  await cleanupUser(userId);
  await pg.end();
});

async function bankRows() {
  return pg`select * from public.transactions where user_id = ${userId} and source = 'bank' order by occurred_at`;
}

/** The production path: the same per-Item lease every trigger uses. */
async function claimedSync() {
  const out = await runClaimedSync(plaidSyncRunnerDeps({ db, client, tokenEncKey }), sandbox.itemId, { kind: "requested" });
  if (!out.claimed) throw new Error("claim not granted");
  const [lease] = await pg`select sync_claim_token from public.plaid_items where item_id = ${sandbox.itemId}`;
  expect(lease.sync_claim_token).toBeNull(); // released
  return out.result;
}

describe("syncItem against real Sandbox data (staging Postgres)", () => {
  it("lands real bank transactions on the first sync and advances the cursor", async () => {
    const item = await findItemByPlaidItemId(db, sandbox.itemId);
    expect(item).not.toBeNull();

    const res = await claimedSync();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inserts).toBeGreaterThan(0);
    expect(res.hasMore).toBe(false);
    expect(res.cursor).toBeTruthy();

    const rows = await bankRows();
    expect(rows.length).toBe(res.inserts);
    for (const r of rows) {
      expect(r.source).toBe("bank");
      expect(r.amount).toBeGreaterThan(0);
      expect(["debit", "credit"]).toContain(r.direction);
      expect(r.plaid_account_id).not.toBeNull();
      expect(typeof r.source_ref).toBe("string");
      expect(r.raw).toBeTruthy(); // the raw Plaid payload was stored
      // Sandbox is USD == user currency, so never a currency_mismatch. A row
      // may still land pending_review by design (North Star §2): accounts
      // start with sign_convention = 'unknown' and only get confirmed once
      // detectSignConvention has enough evidence — never guessed.
      if (r.status !== "confirmed") {
        expect(r.status).toBe("pending_review");
        expect(r.pending_reason).toBe("sign_convention_unknown");
      }
    }
    // at least one real merchant name came through
    expect(rows.some((r) => typeof r.merchant_name === "string" && r.merchant_name.length > 0)).toBe(true);

    const [pItem] = await pg`select transactions_cursor, needs_sync, last_synced_at from public.plaid_items where item_id = ${sandbox.itemId}`;
    expect(pItem.transactions_cursor).toBe(res.cursor);
    expect(pItem.needs_sync).toBe(false); // released with no webhook since the claim
    expect(pItem.last_synced_at).not.toBeNull();
  });

  it("categorizes obvious merchants on first import — even at LOW / no Plaid confidence (design §18)", async () => {
    const rows = await bankRows();

    // (a) the LOW-confidence bypass actually fires on live Sandbox data:
    //     at least one row Plaid was NOT confident about is still categorized.
    const lowConfCategorized = rows.filter(
      (r) =>
        (r.plaid_pfc_confidence == null || ["LOW", "UNKNOWN"].includes(r.plaid_pfc_confidence)) &&
        r.category_id != null,
    );
    expect(lowConfCategorized.length).toBeGreaterThan(0);

    // (b) nothing whose normalized merchant name is in the knowledge table is
    //     left in "Needs a category".
    const knownButUncategorized = rows.filter(
      (r) =>
        typeof r.merchant_name === "string" &&
        MERCHANT_KNOWLEDGE.has(normalizeMerchantName(r.merchant_name)) &&
        r.category_id == null,
    );
    expect(knownButUncategorized.map((r) => r.merchant_name)).toEqual([]);

    // (c) transfers are never categorized.
    for (const r of rows.filter((x) => x.is_transfer)) {
      expect(r.category_id).toBeNull();
    }
  });

  it("a second sync from the stored cursor is a no-op (idempotent)", async () => {
    const before = (await bankRows()).length;
    const res = await claimedSync();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inserts).toBe(0);
    expect((await bankRows()).length).toBe(before);
  });

  it("Sandbox accepts a SYNC_UPDATES_AVAILABLE fire_webhook for this item (delivery is E2E)", async () => {
    const r = await client.sandboxItemFireWebhook({
      access_token: sandbox.accessToken,
      webhook_type: "TRANSACTIONS" as never,
      webhook_code: "SYNC_UPDATES_AVAILABLE" as never,
    });
    expect(r.status).toBe(200);
    expect(r.data.webhook_fired).toBe(true);
  });
});
