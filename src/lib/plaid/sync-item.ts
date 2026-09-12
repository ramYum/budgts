/**
 * Sync one Plaid Item: build its `NormalizeCtx`, call `/transactions/sync`
 * through `runSync`, apply the error policy on failure. All deps injected
 * (`db`, a Plaid client) so this is exercised by the Plaid-integration layer;
 * `src/server/plaid/service.ts` wires the real singletons for the routes.
 */
import { and, eq } from "drizzle-orm";
import type { PlaidApi } from "plaid";
import { categories, plaidAccounts, profiles } from "@/lib/db/schema";
import { buildCategoryLookup } from "./category-map";
import { decryptToken } from "./crypto";
import { classifyPlaidError, readPlaidError } from "./error-policy";
import {
  type PlaidItemRecord,
  recordSyncFailure,
  setItemStatus,
} from "./item-store";
import { buildResolveCategory, loadMerchantRules } from "./merchant-rules";
import { type PlaidSyncPage, runSync, SyncMutationDuringPagination } from "./sync-engine";
import { type PlaidDb, createPlaidSyncStore } from "./sync-store";
import type { AccountMapEntry, NormalizeCtx } from "./types";

const MUTATION_CODE = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";

/** Build the sync `NormalizeCtx` for one item (account map, categories, merchant memory, currency). */
export async function buildNormalizeCtx(
  db: PlaidDb,
  userId: string,
  plaidItemRowId: string,
): Promise<NormalizeCtx> {
  const [accts, cats, prof, rules] = await Promise.all([
    db
      .select({
        id: plaidAccounts.id,
        plaidAccountId: plaidAccounts.plaidAccountId,
        accountId: plaidAccounts.accountId,
        linkState: plaidAccounts.linkState,
        signConvention: plaidAccounts.signConvention,
      })
      .from(plaidAccounts)
      .where(and(eq(plaidAccounts.userId, userId), eq(plaidAccounts.plaidItemId, plaidItemRowId))),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, userId)),
    db.select({ currency: profiles.currency }).from(profiles).where(eq(profiles.id, userId)).limit(1),
    loadMerchantRules(db, userId),
  ]);

  const accountMap = new Map<string, AccountMapEntry>(
    accts.map((a) => [
      a.plaidAccountId,
      {
        plaidAccountRowId: a.id,
        budgtsAccountId: a.accountId ?? "",
        ignored: a.linkState === "ignored" || a.accountId == null,
        signConvention: a.signConvention,
      },
    ]),
  );
  return {
    accountMap,
    currency: prof[0]?.currency ?? "USD",
    // Pure deterministic evidence chain (design §18): user rule → Budgts
    // merchant knowledge → trusted PFC detailed → gated PFC primary. The DB only
    // supplies the deps (rules + the user's categories).
    resolveCategory: buildResolveCategory({
      merchantRules: rules,
      categoryLookup: buildCategoryLookup(cats.map((c) => [c.name, c.id] as const)),
    }),
  };
}

export type SyncItemResult =
  | {
      itemId: string;
      ok: true;
      inserts: number;
      updates: number;
      softDeletes: number;
      skipped: number;
      hasMore: boolean;
      cursor: string | null;
    }
  | { itemId: string; ok: false; error: string; retry: boolean };

export async function syncItem(deps: {
  db: PlaidDb;
  client: Pick<PlaidApi, "transactionsSync">;
  item: PlaidItemRecord;
  tokenEncKey: Buffer;
}): Promise<SyncItemResult> {
  const { db, client, item, tokenEncKey } = deps;
  const accessToken = decryptToken(item.accessTokenEnc, tokenEncKey);

  const transactionsSync = async ({ cursor }: { cursor: string | null }): Promise<PlaidSyncPage> => {
    try {
      const res = await client.transactionsSync({
        access_token: accessToken,
        cursor: cursor ?? undefined,
        count: 500,
      });
      return {
        added: res.data.added,
        modified: res.data.modified,
        removed: res.data.removed,
        next_cursor: res.data.next_cursor,
        has_more: res.data.has_more,
      };
    } catch (e) {
      if (readPlaidError(e)?.error_code === MUTATION_CODE) throw new SyncMutationDuringPagination();
      throw e;
    }
  };

  try {
    const outcome = await runSync({
      userId: item.userId,
      itemId: item.itemId,
      initialCursor: item.transactionsCursor,
      transactionsSync,
      store: createPlaidSyncStore(db),
      normalizeCtx: await buildNormalizeCtx(db, item.userId, item.id),
    });
    return {
      itemId: item.itemId,
      ok: true,
      inserts: outcome.applied.inserts,
      updates: outcome.applied.updates,
      softDeletes: outcome.applied.softDeletes,
      skipped: outcome.applied.skipped,
      hasMore: outcome.hasMore,
      cursor: outcome.cursor,
    };
  } catch (e) {
    const decision = classifyPlaidError(e);
    if (decision.status) await setItemStatus(db, item.itemId, decision.status, decision.errorCode);
    else if (decision.countFailure) await recordSyncFailure(db, item.itemId, decision.errorCode);
    return { itemId: item.itemId, ok: false, error: decision.errorCode, retry: decision.retry };
  }
}
