/**
 * The real {@link RecurringStore} — Drizzle over a direct Postgres
 * connection, same posture as sync-store.ts (service-role, RLS-bypassed,
 * every query filters `user_id` explicitly).
 *
 * The mute/override guard is resolved in JS from the `existing` row already
 * loaded by the caller (recurring-engine.ts), not a SQL-level CASE — safe
 * for this feature's actual concurrency requirement (the SAME daily job
 * accidentally invoked twice for one user computes and writes the same
 * values either way) but NOT a hardened defense against a hypothetical
 * simultaneous user-mute action, which cannot happen yet since no UI writes
 * to this table in this phase. Revisit if/when a mute UI is built.
 */
import { and, eq, gt, gte, inArray, isNotNull, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/lib/db/schema";
import { plaidAccounts, profiles, recurringSeries, transactions } from "@/lib/db/schema";
import type { ExistingSeriesRow, RecurringObservationRow, RecurringStore } from "./recurring-engine";
import type { SeriesUpdate } from "./recurring-detection";
import type { EventRole } from "./types";

export type RecurringDb = PostgresJsDatabase<typeof schema>;

/** Candidacy-eligible event roles — see docs/specs/2026-09-16-recurring-
 * detection-design.md §C. TRANSFER/CARD_PAYMENT/CASH_ADVANCE/P2P_PAYMENT/
 * ADJUSTMENT/REFUND are never candidates; NULL (unresolved) is never a
 * candidate either (event-role.ts never guesses, and neither does this). */
const ELIGIBLE_EVENT_ROLES: string[] = ["PURCHASE", "INCOME", "FEE", "INTEREST"];

/** Plaid primaries too broad to trust for recurrence — the same judgment
 * category-map.ts already applies for categorization ("too broad" to
 * auto-file), reused here to close the false-positive risk of ordinary
 * roughly-periodic big-box/marketplace shopping (Amazon, Costco, Target)
 * being mistaken for a genuine recurring bill. */
const EXCLUDED_PRIMARIES: string[] = ["GENERAL_MERCHANDISE", "GENERAL_SERVICES"];

/** How far back a group's observation history is loaded — bounds query
 * cost; long enough for an annual cadence to eventually accumulate 2
 * occurrences without scanning a user's entire history every run. */
const LOOKBACK_DAYS = 400;

function candidacyConditions(userId: string) {
  return and(
    eq(transactions.userId, userId),
    eq(transactions.source, "bank"),
    eq(transactions.status, "confirmed"),
    eq(transactions.pending, false),
    isNull(transactions.removedAt),
    isNull(transactions.duplicateOfId),
    isNotNull(transactions.merchantEntityId),
    inArray(transactions.eventRole, ELIGIBLE_EVENT_ROLES),
    or(isNull(transactions.plaidCategoryPrimary), notInArray(transactions.plaidCategoryPrimary, EXCLUDED_PRIMARIES)),
  );
}

export function createRecurringStore(db: RecurringDb): RecurringStore {
  return {
    async findCandidateGroups(userId, sinceWatermark, upToScanStart) {
      const rows = await db
        .selectDistinct({
          merchantEntityId: transactions.merchantEntityId,
          accountId: transactions.accountId,
          direction: transactions.direction,
        })
        .from(transactions)
        .where(
          and(
            candidacyConditions(userId),
            sinceWatermark ? gt(transactions.createdAt, new Date(sinceWatermark)) : undefined,
            // Closed upper bound (review fix B1) -- without this, a row
            // created between this query and markScanned's write would be
            // silently, permanently invisible to every future run.
            lte(transactions.createdAt, new Date(upToScanStart)),
          ),
        );
      return rows.map((r) => ({
        merchantEntityId: r.merchantEntityId as string,
        accountId: r.accountId,
        direction: r.direction,
      }));
    },

    async loadGroupObservations(userId, key) {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
      const rows = await db
        .select({
          id: transactions.id,
          amount: transactions.amount,
          occurredAt: transactions.occurredAt,
          eventRole: transactions.eventRole,
        })
        .from(transactions)
        .where(
          and(
            candidacyConditions(userId),
            eq(transactions.merchantEntityId, key.merchantEntityId),
            eq(transactions.accountId, key.accountId),
            eq(transactions.direction, key.direction),
            gte(transactions.occurredAt, since),
          ),
        )
        .orderBy(transactions.occurredAt);
      return rows.map((r) => ({
        id: r.id,
        amount: r.amount,
        occurredAt: r.occurredAt.toISOString(),
        eventRole: r.eventRole as EventRole,
      })) satisfies RecurringObservationRow[];
    },

    async findExistingSeries(userId, key) {
      const [row] = await db
        .select()
        .from(recurringSeries)
        .where(
          and(
            eq(recurringSeries.userId, userId),
            eq(recurringSeries.merchantEntityId, key.merchantEntityId),
            eq(recurringSeries.accountId, key.accountId),
            eq(recurringSeries.direction, key.direction),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        cadence: row.cadence as ExistingSeriesRow["cadence"],
        expectedAmount: row.expectedAmount,
        amountToleranceMinor: row.amountToleranceMinor,
        observationCount: row.observationCount,
        status: row.status as ExistingSeriesRow["status"],
        overriddenByUser: row.overriddenByUser,
      };
    },

    async applySeriesUpdate(userId, key, update: SeriesUpdate, eventRole, existing) {
      // Guards resolved from the already-loaded `existing` snapshot -- see
      // this file's docstring for why that's the right scope for this
      // feature's actual concurrency requirement.
      const isMuted = existing?.status === "MUTED";
      const isOverridden = existing?.overriddenByUser === true;

      const finalCadence = isOverridden ? existing!.cadence : update.cadence;
      const finalExpectedAmount = isOverridden ? existing!.expectedAmount : update.expectedAmount;
      const finalTolerance = isOverridden ? existing!.amountToleranceMinor : update.amountToleranceMinor;
      const finalStatus = isMuted ? "MUTED" : update.status;

      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(recurringSeries)
          .values({
            userId,
            merchantEntityId: key.merchantEntityId,
            accountId: key.accountId,
            direction: key.direction,
            eventRole,
            cadence: finalCadence,
            expectedAmount: finalExpectedAmount,
            amountToleranceMinor: finalTolerance,
            lastOccurredAt: new Date(update.lastOccurredAt),
            nextExpectedAt: new Date(update.nextExpectedAt),
            observationCount: update.observationCount,
            status: finalStatus,
          })
          .onConflictDoUpdate({
            target: [
              recurringSeries.userId,
              recurringSeries.merchantEntityId,
              recurringSeries.accountId,
              recurringSeries.direction,
            ],
            set: {
              eventRole,
              cadence: finalCadence,
              expectedAmount: finalExpectedAmount,
              amountToleranceMinor: finalTolerance,
              lastOccurredAt: new Date(update.lastOccurredAt),
              nextExpectedAt: new Date(update.nextExpectedAt),
              observationCount: update.observationCount,
              status: finalStatus,
              updatedAt: sql`now()`,
            },
          })
          .returning({ id: recurringSeries.id });

        if (update.memberIds.length > 0) {
          await tx
            .update(transactions)
            .set({ recurringStreamId: row.id })
            .where(
              and(
                eq(transactions.userId, userId),
                inArray(transactions.id, update.memberIds),
                isNull(transactions.recurringStreamId),
              ),
            );
        }
      });
    },

    async markScanned(userId, at) {
      await db.update(profiles).set({ recurringLastScanAt: new Date(at) }).where(eq(profiles.id, userId));
    },
  };
}

/** Users with at least one active, mapped Plaid-connected account — the
 * daily job's candidate population. A user with only manual accounts has no
 * `merchant_entity_id` data and is correctly never selected. */
export async function findUsersWithPlaidAccounts(db: RecurringDb): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: plaidAccounts.userId })
    .from(plaidAccounts)
    .where(eq(plaidAccounts.linkState, "mapped"));
  return rows.map((r) => r.userId);
}

/** One user's `profiles.recurring_last_scan_at` watermark (null = never scanned). */
export async function loadRecurringWatermark(db: RecurringDb, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ recurringLastScanAt: profiles.recurringLastScanAt })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row?.recurringLastScanAt ? row.recurringLastScanAt.toISOString() : null;
}
