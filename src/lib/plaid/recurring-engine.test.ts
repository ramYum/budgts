import { describe, expect, it } from "vitest";
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

function row(id: string, dayOffset: number, amount = 1000): RecurringObservationRow {
  const d = new Date(Date.UTC(2026, 0, 1));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return { id, amount, occurredAt: d.toISOString(), eventRole: "PURCHASE" };
}

function fakeStore(opts: {
  groups?: RecurringGroupKey[];
  observations?: RecurringObservationRow[];
  existing?: ExistingSeriesRow | null;
}) {
  const calls = {
    applySeriesUpdate: [] as Array<{ key: RecurringGroupKey; update: SeriesUpdate; eventRole: string }>,
    markScanned: [] as string[],
    findCandidateGroupsArgs: [] as (string | null)[],
  };
  const store: RecurringStore = {
    async findCandidateGroups(_userId, sinceWatermark) {
      calls.findCandidateGroupsArgs.push(sinceWatermark);
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
  it("passes the watermark through to findCandidateGroups", async () => {
    const { store, calls } = fakeStore({ groups: [] });
    await runRecurringDetectionForUser({ userId: "u1", watermark: "2026-09-01T00:00:00.000Z", store });
    expect(calls.findCandidateGroupsArgs).toEqual(["2026-09-01T00:00:00.000Z"]);
  });

  it("passes null watermark through untouched (never scanned)", async () => {
    const { store, calls } = fakeStore({ groups: [] });
    await runRecurringDetectionForUser({ userId: "u1", watermark: null, store });
    expect(calls.findCandidateGroupsArgs).toEqual([null]);
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
