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
import { and, eq, inArray, isNotNull, isNull, like, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/lib/db/schema";
import { plaidAccounts, plaidItems, transactions } from "@/lib/db/schema";
import type { SyncPlan, TxnPatch } from "./apply-sync";
import { plaidToInsert } from "./land";
import { planHeldRowRelease, type HeldRow } from "./held-rows";
import type { SignEvidenceTxn } from "./sign-convention";
import type { AutoResolveFacts, PlaidSyncStore, PlaidTxnRow } from "./sync-engine";

export type PlaidDb = PostgresJsDatabase<typeof schema>;

/** Paired-transfer detection candidacy exclusion — never a transfer
 * counterpart, regardless of amount/date/direction coincidence. */
const NON_TRANSFER_ROLES: string[] = ["P2P_PAYMENT", "REFUND", "INCOME"];

type LockedLegRow = {
  id: string;
  transferPairId: string | null;
  transferUserSet: boolean;
  removedAt: Date | null;
  duplicateOfId: string | null;
};

/** Locks both legs in a fixed, ascending-id order — deadlock-free even
 * across overlapping pairs sharing a leg — and returns their current
 * concurrency-relevant state for {@link pairStillEligible} to check UNDER
 * the lock. Must run inside the same `db.transaction` as any write that
 * follows. */
async function lockBothLegs(
  tx: Parameters<Parameters<PlaidDb["transaction"]>[0]>[0],
  legAId: string,
  legBId: string,
): Promise<LockedLegRow[]> {
  const [first, second] = [legAId, legBId].sort();
  return tx
    .select({
      id: transactions.id,
      transferPairId: transactions.transferPairId,
      transferUserSet: transactions.transferUserSet,
      removedAt: transactions.removedAt,
      duplicateOfId: transactions.duplicateOfId,
    })
    .from(transactions)
    .where(inArray(transactions.id, [first, second]))
    .orderBy(transactions.id)
    .for("update");
}

/** Re-validation under the lock — a candidate discovered by the (advisory)
 * pure matcher may have gone stale since discovery: paired by a concurrent
 * sync, user-overridden, removed, or marked a confirmed duplicate. Both
 * legs must still be genuinely eligible, or the whole pair is skipped —
 * never a partial write. */
function pairStillEligible(rows: LockedLegRow[]): boolean {
  return (
    rows.length === 2 &&
    rows.every((r) => r.transferPairId === null && !r.transferUserSet && r.removedAt === null && r.duplicateOfId === null)
  );
}

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
    eventRole: patch.eventRole,
  };
  if ("categoryId" in patch) set.categoryId = patch.categoryId;
  if ("isTransfer" in patch) set.isTransfer = patch.isTransfer;
  return set;
}

/**
 * The facts `autoResolveBlock` judges (design: 2026-10-01 card payments §4a), in one read: the bank's status, the
 * account's review flag, its largest group of byte-identical live rows, and how many already-confirmed rows the
 * verdict would contradict (stored direction vs the direction the verdict derives from the raw Plaid sign).
 */
export async function readAutoResolveFacts(
  exec: Pick<PlaidDb, "execute">,
  plaidAccountRowId: string,
  verdict: "standard" | "inverted",
): Promise<AutoResolveFacts> {
  const rows = await exec.execute(sql`
    select pi.status as item_status, pa.needs_review,
      coalesce((select max(n) from (
        select count(*) as n from transactions t
        where t.plaid_account_id = pa.id and t.removed_at is null and t.duplicate_of_id is null
          and t.content_fingerprint is not null
        group by t.content_fingerprint) g), 0)::int as largest_identical_group,
      (select count(*) from transactions t
        where t.plaid_account_id = pa.id and t.removed_at is null and t.duplicate_of_id is null
          and t.status = 'confirmed' and jsonb_typeof(t.raw->'amount') = 'number' and (t.raw->>'amount')::float8 <> 0
          and t.direction::text <> case
            when ((t.raw->>'amount')::float8 > 0) <> (${verdict}::text = 'inverted') then 'debit' else 'credit' end
      )::int as confirmed_contradicting
    from plaid_accounts pa join plaid_items pi on pi.id = pa.plaid_item_id
    where pa.id = ${plaidAccountRowId}`);
  const r = (rows as unknown as Record<string, unknown>[])[0];
  if (!r) return { itemStatus: "gone", needsReview: true, largestIdenticalGroup: 0, confirmedContradicting: 0 };
  return {
    itemStatus: String(r.item_status),
    needsReview: Boolean(r.needs_review),
    largestIdenticalGroup: Number(r.largest_identical_group),
    confirmedContradicting: Number(r.confirmed_contradicting),
  };
}

/** A transaction handle on the Plaid pipeline's DB. */
export type PlaidTx = Parameters<Parameters<PlaidDb["transaction"]>[0]>[0];

/** A released or re-evaluated row's values before the write, kept for the audit trail (plaid_sign_answers). */
export interface RowBefore {
  id: string;
  direction: "debit" | "credit";
  status: "confirmed" | "pending_review";
  pendingReason: string | null;
  eventRole: string | null;
}

/** The immutable Plaid payload amount (`raw.amount`) as a number, or null when absent or not a number. */
export const rawAmountSql = sql<number | null>`case when jsonb_typeof(${transactions.raw}->'amount') = 'number'
  then (${transactions.raw}->>'amount')::float8 end`;

/** postgres-js may return float8 as a string; normalise. */
export const withRawNumber = <T extends { rawAmount: number | string | null }>(r: T): T & { rawAmount: number | null } => ({
  ...r,
  rawAmount: r.rawAmount == null ? null : Number(r.rawAmount),
});

/**
 * Reconnect adoption into an already-resolved account (design: card payments §5c, prevention). A kept row still held
 * only because its OLD account's format was unknown would otherwise stay held under an account where no question is
 * asked. Adoption matched it on the same raw date and amount from the same bank account, so the raw sign means the same
 * thing: it is released with the adopting account's convention and Plaid type through `planHeldRowRelease`, from the
 * kept row's OWN fields (its direction if the user edited it, its own transfer flag), never the new transaction's. If
 * the new transaction is held for a currency mismatch, the row takes that hold instead (the UI explains it). Any other
 * kept row, or an adopting account still unknown (§5 asks there), is left exactly as it was.
 */
async function releaseAdoptedHeldRow(
  tx: PlaidTx,
  userId: string,
  kept: HeldRow & { status: "confirmed" | "pending_review"; pendingReason: string | null },
  txn: { pendingReason: string | null },
  account: { type: string | null; signConvention: "unknown" | "standard" | "inverted" } | undefined,
): Promise<void> {
  if (kept.status !== "pending_review" || kept.pendingReason !== "sign_convention_unknown") return;
  if (!account || account.signConvention === "unknown") return;
  const [rel] = planHeldRowRelease([kept], account.signConvention, account.type ?? null);
  const currencyHeld = txn.pendingReason === "currency_mismatch";
  await tx
    .update(transactions)
    .set({
      direction: rel!.direction,
      eventRole: rel!.eventRole,
      status: currencyHeld ? "pending_review" : "confirmed",
      pendingReason: currencyHeld ? "currency_mismatch" : null,
    })
    .where(and(eq(transactions.id, kept.id), eq(transactions.userId, userId)));
}

/** Writes direction + event_role per row in bulk (one UPDATE ... FROM (VALUES ...) per chunk); `confirm` also
 * releases held rows (status confirmed, no pending reason). */
export async function writeDirectionAndRole(
  tx: PlaidTx,
  computed: readonly { id: string; direction: "debit" | "credit"; eventRole: string | null }[],
  confirm: boolean,
): Promise<void> {
  for (const batch of chunk([...computed], BATCH_SIZE)) {
    const valuesList = sql.join(
      batch.map((c) => sql`(${c.id}::uuid, ${c.direction}::text, ${c.eventRole}::text)`),
      sql`, `,
    ) as SQL;
    await tx.execute(
      confirm
        ? sql`
            update transactions t
            set status = 'confirmed', pending_reason = null,
                direction = v.direction::txn_direction, event_role = v.event_role
            from (values ${valuesList}) as v(id, direction, event_role)
            where t.id = v.id`
        : sql`
            update transactions t
            set direction = v.direction::txn_direction, event_role = v.event_role
            from (values ${valuesList}) as v(id, direction, event_role)
            where t.id = v.id`,
    );
  }
}

/**
 * Resolves a still-`unknown` account and releases its held rows, inside the caller's transaction; null (nothing
 * written) when the account was already resolved. Returns the released rows' values before the write, for audit.
 *
 * Only an account still `unknown` resolves, under the row lock this UPDATE takes: a sync's evidence verdict and the
 * user's answer (design: 2026-10-01 card payments §5) can race, and the first one wins. The loser finds no row and
 * changes nothing, so a resolved convention is never overwritten or flipped twice.
 *
 * event_role is direction-dependent for spend-shaped primaries (event-role.ts rows 6/7, PURCHASE <-> REFUND) and for
 * a card's incoming payment, so a bare direction flip on "inverted" would leave roles stale (found in production
 * 2026-09-15: purchases stuck labeled REFUND). Each row is recomputed by planHeldRowRelease, from the SAME inputs the
 * live adapter used, with the corrected direction and the account's type.
 */
export async function finalizeSignConventionIn(
  tx: PlaidTx,
  plaidAccountRowId: string,
  convention: "standard" | "inverted",
): Promise<{ released: RowBefore[] } | null> {
  const [account] = await tx
    .update(plaidAccounts)
    .set({ signConvention: convention, updatedAt: sql`now()` })
    .where(and(eq(plaidAccounts.id, plaidAccountRowId), eq(plaidAccounts.signConvention, "unknown")))
    .returning({ type: plaidAccounts.type });
  if (!account) return null;

  const pendingRows = await tx
    .select({
      id: transactions.id,
      direction: transactions.direction,
      status: transactions.status,
      pendingReason: transactions.pendingReason,
      eventRole: transactions.eventRole,
      primary: transactions.plaidCategoryPrimary,
      detailed: transactions.plaidCategoryDetailed,
      isTransfer: transactions.isTransfer,
      rawAmount: rawAmountSql,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.plaidAccountId, plaidAccountRowId),
        eq(transactions.source, "bank"),
        eq(transactions.status, "pending_review"),
        eq(transactions.pendingReason, "sign_convention_unknown"),
      ),
    );
  await writeDirectionAndRole(tx, planHeldRowRelease(pendingRows.map(withRawNumber), convention, account.type ?? null), true);
  return {
    released: pendingRows.map((r) => ({
      id: r.id,
      direction: r.direction,
      status: r.status,
      pendingReason: r.pendingReason,
      eventRole: r.eventRole,
    })),
  };
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
              transfer_user_set: transactions.transferUserSet,
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
        transfer_user_set: r.transfer_user_set,
      }));
    },

    async findReconnectContext(userId, accountIds, plaidAccountRowIds, fromDate) {
      if (accountIds.length === 0) return { detached: [], connectedAtMs: new Map() };
      // `occurred_at` can carry a post DATETIME a day either side of Plaid's `date`; widen by a few days, then the
      // planner matches on the raw `date` itself. Bounded: kept rows only, on the accounts this sync touches.
      const since = new Date(Date.parse(`${fromDate}T00:00:00Z`) - 3 * 86_400_000);
      const [detachedRows, connected] = await Promise.all([
        Promise.all(
          chunk(accountIds, BATCH_SIZE).map((batch) =>
            db
              .select({
                id: transactions.id,
                accountId: transactions.accountId,
                pending: transactions.pending,
                rawDate: sql<string | null>`${transactions.raw}->>'date'`,
                rawAmount: sql<string | null>`${transactions.raw}->>'amount'`,
                rawName: sql<string | null>`${transactions.raw}->>'name'`,
                createdAt: transactions.createdAt,
              })
              .from(transactions)
              .where(
                and(
                  eq(transactions.userId, userId),
                  eq(transactions.source, "bank"),
                  isNull(transactions.plaidAccountId),
                  isNull(transactions.removedAt),
                  isNull(transactions.duplicateOfId),
                  isNotNull(transactions.raw),
                  inArray(transactions.accountId, batch),
                  sql`${transactions.occurredAt} >= ${since.toISOString()}`,
                ),
              ),
          ),
        ),
        Promise.all(
          chunk(plaidAccountRowIds, BATCH_SIZE).map((batch) =>
            db
              .select({ id: plaidAccounts.id, createdAt: plaidAccounts.createdAt })
              .from(plaidAccounts)
              .where(and(eq(plaidAccounts.userId, userId), inArray(plaidAccounts.id, batch))),
          ),
        ),
      ]);
      return {
        detached: detachedRows.flat().map((r) => ({
          id: r.id,
          accountId: r.accountId,
          pending: r.pending,
          rawDate: r.rawDate,
          rawAmount: r.rawAmount === null || r.rawAmount === "" ? null : Number(r.rawAmount),
          rawName: r.rawName,
          importedAtMs: new Date(r.createdAt).getTime(),
        })),
        connectedAtMs: new Map(connected.flat().map((r) => [r.id, new Date(r.createdAt).getTime()])),
      };
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

        // Reconnect adoption: the kept row takes the new identity (and, if it is still held for the sign check under an
        // already-resolved account, is released from its own fields: releaseAdoptedHeldRow). Conditional on it still being
        // detached, so two syncs can never both claim it; a row someone else claimed first lands as a normal insert,
        // so the new transaction is never lost.
        let rekeyed = 0;
        // The adopting Plaid accounts' convention and type, for releasing a kept row still held for the sign check.
        const rekeyAccountIds = [...new Set(plan.rekeys.map((r) => r.txn.plaidAccountRowId))];
        const rekeyAccounts = new Map(
          (rekeyAccountIds.length === 0
            ? []
            : await tx
                .select({ id: plaidAccounts.id, type: plaidAccounts.type, signConvention: plaidAccounts.signConvention })
                .from(plaidAccounts)
                .where(and(eq(plaidAccounts.userId, userId), inArray(plaidAccounts.id, rekeyAccountIds)))
          ).map((a) => [a.id, a]),
        );
        for (const r of plan.rekeys) {
          const claimed = await tx
            .update(transactions)
            .set({ sourceRef: r.txn.sourceRef, plaidAccountId: r.txn.plaidAccountRowId })
            .where(
              and(
                eq(transactions.id, r.id),
                eq(transactions.userId, userId),
                eq(transactions.source, "bank"),
                isNull(transactions.plaidAccountId),
                isNull(transactions.removedAt),
              ),
            )
            .returning({
              id: transactions.id,
              direction: transactions.direction,
              status: transactions.status,
              pendingReason: transactions.pendingReason,
              primary: transactions.plaidCategoryPrimary,
              detailed: transactions.plaidCategoryDetailed,
              isTransfer: transactions.isTransfer,
              rawAmount: rawAmountSql,
            });
          if (claimed.length > 0) {
            rekeyed++;
            await releaseAdoptedHeldRow(tx, userId, withRawNumber(claimed[0]!), r.txn, rekeyAccounts.get(r.txn.plaidAccountRowId));
            continue;
          }
          const landed = await tx
            .insert(transactions)
            .values(plaidToInsert(userId, r.txn))
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
            // needs_sync is settled by releaseSyncClaim (item-store.ts), which
            // can see whether a webhook arrived while this sync ran.
            syncFailures: 0,
            status: "active",
            errorCode: null,
          })
          .where(and(eq(plaidItems.userId, userId), eq(plaidItems.itemId, meta.itemId)));

        return { inserts, updates: plan.updates.length + rekeyed, softDeletes: plan.softDeletes.length };
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

    async clearReplayReviewFlag(accountId, reasonMarker) {
      // Marker-gated: only ever clears a flag whose stored reason still
      // contains this exact substring, so a flag from an unrelated cause
      // (e.g. sign-convention ambiguity, worded completely differently)
      // is never touched.
      await db
        .update(plaidAccounts)
        .set({ needsReview: false, reviewReason: null, reviewFlaggedAt: null, updatedAt: sql`now()` })
        .where(and(eq(plaidAccounts.accountId, accountId), like(plaidAccounts.reviewReason, `%${reasonMarker}%`)));
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
      return (await db.transaction((tx) => finalizeSignConventionIn(tx, plaidAccountRowId, convention))) !== null;
    },

    async getAutoResolveFacts(plaidAccountRowId, verdict) {
      return readAutoResolveFacts(db, plaidAccountRowId, verdict);
    },

    // Advancial replay containment only (design 2026-09-14) — the caller
    // gates this to that one confirmed institution_id; this method itself
    // has no institution opinion, it just reads/writes what it's asked.
    async findContainmentCandidates(accountId) {
      const rows = await db
        .select({
          id: transactions.id,
          contentFingerprint: transactions.contentFingerprint,
          userCategorized: transactions.userCategorized,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.accountId, accountId),
            isNull(transactions.duplicateOfId),
            isNull(transactions.removedAt),
            isNotNull(transactions.contentFingerprint),
          ),
        );
      return rows.map((r) => ({
        id: r.id,
        contentFingerprint: r.contentFingerprint!,
        userCategorized: r.userCategorized,
      }));
    },

    async applyReplayContainment(updates) {
      let marked = 0;
      for (const u of updates) {
        for (const batch of chunk(u.duplicateIds, BATCH_SIZE)) {
          const done = await db
            .update(transactions)
            .set({ duplicateOfId: u.canonicalId })
            .where(and(inArray(transactions.id, batch), isNull(transactions.duplicateOfId)))
            .returning({ id: transactions.id });
          marked += done.length;
        }
      }
      return { marked };
    },

    // Paired-transfer detection (V1.5, design: docs/specs/
    // 2026-09-16-paired-transfer-detection-design.md).
    async findTransferPairingCandidates(userId) {
      const rows = await db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          amount: transactions.amount,
          direction: transactions.direction,
          occurredAt: transactions.occurredAt,
          eventRole: transactions.eventRole,
          isTransfer: transactions.isTransfer,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.source, "bank"),
            eq(transactions.status, "confirmed"),
            eq(transactions.pending, false),
            isNull(transactions.removedAt),
            isNull(transactions.duplicateOfId),
            eq(transactions.transferUserSet, false),
            isNull(transactions.transferPairId),
            // Candidacy exclusion, not the write-time concurrency guarantee
            // (that's `transfer_pair_id IS NULL` above, re-checked again
            // under lock at write time regardless of this filter).
            or(isNull(transactions.eventRole), notInArray(transactions.eventRole, NON_TRANSFER_ROLES)),
          ),
        );
      return rows.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() }));
    },

    async applyTierALink(_userId, legA, legB) {
      return db.transaction(async (tx) => {
        const rows = await lockBothLegs(tx, legA.id, legB.id);
        if (!pairStillEligible(rows)) return "skipped";

        // Tier A: transfer_pair_id ONLY on both sides. event_role/is_transfer
        // never appear in this method's SQL — structurally incapable of
        // touching classification, not just conventionally so.
        await tx
          .update(transactions)
          .set({ transferPairId: legB.id })
          .where(and(eq(transactions.id, legA.id), isNull(transactions.transferPairId)));
        await tx
          .update(transactions)
          .set({ transferPairId: legA.id })
          .where(and(eq(transactions.id, legB.id), isNull(transactions.transferPairId)));
        return "applied";
      });
    },

    async applyTierBClassification(userId, legA, legB, classifyLegId) {
      const shapedLeg = classifyLegId === legA.id ? legB : legA;
      const unresolvedLeg = classifyLegId === legA.id ? legA : legB;

      const result = await db.transaction(async (tx) => {
        const rows = await lockBothLegs(tx, legA.id, legB.id);
        if (!pairStillEligible(rows)) return "skipped" as const;

        // Already-correct leg: link only, exactly like Tier A.
        await tx
          .update(transactions)
          .set({ transferPairId: unresolvedLeg.id })
          .where(and(eq(transactions.id, shapedLeg.id), isNull(transactions.transferPairId)));

        // Previously-unresolved leg: the ONLY write in this whole feature
        // that ever sets event_role/is_transfer, and only on this one leg.
        await tx
          .update(transactions)
          .set({ transferPairId: shapedLeg.id, isTransfer: true, eventRole: "TRANSFER" })
          .where(and(eq(transactions.id, unresolvedLeg.id), isNull(transactions.transferPairId)));

        return "applied" as const;
      });

      if (result === "applied") {
        // Structured audit trail (design: Tier B auditability) — enough to
        // reconstruct WHY, never merchant/description text. Retroactively,
        // this exact state (event_role='TRANSFER' AND transfer_pair_id IS
        // NOT NULL AND plaid_category_primary NOT IN ('TRANSFER_IN',
        // 'TRANSFER_OUT')) is unique to a Tier B write: transfer_pair_id has
        // no other writer anywhere in this codebase, and the only other path
        // to event_role='TRANSFER' (adapter.ts, via resolveEventRole) always
        // implies a TRANSFER_IN/OUT primary. That anchor breaks if anything
        // else is ever given write access to transfer_pair_id — don't add
        // one without re-deriving this audit query.
        console.log("[plaid] transfer-pairing tier-b classified", {
          tier: "B",
          userId,
          legAId: legA.id,
          legBId: legB.id,
          legAAccountId: legA.accountId,
          legBAccountId: legB.accountId,
          classifiedLegId: unresolvedLeg.id,
          amount: legA.amount,
          legADirection: legA.direction,
          legBDirection: legB.direction,
          legAOccurredAt: legA.occurredAt,
          legBOccurredAt: legB.occurredAt,
          preClassification: {
            legAEventRole: legA.eventRole,
            legBEventRole: legB.eventRole,
            legAIsTransfer: legA.isTransfer,
            legBIsTransfer: legB.isTransfer,
          },
        });
      }
      return result;
    },

    async reconcileStaleTransferPairs(userId) {
      // Single self-join UPDATE: every row `t` with a transfer_pair_id is
      // evaluated against its partner `p`. A row is cleared if ITS OWN state
      // is now invalid (removed/duplicated/user-overridden) OR its partner's
      // is, OR the relationship is no longer mutual. Because every paired
      // row is visited once as `t` (checking itself + its partner) AND once
      // more as some OTHER row's `p`, a single statement clears both
      // directions symmetrically in one pass — never leaves a surviving
      // transaction pointing at a dead/duplicate/overridden partner.
      const partner = alias(transactions, "transfer_pairing_partner");
      const cleared = await db
        .update(transactions)
        .set({ transferPairId: null })
        .from(partner)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(partner.id, transactions.transferPairId as unknown as string),
            or(
              isNotNull(transactions.removedAt),
              isNotNull(transactions.duplicateOfId),
              eq(transactions.transferUserSet, true),
              ne(partner.transferPairId, transactions.id),
              eq(partner.transferUserSet, true),
              isNotNull(partner.removedAt),
              isNotNull(partner.duplicateOfId),
            ),
          ),
        )
        .returning({ id: transactions.id });
      return cleared.length;
    },
  };
}
