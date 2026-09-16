import { describe, expect, it } from "vitest";
import {
  CADENCE_TYPICAL_DAYS,
  type Cadence,
  classifyCadence,
  computeAmountToleranceMinor,
  detectRecurringSeries,
  type RecurringObservation,
  type SeriesSnapshot,
} from "./recurring-detection";

/** Build an observation on a fixed anchor date + day offset, in UTC. */
function obs(id: string, dayOffset: number, amount = 1000): RecurringObservation {
  const d = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return { id, amount, occurredAt: d.toISOString() };
}

/** Same calendar day-of-month each month, `n` occurrences apart by `monthStep` months. */
function monthlyObs(id: string, monthOffset: number, dayOfMonth: number, amount = 1000): RecurringObservation {
  const d = new Date(Date.UTC(2026, monthOffset, dayOfMonth));
  return { id, amount, occurredAt: d.toISOString() };
}

describe("classifyCadence", () => {
  it("returns null with fewer than 2 observations", () => {
    expect(classifyCadence([])).toBeNull();
    expect(classifyCadence([obs("a", 0)])).toBeNull();
  });

  it("classifies a true weekly series (~7 days apart)", () => {
    const rows = [obs("a", 0), obs("b", 7), obs("c", 14)];
    expect(classifyCadence(rows)).toBe("WEEKLY");
  });

  it("classifies weekly within tolerance (±2 days)", () => {
    const rows = [obs("a", 0), obs("b", 8), obs("c", 15)];
    expect(classifyCadence(rows)).toBe("WEEKLY");
  });

  it("rejects weekly outside tolerance", () => {
    const rows = [obs("a", 0), obs("b", 10), obs("c", 20)];
    expect(classifyCadence(rows)).not.toBe("WEEKLY");
  });

  it("classifies a true biweekly series (~14 days apart, drifting day-of-month)", () => {
    const rows = [obs("a", 0), obs("b", 14), obs("c", 28)];
    expect(classifyCadence(rows)).toBe("BIWEEKLY");
  });

  it("classifies a true monthly series using real elapsed days, surviving month-length variance", () => {
    // Jan 31 -> Feb 28 (28 days) -> Mar 31 (31 days): true monthly billing
    // across months of different lengths, real elapsed days only (no
    // synthetic day-of-month wraparound math needed).
    const rows = [monthlyObs("a", 0, 31), monthlyObs("b", 1, 28), monthlyObs("c", 2, 31)];
    expect(classifyCadence(rows)).toBe("MONTHLY");
  });

  it("classifies an annual series (~365 days apart)", () => {
    const rows = [obs("a", 0), obs("b", 365), obs("c", 730)];
    expect(classifyCadence(rows)).toBe("ANNUAL");
  });

  it("classifies semimonthly (fixed ~1st and ~15th each month) distinctly from biweekly", () => {
    const rows = [
      monthlyObs("a", 0, 1),
      monthlyObs("b", 0, 15),
      monthlyObs("c", 1, 1),
      monthlyObs("d", 1, 15),
    ];
    expect(classifyCadence(rows)).toBe("SEMIMONTHLY");
  });

  it("classifies uniform ~14-day gaps with drifting day-of-month as biweekly, not semimonthly", () => {
    // day-of-month drifts: 1, 15, 29, 12 -- never clusters into 2 fixed days
    const rows = [obs("a", 0), obs("b", 14), obs("c", 28), obs("d", 42)];
    const days = rows.map((r) => new Date(r.occurredAt).getUTCDate());
    expect(new Set(days).size).toBeGreaterThan(2);
    expect(classifyCadence(rows)).toBe("BIWEEKLY");
  });

  it("semimonthly vs biweekly tie-break: identical ~14-16 day gaps resolve to SEMIMONTHLY when days-of-month cluster to 2 values", () => {
    // 1st and 16th every month -> gaps of 15 and 16 (both inside the
    // semimonthly AND biweekly numeric bands) -- semimonthly wins because
    // it's checked first and its day-of-month test passes.
    const rows = [monthlyObs("a", 0, 1), monthlyObs("b", 0, 16), monthlyObs("c", 1, 1)];
    expect(classifyCadence(rows)).toBe("SEMIMONTHLY");
  });

  it("returns null when no band fits (irregular gaps)", () => {
    const rows = [obs("a", 0), obs("b", 3), obs("c", 40)];
    expect(classifyCadence(rows)).toBeNull();
  });

  it("uses only the trailing 3 observations (2 gaps) to classify", () => {
    // Older history is monthly-ish, but the trailing 2 gaps are weekly --
    // classification must follow the trailing window, not the whole history.
    const rows = [monthlyObs("a", 0, 1), monthlyObs("b", 1, 1), obs("c", 45), obs("d", 52), obs("e", 59)];
    expect(classifyCadence(rows)).toBe("WEEKLY");
  });
});

describe("computeAmountToleranceMinor", () => {
  it("is the larger of 7% relative and $3 absolute", () => {
    expect(computeAmountToleranceMinor(1000)).toBe(300); // 7% of 1000 = 70 -> $3 floor wins
    expect(computeAmountToleranceMinor(10000)).toBe(700); // 7% of 10000 = 700 -> wins over $3
  });

  it("is deterministic and depends only on the amount (not observed history)", () => {
    expect(computeAmountToleranceMinor(5000)).toBe(computeAmountToleranceMinor(5000));
  });
});

describe("detectRecurringSeries — end to end", () => {
  const noExisting: SeriesSnapshot | null = null;

  it("returns null (no series) with fewer than 2 observations", () => {
    expect(detectRecurringSeries([obs("a", 0)], noExisting)).toBeNull();
  });

  it("promotes to CANDIDATE (not ACTIVE) with exactly 2 confirming observations", () => {
    const result = detectRecurringSeries([obs("a", 0), obs("b", 30)], noExisting);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("CANDIDATE");
    expect(result!.observationCount).toBe(2);
    expect(result!.cadence).toBe("MONTHLY");
  });

  it("promotes to ACTIVE only at 3 matching occurrences (2 confirmed intervals)", () => {
    const two = detectRecurringSeries([obs("a", 0), obs("b", 30)], noExisting);
    expect(two!.status).toBe("CANDIDATE");
    const three = detectRecurringSeries([obs("a", 0), obs("b", 30), obs("c", 60)], noExisting);
    expect(three!.status).toBe("ACTIVE");
    expect(three!.observationCount).toBe(3);
  });

  it("computes nextExpectedAt as lastOccurredAt + the cadence's typical days", () => {
    const rows = [obs("a", 0), obs("b", 7), obs("c", 14)];
    const result = detectRecurringSeries(rows, noExisting)!;
    const expected = new Date(rows[2].occurredAt);
    expected.setUTCDate(expected.getUTCDate() + CADENCE_TYPICAL_DAYS.WEEKLY);
    expect(result.nextExpectedAt).toBe(expected.toISOString());
  });

  it("includes every matched observation id as a member to link", () => {
    const rows = [obs("a", 0), obs("b", 7), obs("c", 14)];
    const result = detectRecurringSeries(rows, noExisting)!;
    expect(result.memberIds.sort()).toEqual(["a", "b", "c"]);
  });

  describe("amount tolerance", () => {
    it("a new observation within tolerance extends the series and becomes the new expected amount", () => {
      const rows = [obs("a", 0, 1000), obs("b", 30, 1000), obs("c", 60, 1050)]; // +5%, within 7%
      const result = detectRecurringSeries(rows, noExisting)!;
      expect(result.memberIds).toContain("c");
      expect(result.expectedAmount).toBe(1050);
    });

    it("a new observation outside tolerance is excluded as a member (does not join or break the series)", () => {
      const rows = [obs("a", 0, 1000), obs("b", 30, 1000), obs("c", 55, 5000), obs("d", 60, 1010)];
      const result = detectRecurringSeries(rows, noExisting)!;
      expect(result.memberIds).not.toContain("c");
      expect(result.memberIds).toEqual(expect.arrayContaining(["a", "b", "d"]));
      expect(result.expectedAmount).toBe(1010);
    });

    it("at the exact tolerance boundary, the observation is included", () => {
      const tol = computeAmountToleranceMinor(1000);
      const rows = [obs("a", 0, 1000), obs("b", 30, 1000 + tol)];
      const result = detectRecurringSeries(rows, noExisting)!;
      expect(result.memberIds).toContain("b");
    });

    it("just past the tolerance boundary, the observation is excluded", () => {
      const tol = computeAmountToleranceMinor(1000);
      const rows = [obs("a", 0, 1000), obs("b", 30, 1000 + tol + 1)];
      const result = detectRecurringSeries(rows, noExisting);
      // only "a" remains a member; fewer than 2 members -> no series
      expect(result).toBeNull();
    });
  });

  describe("gap-break reset", () => {
    it("a gap exceeding 3x the existing cadence resets the window instead of averaging across it", () => {
      const existing: SeriesSnapshot = {
        cadence: "MONTHLY",
        expectedAmount: 1000,
        amountToleranceMinor: computeAmountToleranceMinor(1000),
        observationCount: 3,
        status: "ACTIVE",
        overriddenByUser: false,
      };
      // last known monthly occurrence at day 60; then a ~300 day silence
      // (>> 3x30d), then two fresh weekly-cadence occurrences.
      const rows = [obs("a", 0), obs("b", 30), obs("c", 60), obs("d", 400), obs("e", 407), obs("f", 414)];
      const result = detectRecurringSeries(rows, existing)!;
      expect(result.cadence).toBe("WEEKLY");
      expect(result.memberIds.sort()).toEqual(["d", "e", "f"]);
      expect(result.observationCount).toBe(3);
    });

    it("without an existing series, no gap-break is applied on the very first promotion", () => {
      const rows = [obs("a", 0), obs("b", 200)]; // huge gap, no prior cadence to break from
      // classifies as null (200 days fits no band) -- correct: nothing to
      // break FROM, it just fails to classify, which is the safe default.
      expect(detectRecurringSeries(rows, noExisting)).toBeNull();
    });
  });

  describe("membership validation (B2 review fix)", () => {
    it("REGRESSION (review B2): five same-amount observations where the first two are 3 days apart and the final three are ~monthly must NOT all count as confirmed members", () => {
      const rows = [obs("old1", 0), obs("old2", 3), obs("m1", 400), obs("m2", 430), obs("m3", 460)];
      const result = detectRecurringSeries(rows, noExisting)!;
      expect(result).not.toBeNull();
      expect(result.cadence).toBe("MONTHLY");
      // The two unrelated old observations must be excluded -- only the
      // genuinely monthly-spaced trio counts.
      expect(result.memberIds.sort()).toEqual(["m1", "m2", "m3"]);
      expect(result.observationCount).toBe(3);
      expect(result.status).toBe("ACTIVE");
    });

    it("historical observations with an irregular gap before a genuine weekly run are excluded from membership", () => {
      // "old" is 40 days before the first genuinely weekly occurrence --
      // same amount (passes the amount-consistency chain) but no cadence
      // relationship to the weekly trio that follows.
      const rows = [obs("old", 0), obs("w1", 40), obs("w2", 47), obs("w3", 54)];
      const result = detectRecurringSeries(rows, noExisting)!;
      expect(result.cadence).toBe("WEEKLY");
      expect(result.memberIds.sort()).toEqual(["w1", "w2", "w3"]);
      expect(result.observationCount).toBe(3);
    });

    it("a long, fully self-consistent run keeps every observation as a validated member (no false truncation of a genuine series)", () => {
      const rows = [obs("a", 0), obs("b", 7), obs("c", 14), obs("d", 21), obs("e", 28)];
      const result = detectRecurringSeries(rows, noExisting)!;
      expect(result.cadence).toBe("WEEKLY");
      expect(result.memberIds.sort()).toEqual(["a", "b", "c", "d", "e"]);
      expect(result.observationCount).toBe(5);
    });

    it("validation truncates from the earliest point where a consecutive gap stops fitting, keeping the maximal valid suffix", () => {
      // a->b is a 40-day outlier gap; b, c, d are genuinely monthly.
      const rows = [obs("a", 0), obs("b", 40), obs("c", 70), obs("d", 100)];
      const result = detectRecurringSeries(rows, noExisting)!;
      expect(result.cadence).toBe("MONTHLY");
      expect(result.memberIds.sort()).toEqual(["b", "c", "d"]);
      expect(result.observationCount).toBe(3);
    });

    it("SEMIMONTHLY: a longer run whose day-of-month pattern no longer holds across its full span falls back to the minimal validated trailing window", () => {
      // Every consecutive gap numerically fits the SEMIMONTHLY band
      // (14,17,17,14,14 days), so the gap-based walk alone would keep all
      // 6 -- but the day-of-month values across the full run form 4
      // distinct clusters (1st, 15th, 4th, 18th), not the fixed-two-days
      // signature a genuine semimonthly bill has. Only the trailing 3
      // (18th, 4th, 18th -- 2 clusters) actually pass the pattern check.
      const rows = [
        monthlyObs("a", 0, 1),
        monthlyObs("b", 0, 15),
        monthlyObs("c", 1, 1),
        monthlyObs("d", 1, 18),
        monthlyObs("e", 2, 4),
        monthlyObs("f", 2, 18),
      ];
      const result = detectRecurringSeries(rows, noExisting)!;
      expect(result.cadence).toBe("SEMIMONTHLY");
      // Falls back to the minimal trailing-3 window rather than claiming
      // all 6 as validated members of one consistent semimonthly pattern.
      expect(result.observationCount).toBe(3);
      expect(result.memberIds.sort()).toEqual(["d", "e", "f"]);
    });
  });

  describe("cadence-change re-verification", () => {
    it("a single coincidental match under a new cadence proposes no update at all -- the caller leaves the stored cadence untouched", () => {
      const existing: SeriesSnapshot = {
        cadence: "MONTHLY",
        expectedAmount: 1000,
        amountToleranceMinor: computeAmountToleranceMinor(1000),
        observationCount: 3,
        status: "ACTIVE",
        overriddenByUser: false,
      };
      // Three monthly occurrences, then one that happens to land a week
      // after the last one (a single coincidental weekly-looking gap).
      // classifyCadence's trailing-2-gap window is [30, 7] -- neither
      // monthly nor weekly fits both, so classification correctly fails
      // outright (null) rather than fabricating a switch from one
      // coincidence. The store layer's contract for a null result is to
      // leave the existing row exactly as it was.
      const rows = [obs("a", 0), obs("b", 30), obs("c", 60), obs("d", 67)];
      const result = detectRecurringSeries(rows, existing);
      expect(result).toBeNull();
    });

    it("two consecutive confirming gaps under a new cadence do switch it", () => {
      const existing: SeriesSnapshot = {
        cadence: "MONTHLY",
        expectedAmount: 1000,
        amountToleranceMinor: computeAmountToleranceMinor(1000),
        observationCount: 3,
        status: "ACTIVE",
        overriddenByUser: false,
      };
      const rows = [obs("a", 0), obs("b", 30), obs("c", 60), obs("d", 67), obs("e", 74)];
      const result = detectRecurringSeries(rows, existing)!;
      expect(result.cadence).toBe("WEEKLY");
    });
  });

  describe("user override / mute guard (pure function proposes; store applies the guard)", () => {
    it("still proposes an update even when the caller marks the existing series overridden -- the guard is the store's job, not this function's", () => {
      const existing: SeriesSnapshot = {
        cadence: "MONTHLY",
        expectedAmount: 1000,
        amountToleranceMinor: computeAmountToleranceMinor(1000),
        observationCount: 3,
        status: "ACTIVE",
        overriddenByUser: true,
      };
      const rows = [obs("a", 0), obs("b", 30), obs("c", 60)];
      const result = detectRecurringSeries(rows, existing);
      expect(result).not.toBeNull();
    });
  });
});

describe("CADENCE_TYPICAL_DAYS", () => {
  it("has an entry for every cadence", () => {
    const cadences: Cadence[] = ["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY", "ANNUAL"];
    for (const c of cadences) expect(CADENCE_TYPICAL_DAYS[c]).toBeGreaterThan(0);
  });
});
