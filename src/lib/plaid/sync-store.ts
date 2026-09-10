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
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/lib/db/schema";
import { plaidItems, transactions } from "@/lib/db/schema";
import type { SyncPlan, TxnPatch } from "./apply-sync";
import { plaidToInsert } from "./land";
import type { PlaidSyncStore, PlaidTxnRow } from "./sync-engine";

export type PlaidDb = PostgresJsDatabase<typeof schema>;

function patchToSet(patch: TxnPatch): Record<string, unknown> {
  const set: Record<string, unknown> = {
    amount: patch.amount,
    direction: patch.direction,
    occurredAt: new Date(patch.occurredAt),
    description: patch.description,
    status: patch.status,
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
      const rows = await db
        .select({
          id: transactions.id,
          source_ref: transactions.sourceRef,
          user_categorized: transactions.userCategorized,
          category_id: transactions.categoryId,
          note: transactions.note,
          is_transfer: transactions.isTransfer,
          removed_at: transactions.removedAt,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.source, "bank"),
            inArray(transactions.sourceRef, refs),
          ),
        );
      return rows.map((r) => ({
        id: r.id,
        source_ref: r.source_ref ?? "",
        user_categorized: r.user_categorized,
        category_id: r.category_id,
        note: r.note,
        is_transfer: r.is_transfer,
        removed_at: r.removed_at ? r.removed_at.toISOString() : null,
      }));
    },

    async applyPlan(userId: string, plan: SyncPlan, meta: { itemId: string; cursor: string }) {
      return db.transaction(async (tx) => {
        // ON CONFLICT DO NOTHING (not try/catch): a failed statement aborts the
        // whole PG transaction, so a replay / lost race must not raise. The
        // partial unique index (user_id,'bank',source_ref) is the guard;
        // `returning` tells us how many rows were actually new.
        let inserts = 0;
        if (plan.inserts.length > 0) {
          const landed = await tx
            .insert(transactions)
            .values(plan.inserts.map((n) => plaidToInsert(userId, n)))
            .onConflictDoNothing()
            .returning({ id: transactions.id });
          inserts = landed.length;
        }

        for (const u of plan.updates) {
          await tx
            .update(transactions)
            .set(patchToSet(u.patch))
            .where(and(eq(transactions.id, u.id), eq(transactions.userId, userId)));
        }

        if (plan.softDeletes.length > 0) {
          await tx
            .update(transactions)
            .set({ removedAt: sql`now()` })
            .where(
              and(
                eq(transactions.userId, userId),
                inArray(transactions.id, plan.softDeletes),
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
  };
}
