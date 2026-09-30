import { describe, expect, it } from "vitest";
import { assertStagingEnv, STAGING_REF } from "../../../tools/parity/env";
import { GOALS, LONG_MERCHANT, TRANSACTIONS, monthsBefore, parityEmail, placeDay, seedDate } from "../../../tools/parity/data";

const staging = `https://${STAGING_REF}.supabase.co`;

describe("parity seed target guard", () => {
  it("accepts the staging project", () => {
    expect(() =>
      assertStagingEnv({
        NEXT_PUBLIC_SUPABASE_URL: staging,
        DATABASE_URL: `postgresql://postgres.${STAGING_REF}:pw@aws-0-ca-central-1.pooler.supabase.com:6543/postgres`,
      }),
    ).not.toThrow();
  });

  it("refuses production, whichever key names it", () => {
    expect(() => assertStagingEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://wsmhstqpvbbcqpqhiqyp.supabase.co" })).toThrow(/PRODUCTION/);
    expect(() =>
      assertStagingEnv({
        NEXT_PUBLIC_SUPABASE_URL: staging,
        DIRECT_URL: "postgresql://postgres.wsmhstqpvbbcqpqhiqyp:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
      }),
    ).toThrow(/DIRECT_URL/);
  });

  it("refuses an unknown or unparseable target, and a missing URL", () => {
    expect(() => assertStagingEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" })).toThrow(/Refusing/);
    expect(() => assertStagingEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).toThrow(/unidentifiable/);
    expect(() => assertStagingEnv({})).toThrow(/missing/);
  });
});

describe("parity ledger", () => {
  it("has 42 rows this month, income on the 1st and 15th, a transfer pair, a refund and a 40-character merchant", () => {
    const now = TRANSACTIONS.filter((t) => t.monthsBack === 0);
    expect(now).toHaveLength(42);
    expect(now.filter((t) => t.category === "Salary").map((t) => t.day).sort((a, b) => a - b)).toEqual([1, 15]);
    expect(now.filter((t) => t.isTransfer).map((t) => t.direction).sort()).toEqual(["credit", "debit"]);
    expect(now.some((t) => t.direction === "credit" && t.category === "Dining out")).toBe(true);
    expect(LONG_MERCHANT).toHaveLength(40);
    expect(new Set(TRANSACTIONS.map((t) => t.monthsBack))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
    expect(TRANSACTIONS.every((t) => t.day >= 1 && t.day <= 28)).toBe(true);
  });

  it("counts months back on the key, across a year boundary", () => {
    expect(monthsBefore("2026-02", 3)).toBe("2025-11");
    expect(seedDate("2026-01-20", 1, 5)).toBe("2025-12-05");
  });

  it("never dates a row after today, on any day of the month", () => {
    for (let d = 1; d <= 31; d++) {
      const today = `2026-10-${String(d).padStart(2, "0")}`;
      const dates = [...TRANSACTIONS.map((t) => seedDate(today, t.monthsBack, t.day)), ...GOALS.flatMap((g) => g.contributions.map((c) => seedDate(today, c.monthsBack, c.day)))];
      expect(dates.every((x) => x <= today), today).toBe(true);
      expect(dates.filter((x) => x.startsWith("2026-10")).length).toBe(TRANSACTIONS.filter((t) => t.monthsBack === 0).length + 2);
    }
  });

  it("keeps this month's rows in order, all on today on the 1st, as written from the 28th", () => {
    expect(seedDate("2026-10-01", 0, 15)).toBe("2026-10-01");
    expect(seedDate("2026-10-01", 1, 15)).toBe("2026-09-15");
    expect(seedDate("2026-09-30", 0, 15)).toBe("2026-09-15");
    expect(seedDate("2026-10-14", 0, 28)).toBe("2026-10-14");
    for (let t = 1; t <= 28; t++) for (let d = 1; d < 28; d++) expect(placeDay(d, t)).toBeLessThanOrEqual(placeDay(d + 1, t));
  });

  it("uses an undeliverable test domain", () => {
    expect(parityEmail("full")).toBe("parity+full@budgts.test");
  });
});
