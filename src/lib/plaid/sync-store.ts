/**
 * The real {@link PlaidSyncStore} — Drizzle over a direct Postgres connection
 * (the webhook / cron / sync path runs as the DB role, RLS-bypassed, so every
 * query filters `user_id` explicitly — design §22).
 *
 * `applyPlan` runs inserts + updates + soft-deletes + the cursor/status write
 * in ONE transaction. A crash before commit leaves the old cursor, so the next
 * run re-fetches and re-applies idempotently.
 *
 * Constructed with an injected `db` so the DB-integration tests point it at
 * `budgts-staging` and unit code never imports it.
 */
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/lib/db/schema";
import { plaidAccounts, plaidItems, transactions } from "@/lib/db/schema";
import type { SyncPlan, TxnPatch } from "./apply-sync";
import { plaidToInsert } from "./land";
import type { SignEvidenceTxn } from "./sign-convention";
import type { PlaidSyncStore, PlaidTxnRow } from "./sync-engine";

export type PlaidDb = PostgresJsDatabase<typeof schema>;

// A single sync pass can aggregate thousands of touched refs/rows across many
// Plaid pages before ever touching the DB (design: runSync collects up to
// maxPagesPerRun pages first). Passing an unbounded array to `inArray`/a bulk
// insert blows Drizzle's SQL-builder recursion for large-enough batches
// (confirmed in production: ~9,000 refs threw "Maximum call stack size
// exceeded") and risks Postgres's own hard 65,535-bound-parameter limit for
// wide multi-row inserts. Chunk every batch operation instead.
const BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function patchToSet(patch: TxnPatch): Record<string, unknown> {
  const set: Record<string, unknown> = {
    amount: patch.amount,
    direction: patch.direction,
    occurredAt: new Date(patch.occurredAt),
    description: patch.description,
    status: patch.status,
    pendingReason: patch.pendingReason,
    pending: patch.pending,
    merchantName: patch.merchantName,
    merchantEntityId: patch.merchantEntityId,
    plaidCategoryPrimary: patch.plaidCategoryPrimary,
    plaidCategoryDetailed: patch.plaidCategoryDetailed,
    plaidPfcConfidence: patch.plaidPfcConfidence,
    authorizedAt: patch.authorizedAt ? new Date(patch.authorizedAt) : null,
    raw: patch.raw,
  };
  if ("categoryId" in patch) set.categoryId = patch.categoryId;
  if ("isTransfer" in patch) set.isTransfer = patch.isTransfer;
  return set;
}

export function createPlaidSyncStore(db: PlaidDb): PlaidSyncStore {
  return {
    async findBySourceRefs(userId: string, refs: string[]): Promise<PlaidTxnRow[]> {
      if (refs.length === 0) return [];
      const batches = await Promise.all(
        chunk(refs, BATCH_SIZE).map((batch) =>
          db
            .select({
              id: transactions.id,
              source_ref: transactions.sourceRef,
              user_categorized: transactions.userCategorized,
              category_id: transactions.categoryId,
              note: transactions.note,
              is_transfer: transactions.isTransfer,
              removed_at: transactions.removedAt,
              status: transactions.status,
              pending_reason: transactions.pendingReason,
            })
            .from(transactions)
            .where(
              and(
                eq(transactions.userId, userId),
                eq(transactions.source, "bank"),
                inArray(transactions.sourceRef, batch),
              ),
            ),
        ),
      );
      return batches.flat().map((r) => ({
        id: r.id,
        source_ref: r.source_ref ?? "",
        user_categorized: r.user_categorized,
        category_id: r.category_id,
        note: r.note,
        is_transfer: r.is_transfer,
        removed_at: r.removed_at ? r.removed_at.toISOString() : null,
        status: r.status,
        // `pending_reason` is a plain text column; the reducer's union is the
        // only set of values this pipeline ever writes to it.
        pending_reason: r.pending_reason as PlaidTxnRow["pending_reason"],
      }));
    },

    async applyPlan(userId: string, plan: SyncPlan, meta: { itemId: string; cursor: string }) {
      return db.transaction(async (tx) => {
        // ON CONFLICT DO NOTHING (not try/catch): a failed statement aborts the
        // whole PG transaction, so a replay / lost race must not raise. The
        // partial unique index (user_id,'bank',source_ref) is the guard;
        // `returning` tells us how many rows were actually new.
        let inserts = 0;
        for (const batch of chunk(plan.inserts, BATCH_SIZE)) {
          const landed = await tx
            .insert(transactions)
            .values(batch.map((n) => plaidToInsert(userId, n)))
            .onConflictDoNothing()
            .returning({ id: transactions.id });
          inserts += landed.length;
        }

        for (const u of plan.updates) {
          await tx
            .update(transactions)
            .set(patchToSet(u.patch))
            .where(and(eq(transactions.id, u.id), eq(transactions.userId, userId)));
        }

        for (const batch of chunk(plan.softDeletes, BATCH_SIZE)) {
          await tx
            .update(transactions)
            .set({ removedAt: sql`now()` })
            .where(
              and(
                eq(transactions.userId, userId),
                inArray(transactions.id, batch),
                isNull(transactions.removedAt),
              ),
            );
        }

        await tx
          .update(plaidItems)
          .set({
            transactionsCursor: meta.cursor,
            lastSyncedAt: sql`now()`,
            updatedAt: sql`now()`,
            needsSync: false,
            syncFailures: 0,
            status: "active",
            errorCode: null,
          })
          .where(and(eq(plaidItems.userId, userId), eq(plaidItems.itemId, meta.itemId)));

        return { inserts, updates: plan.updates.length, softDeletes: plan.softDeletes.length };
      });
    },

    // Anomaly detection only (design: 2026-09-12) — never used to decide what
    // to insert or to exclude a row from financial totals. Chunked for the
    // same reason as the batches above: a large historical sync can carry
    // thousands of distinct (account, fingerprint) pairs in one pass.
    async countByAccountFingerprint(pairs) {
      if (pairs.length === 0) return new Map();
      const out = new Map<string, number>();
      for (const batch of chunk(pairs, BATCH_SIZE)) {
        const valuesList = sql.join(
          batch.map((p) => sql`(${p.accountId}::uuid, ${p.contentFingerprint}::text)`),
          sql`, `,
        ) as SQL;
        const rows = await db.execute<{ account_id: string; content_fingerprint: string; n: number }>(sql`
          select t.account_id, t.content_fingerprint, count(*)::int as n
          from transactions t
          join (values ${valuesList}) as pair(account_id, content_fingerprint)
            on t.account_id = pair.account_id and t.content_fingerprint = pair.content_fingerprint
          where t.removed_at is null
          group by t.account_id, t.content_fingerprint
        `);
        for (const r of rows) out.set(`${r.account_id}:${r.content_fingerprint}`, Number(r.n));
      }
      return out;
    },

    async flagAccountForReview(accountId, reason) {
      // `accountId` here is the Budgts `accounts.id` (PlaidNormalizedTxn's own
      // account reference) — match plaid_accounts by its FK, not by PK.
      await db
        .update(plaidAccounts)
        .set({
          needsReview: true,
          reviewReason: reason,
          // Only stamp the FIRST detection time — repeated flags (the anomaly
          // keeps growing on later syncs) refresh the reason, not "when".
          reviewFlaggedAt: sql`coalesce(${plaidAccounts.reviewFlaggedAt}, now())`,
          updatedAt: sql`now()`,
        })
        .where(eq(plaidAccounts.accountId, accountId));
    },

    // Keyed on `plaid_accounts.id` — the specific connected feed — never the
    // Budgts `accounts.id`. Two Plaid accounts can map to one Budgts account,
    // and pooling their evidence is a path to sign-inverting a minority
    // feed's genuinely-correct transactions.
    //
    // The raw sign is read from the stored Plaid payload (`raw->'amount'`),
    // never reconstructed from the `direction` column: `direction` is
    // user-editable, so deriving evidence from it would let a user's manual
    // "correction" vote in the detector and then be silently reverted by the
    // finalize that vote helped trigger. `raw` is the immutable original.
    async getSignConventionEvidence(plaidAccountRowIds) {
      if (plaidAccountRowIds.length === 0) return new Map();
      const out = new Map<string, SignEvidenceTxn[]>();
      for (const batch of chunk(plaidAccountRowIds, BATCH_SIZE)) {
        const rows = await db
          .select({
            plaidAccountId: transactions.plaidAccountId,
            raw: transactions.raw,
            primary: transactions.plaidCategoryPrimary,
          })
          .from(transactions)
          .where(
            and(
              inArray(transactions.plaidAccountId, batch),
              eq(transactions.source, "bank"),
              eq(transactions.status, "pending_review"),
              eq(transactions.pendingReason, "sign_convention_unknown"),
            ),
          );
        for (const r of rows) {
          if (!r.plaidAccountId) continue;
          const rawObj = r.raw as { amount?: unknown } | null;
          if (typeof rawObj?.amount !== "number") continue;
          const list = out.get(r.plaidAccountId) ?? [];
          list.push({ rawAmount: rawObj.amount, primary: r.primary });
          out.set(r.plaidAccountId, list);
        }
      }
      return out;
    },

    async finalizeSignConvention(plaidAccountRowId, convention) {
      await db.transaction(async (tx) => {
        await tx
          .update(plaidAccounts)
          .set({ signConvention: convention, updatedAt: sql`now()` })
          .where(eq(plaidAccounts.id, plaidAccountRowId));

        const set: Record<string, unknown> = { status: "confirmed", pendingReason: null };
        if (convention === "inverted") {
          // Explicit cast: the CASE expression is text by default, but
          // `direction` is the `txn_direction` Postgres enum — an
          // uncast text value can't be assigned to it in an UPDATE SET.
          set.direction = sql`(CASE WHEN ${transactions.direction} = 'debit' THEN 'credit' ELSE 'debit' END)::txn_direction`;
        }
        await tx
          .update(transactions)
          .set(set)
          .where(
            and(
              eq(transactions.plaidAccountId, plaidAccountRowId),
              eq(transactions.source, "bank"),
              eq(transactions.status, "pending_review"),
              eq(transactions.pendingReason, "sign_convention_unknown"),
            ),
          );
      });
    },
  };
}
