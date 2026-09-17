import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ExistingSeriesRow,
  type RecurringGroupKey,
  type RecurringObservationRow,
  type RecurringStore,
  runRecurringDetectionForUser,
} from "./recurring-engine";
import { computeAmountToleranceMinor } from "./recurring-detection";
import type { SeriesUpdate } from "./recurring-detection";

const KEY: RecurringGroupKey = { merchantEntityId: "m1", accountId: "acct1", direction: "debit" };

function row(
  id: string,
  dayOffset: number,
  amount = 1000,
  category: { primary?: string | null; detailed?: string | null } = {},
): RecurringObservationRow {
  const d = new Date(Date.UTC(2026, 0, 1));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return {
    id,
    amount,
    occurredAt: d.toISOString(),
    eventRole: "PURCHASE",
    plaidCategoryPrimary: category.primary ?? null,
    plaidCategoryDetailed: category.detailed ?? null,
  };
}

function fakeStore(opts: {
  groups?: RecurringGroupKey[];
  observations?: RecurringObservationRow[];
  existing?: ExistingSeriesRow | null;
}) {
  const calls = {
    applySeriesUpdate: [] as Array<{ key: RecurringGroupKey; update: SeriesUpdate; eventRole: string }>,
    markScanned: [] as string[],
    findCandidateGroupsArgs: [] as { since: string | null; upTo: string }[],
  };
  const store: RecurringStore = {
    async findCandidateGroups(_userId, sinceWatermark, upToScanStart) {
      calls.findCandidateGroupsArgs.push({ since: sinceWatermark, upTo: upToScanStart });
      return opts.groups ?? [KEY];
    },
    async loadGroupObservations() {
      return opts.observations ?? [];
    },
    async findExistingSeries() {
      return opts.existing ?? null;
    },
    async applySeriesUpdate(_userId, key, update, eventRole) {
      calls.applySeriesUpdate.push({ key, update, eventRole });
    },
    async markScanned(_userId, at) {
      calls.markScanned.push(at);
    },
  };
  return { store, calls };
}

describe("runRecurringDetectionForUser", () => {
  it("passes the watermark through to findCandidateGroups, bounded by a captured scanStartTime", async () => {
    const { store, calls } = fakeStore({ groups: [] });
    const fixedNow = () => new Date("2026-09-20T00:00:00.000Z");
    await runRecurringDetectionForUser({
      userId: "u1",
      watermark: "2026-09-01T00:00:00.000Z",
      store,
      now: fixedNow,
    });
    expect(calls.findCandidateGroupsArgs).toEqual([
      { since: "2026-09-01T00:00:00.000Z", upTo: "2026-09-20T00:00:00.000Z" },
    ]);
  });

  it("passes null watermark through untouched (never scanned)", async () => {
    const { store, calls } = fakeStore({ groups: [] });
    const fixedNow = () => new Date("2026-09-20T00:00:00.000Z");
    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store, now: fixedNow });
    expect(calls.findCandidateGroupsArgs).toEqual([{ since: null, upTo: "2026-09-20T00:00:00.000Z" }]);
  });

  it("B1 fix: persists the SAME scanStartTime it queried with as the new watermark, never a later now()", async () => {
    const { store, calls } = fakeStore({ groups: [] });
    let callCount = 0;
    // A `now` that would expose the bug if the code called it twice --
    // second and later calls return a much later time.
    const drifting = () => {
      callCount += 1;
      return callCount === 1 ? new Date("2026-09-20T00:00:00.000Z") : new Date("2026-09-20T00:10:00.000Z");
    };
    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store, now: drifting });
    expect(calls.findCandidateGroupsArgs[0].upTo).toBe("2026-09-20T00:00:00.000Z");
    // The persisted watermark must equal the FIRST (discovery-time) value,
    // not a later one -- this is exactly what B1 requires.
    expect(calls.markScanned).toEqual(["2026-09-20T00:00:00.000Z"]);
  });

  it("B1 REGRESSION: a transaction created during the scan is missed by this run but detected by the next run, never permanently skipped", async () => {
    // A minimal stateful fake mirroring the real store's (since, upTo]
    // semantics exactly, so this test genuinely exercises the watermark
    // contract rather than asserting against a canned return value.
    interface FakeTxn {
      key: RecurringGroupKey;
      createdAt: string;
      observations: RecurringObservationRow[];
    }
    const txns: FakeTxn[] = [
      {
        key: KEY,
        createdAt: "2026-09-01T00:00:00.000Z",
        observations: [row("a", 0), row("b", 30), row("c", 60)],
      },
    ];
    const midScanKey: RecurringGroupKey = { merchantEntityId: "m2", accountId: "acct1", direction: "debit" };
    let insertedMidScan = false;

    const store: RecurringStore = {
      async findCandidateGroups(_userId, since, upTo) {
        const sinceMs = since ? new Date(since).getTime() : -Infinity;
        const upToMs = new Date(upTo).getTime();
        const seen = new Set<string>();
        const keys: RecurringGroupKey[] = [];
        for (const t of txns) {
          const createdMs = new Date(t.createdAt).getTime();
          if (createdMs > sinceMs && createdMs <= upToMs) {
            const k = `${t.key.merchantEntityId}:${t.key.accountId}:${t.key.direction}`;
            if (!seen.has(k)) {
              seen.add(k);
              keys.push(t.key);
            }
          }
        }
        return keys;
      },
      async loadGroupObservations(_userId, key) {
        // Simulate a transaction landing mid-scan, AFTER discovery already
        // ran for this call, by inserting it as a side effect here (the
        // real-world equivalent: a concurrent Plaid sync commits while this
        // scan is still iterating its already-discovered groups).
        if (!insertedMidScan) {
          insertedMidScan = true;
          txns.push({
            key: midScanKey,
            createdAt: "2026-09-01T00:05:00.000Z", // after scanStartTime below
            observations: [row("x", 0), row("y", 30), row("z", 60)],
          });
        }
        const match = txns.find(
          (t) =>
            t.key.merchantEntityId === key.merchantEntityId &&
            t.key.accountId === key.accountId &&
            t.key.direction === key.direction,
        );
        return match?.observations ?? [];
      },
      async findExistingSeries() {
        return null;
      },
      async applySeriesUpdate() {},
      async markScanned() {},
    };

    // Run 1: scanStartTime = 00:00:00, i.e. BEFORE the mid-scan transaction
    // (00:05:00) lands. Only the original group is discovered.
    const run1 = await runRecurringDetectionForUser({
      userId: "u1",
      watermark: null,
      store,
      now: () => new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(run1.groupCount).toBe(1); // midScanKey not yet visible to discovery
    expect(insertedMidScan).toBe(true); // but it landed during this run

    // Run 2: watermark = run 1's scanStartTime (00:00:00) -- exactly what
    // the engine would have persisted. The mid-scan transaction's
    // createdAt (00:05:00) is strictly after that watermark, so it MUST
    // surface now, not be permanently skipped.
    const run2 = await runRecurringDetectionForUser({
      userId: "u1",
      watermark: "2026-09-01T00:00:00.000Z",
      store,
      now: () => new Date("2026-09-01T01:00:00.000Z"),
    });
    expect(run2.groupCount).toBe(1);
    expect(run2.updatedCount).toBe(1); // the mid-scan group forms a valid series
  });

  it("skips a group with zero observations without calling applySeriesUpdate", async () => {
    const { store, calls } = fakeStore({ groups: [KEY], observations: [] });
    const outcome = await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });
    expect(calls.applySeriesUpdate).toHaveLength(0);
    expect(outcome.noChangeCount).toBe(1);
  });

  it("skips a group whose observations don't form a valid series (detector returns null)", async () => {
    const { store, calls } = fakeStore({ groups: [KEY], observations: [row("a", 0)] }); // only 1 obs
    const outcome = await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });
    expect(calls.applySeriesUpdate).toHaveLength(0);
    expect(outcome.noChangeCount).toBe(1);
  });

  it("applies an update for a group that forms a valid series, using the most recent observation's eventRole", async () => {
    const observations = [row("a", 0), row("b", 30), row("c", 60)];
    const { store, calls } = fakeStore({ groups: [KEY], observations });
    const outcome = await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });
    expect(calls.applySeriesUpdate).toHaveLength(1);
    expect(calls.applySeriesUpdate[0].key).toEqual(KEY);
    expect(calls.applySeriesUpdate[0].eventRole).toBe("PURCHASE");
    expect(outcome.updatedCount).toBe(1);
  });

  it("counts a CANDIDATE->ACTIVE transition as newlyActive", async () => {
    const observations = [row("a", 0), row("b", 30), row("c", 60)];
    const existing: ExistingSeriesRow = {
      id: "series1",
      cadence: "MONTHLY",
      expectedAmount: 1000,
      amountToleranceMinor: computeAmountToleranceMinor(1000),
      observationCount: 2,
      status: "CANDIDATE",
      overriddenByUser: false,
    };
    const { store } = fakeStore({ groups: [KEY], observations, existing });
    const outcome = await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });
    expect(outcome.newlyActiveCount).toBe(1);
  });

  it("does not double-count an already-ACTIVE series as newly active", async () => {
    const observations = [row("a", 0), row("b", 30), row("c", 60), row("d", 90)];
    const existing: ExistingSeriesRow = {
      id: "series1",
      cadence: "MONTHLY",
      expectedAmount: 1000,
      amountToleranceMinor: computeAmountToleranceMinor(1000),
      observationCount: 3,
      status: "ACTIVE",
      overriddenByUser: false,
    };
    const { store } = fakeStore({ groups: [KEY], observations, existing });
    const outcome = await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });
    expect(outcome.newlyActiveCount).toBe(0);
    expect(outcome.updatedCount).toBe(1);
  });

  it("always marks the user scanned, even with zero candidate groups", async () => {
    const { store, calls } = fakeStore({ groups: [] });
    const fixedNow = () => new Date("2026-09-20T00:00:00.000Z");
    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store, now: fixedNow });
    expect(calls.markScanned).toEqual(["2026-09-20T00:00:00.000Z"]);
  });

  it("evaluates multiple groups independently in one run", async () => {
    const keyB: RecurringGroupKey = { merchantEntityId: "m2", accountId: "acct1", direction: "debit" };
    const calls: string[] = [];
    const store: RecurringStore = {
      async findCandidateGroups() {
        return [KEY, keyB];
      },
      async loadGroupObservations(_userId, key) {
        calls.push(key.merchantEntityId);
        return key.merchantEntityId === "m1" ? [row("a", 0), row("b", 30), row("c", 60)] : [row("x", 0)];
      },
      async findExistingSeries() {
        return null;
      },
      async applySeriesUpdate() {},
      async markScanned() {},
    };
    const outcome = await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });
    expect(calls.sort()).toEqual(["m1", "m2"]);
    expect(outcome.groupCount).toBe(2);
    expect(outcome.updatedCount).toBe(1); // only m1 forms a valid series
    expect(outcome.noChangeCount).toBe(1); // m2 has only 1 observation
  });
});

describe("subscription detection (V1.5) — classification layer, no effect on recurring detection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("REGRESSION: RunRecurringDetectionOutcome is byte-identical whether or not the underlying observations carry subscription-qualifying category evidence", async () => {
    const withoutCategory = [row("a", 0), row("b", 30), row("c", 60)];
    const withCategory = [
      row("a", 0, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
      row("b", 30, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
      row("c", 60, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
    ];

    const { store: storeA } = fakeStore({ groups: [KEY], observations: withoutCategory });
    const { store: storeB } = fakeStore({ groups: [KEY], observations: withCategory });

    const outcomeA = await runRecurringDetectionForUser({ userId: "u1", watermark: null, store: storeA });
    const outcomeB = await runRecurringDetectionForUser({ userId: "u1", watermark: null, store: storeB });

    expect(outcomeB).toEqual(outcomeA);
  });

  it("logs a subscription-detection line for an ACTIVE, PURCHASE, trusted-category series", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const observations = [
      row("a", 0, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
      row("b", 30, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
      row("c", 60, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
    ];
    const { store } = fakeStore({ groups: [KEY], observations });

    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });

    const subscriptionLogs = logSpy.mock.calls.filter((call) => call[0] === "[plaid] subscription-detection");
    expect(subscriptionLogs).toHaveLength(1);
    expect(subscriptionLogs[0][1]).toMatchObject({ userId: "u1", merchantEntityId: "m1" });
  });

  it("does not log a subscription-detection line for a series without trusted category evidence", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const observations = [row("a", 0), row("b", 30), row("c", 60)]; // no category evidence at all
    const { store } = fakeStore({ groups: [KEY], observations });

    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });

    const subscriptionLogs = logSpy.mock.calls.filter((call) => call[0] === "[plaid] subscription-detection");
    expect(subscriptionLogs).toHaveLength(0);
  });

  it("does not log a subscription-detection line for a MUTED series, even with perfect category evidence", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const observations = [
      row("a", 0, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
      row("b", 30, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
      row("c", 60, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
    ];
    const existing: ExistingSeriesRow = {
      id: "series1",
      cadence: "MONTHLY",
      expectedAmount: 1000,
      amountToleranceMinor: computeAmountToleranceMinor(1000),
      observationCount: 3,
      status: "MUTED",
      overriddenByUser: false,
    };
    const { store } = fakeStore({ groups: [KEY], observations, existing });

    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });

    const subscriptionLogs = logSpy.mock.calls.filter((call) => call[0] === "[plaid] subscription-detection");
    expect(subscriptionLogs).toHaveLength(0);
  });

  it("does not log a subscription-detection line for a CANDIDATE series (only 2 observations), even with perfect category evidence", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const observations = [
      row("a", 0, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
      row("b", 30, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
    ];
    const { store } = fakeStore({ groups: [KEY], observations });

    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });

    const subscriptionLogs = logSpy.mock.calls.filter((call) => call[0] === "[plaid] subscription-detection");
    expect(subscriptionLogs).toHaveLength(0);
  });
});

describe("bill detection (V1.5) — classification layer, no effect on recurring or subscription detection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("REGRESSION: RunRecurringDetectionOutcome is byte-identical whether or not the underlying observations carry bill-qualifying category evidence", async () => {
    const withoutCategory = [row("a", 0), row("b", 30), row("c", 60)];
    const withCategory = [
      row("a", 0, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_RENT" }),
      row("b", 30, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_RENT" }),
      row("c", 60, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_RENT" }),
    ];

    const { store: storeA } = fakeStore({ groups: [KEY], observations: withoutCategory });
    const { store: storeB } = fakeStore({ groups: [KEY], observations: withCategory });

    const outcomeA = await runRecurringDetectionForUser({ userId: "u1", watermark: null, store: storeA });
    const outcomeB = await runRecurringDetectionForUser({ userId: "u1", watermark: null, store: storeB });

    expect(outcomeB).toEqual(outcomeA);
  });

  it("logs a bill-detection line for an ACTIVE, PURCHASE, trusted RENT_AND_UTILITIES series", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const observations = [
      row("a", 0, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_INTERNET_AND_CABLE" }),
      row("b", 30, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_INTERNET_AND_CABLE" }),
      row("c", 60, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_INTERNET_AND_CABLE" }),
    ];
    const { store } = fakeStore({ groups: [KEY], observations });

    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });

    const billLogs = logSpy.mock.calls.filter((call) => call[0] === "[plaid] bill-detection");
    expect(billLogs).toHaveLength(1);
    expect(billLogs[0][1]).toMatchObject({ userId: "u1", merchantEntityId: "m1" });
  });

  it("does not log a bill-detection line for a series without trusted category evidence", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const observations = [row("a", 0), row("b", 30), row("c", 60)]; // no category evidence at all
    const { store } = fakeStore({ groups: [KEY], observations });

    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });

    const billLogs = logSpy.mock.calls.filter((call) => call[0] === "[plaid] bill-detection");
    expect(billLogs).toHaveLength(0);
  });

  it("does not log a bill-detection line for a MUTED series, even with perfect bill evidence", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const observations = [
      row("a", 0, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_RENT" }),
      row("b", 30, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_RENT" }),
      row("c", 60, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_RENT" }),
    ];
    const existing: ExistingSeriesRow = {
      id: "series1",
      cadence: "MONTHLY",
      expectedAmount: 1000,
      amountToleranceMinor: computeAmountToleranceMinor(1000),
      observationCount: 3,
      status: "MUTED",
      overriddenByUser: false,
    };
    const { store } = fakeStore({ groups: [KEY], observations, existing });

    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });

    const billLogs = logSpy.mock.calls.filter((call) => call[0] === "[plaid] bill-detection");
    expect(billLogs).toHaveLength(0);
  });

  it("does not log a bill-detection line for a CANDIDATE series (only 2 observations), even with perfect bill evidence", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const observations = [
      row("a", 0, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_RENT" }),
      row("b", 30, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_RENT" }),
    ];
    const { store } = fakeStore({ groups: [KEY], observations });

    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });

    const billLogs = logSpy.mock.calls.filter((call) => call[0] === "[plaid] bill-detection");
    expect(billLogs).toHaveLength(0);
  });

  it("subscription precedence: an ACTIVE, PURCHASE, trusted-SUBSCRIPTION-category series logs subscription-detection and never bill-detection", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const observations = [
      row("a", 0, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
      row("b", 30, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
      row("c", 60, 1000, { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
    ];
    const { store } = fakeStore({ groups: [KEY], observations });

    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });

    const subscriptionLogs = logSpy.mock.calls.filter((call) => call[0] === "[plaid] subscription-detection");
    const billLogs = logSpy.mock.calls.filter((call) => call[0] === "[plaid] bill-detection");
    expect(subscriptionLogs).toHaveLength(1);
    expect(billLogs).toHaveLength(0);
  });

  it("a trusted-BILL-category series logs bill-detection and never subscription-detection", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const observations = [
      row("a", 0, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_WATER" }),
      row("b", 30, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_WATER" }),
      row("c", 60, 1000, { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_WATER" }),
    ];
    const { store } = fakeStore({ groups: [KEY], observations });

    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });

    const subscriptionLogs = logSpy.mock.calls.filter((call) => call[0] === "[plaid] subscription-detection");
    const billLogs = logSpy.mock.calls.filter((call) => call[0] === "[plaid] bill-detection");
    expect(subscriptionLogs).toHaveLength(0);
    expect(billLogs).toHaveLength(1);
  });
});
