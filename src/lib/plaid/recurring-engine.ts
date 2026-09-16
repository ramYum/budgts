/**
 * runRecurringDetectionForUser — the orchestration for one user's daily
 * recurring-detection pass. Pure of I/O: persistence is injected via
 * {@link RecurringStore}, so the group loop, the pure detector call, and the
 * watermark advance are all unit-tested with a fake. Design:
 * docs/specs/2026-09-16-recurring-detection-design.md.
 *
 * Descriptive metadata only — never writes amount/direction/event_role/
 * is_transfer on a transaction, never read by qualify.ts. A crash mid-run
 * simply leaves the watermark where it was; the next run re-scans the same
 * window, which is safe because every write here is an idempotent upsert
 * (see recurring-store.ts's `ON CONFLICT DO UPDATE`).
 */
import { detectRecurringSeries, type SeriesSnapshot, type SeriesUpdate } from "./recurring-detection";
import type { EventRole } from "./types";

export interface RecurringGroupKey {
  merchantEntityId: string;
  accountId: string;
  direction: "debit" | "credit";
}

export interface RecurringObservationRow {
  id: string;
  amount: number;
  occurredAt: string;
  eventRole: EventRole;
}

/** A persisted series can be MUTED too, unlike {@link SeriesSnapshot}'s
 * `status` (the pure detector only ever proposes CANDIDATE/ACTIVE — MUTED is
 * a durable user decision the store layer alone is responsible for
 * preserving, per detectRecurringSeries's docstring). */
export interface ExistingSeriesRow extends Omit<SeriesSnapshot, "status"> {
  id: string;
  status: SeriesSnapshot["status"] | "MUTED";
}

export interface RecurringStore {
  /**
   * Distinct candidacy-eligible (merchant, account, direction) groups for
   * this user, touched in `(sinceWatermark, upToScanStart]` — a closed upper
   * bound, not open-ended. This closed range is what makes the watermark
   * race-free: a transaction created strictly after `upToScanStart` is
   * guaranteed to have `created_at > newWatermark` on the NEXT run (since
   * the caller persists `upToScanStart` itself as the new watermark, never
   * a later timestamp), so it can never be silently skipped no matter when
   * it lands relative to this run's own duration. `sinceWatermark === null`
   * means "never scanned" — every eligible group up to `upToScanStart`.
   */
  findCandidateGroups(
    userId: string,
    sinceWatermark: string | null,
    upToScanStart: string,
  ): Promise<RecurringGroupKey[]>;
  /** Bounded-lookback, candidacy-filtered history for one group, any order
   * (the engine sorts). */
  loadGroupObservations(userId: string, key: RecurringGroupKey): Promise<RecurringObservationRow[]>;
  findExistingSeries(userId: string, key: RecurringGroupKey): Promise<ExistingSeriesRow | null>;
  /**
   * Idempotent upsert of the proposed update, applying the mute/override
   * guards (status frozen at MUTED; cadence/expectedAmount/tolerance frozen
   * when `overriddenByUser`), then linking `update.memberIds` via
   * `recurring_stream_id` wherever not already set. Safe under a concurrent
   * duplicate call for the same key (a real `ON CONFLICT` upsert, not a
   * check-then-write).
   */
  applySeriesUpdate(
    userId: string,
    key: RecurringGroupKey,
    update: SeriesUpdate,
    eventRole: EventRole,
    existing: ExistingSeriesRow | null,
  ): Promise<void>;
  /** Advance the user's watermark after a successful run. */
  markScanned(userId: string, at: string): Promise<void>;
}

export interface RunRecurringDetectionDeps {
  userId: string;
  /** `profiles.recurring_last_scan_at` — null means never scanned. */
  watermark: string | null;
  store: RecurringStore;
  now?: () => Date;
}

export interface RunRecurringDetectionOutcome {
  groupCount: number;
  updatedCount: number;
  newlyActiveCount: number;
  noChangeCount: number;
}

export async function runRecurringDetectionForUser(deps: RunRecurringDetectionDeps): Promise<RunRecurringDetectionOutcome> {
  const { userId, watermark, store, now = () => new Date() } = deps;

  // Captured ONCE, before discovery, and persisted as-is at the end (never a
  // later `now()`) -- this is the fix for the watermark race (review
  // finding B1): a transaction created after this exact instant is
  // therefore guaranteed `created_at > newWatermark` on the next run,
  // whether it lands one millisecond or one hour into this run's duration.
  const scanStartTime = now().toISOString();

  const groups = await store.findCandidateGroups(userId, watermark, scanStartTime);

  let updatedCount = 0;
  let newlyActiveCount = 0;
  let noChangeCount = 0;

  for (const key of groups) {
    const [observations, existing] = await Promise.all([
      store.loadGroupObservations(userId, key),
      store.findExistingSeries(userId, key),
    ]);
    if (observations.length === 0) {
      noChangeCount += 1;
      continue;
    }

    const sorted = [...observations].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
    // detectRecurringSeries never reads `.status` off `existing` (MUTED is a
    // durable decision only the store layer preserves) -- the narrower
    // SeriesSnapshot type is a safe structural view of ExistingSeriesRow.
    const result = detectRecurringSeries(sorted, existing as SeriesSnapshot | null);
    if (!result) {
      noChangeCount += 1;
      continue;
    }

    const eventRole = sorted[sorted.length - 1].eventRole;
    await store.applySeriesUpdate(userId, key, result, eventRole, existing);
    updatedCount += 1;
    if (result.status === "ACTIVE" && existing?.status !== "ACTIVE") newlyActiveCount += 1;
  }

  await store.markScanned(userId, scanStartTime);

  console.log("[plaid] recurring-detection", {
    userId,
    groupCount: groups.length,
    updatedCount,
    newlyActiveCount,
    noChangeCount,
  });

  return { groupCount: groups.length, updatedCount, newlyActiveCount, noChangeCount };
}
