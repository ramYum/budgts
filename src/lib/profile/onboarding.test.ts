import { describe, expect, it } from "vitest";
import { completeOnboarding, loadProfile, saveTimeZone } from "./onboarding";

type Row = { currency: string; onboarded_at: string | null; time_zone: string | null } | null;

/** A minimal PostgREST-shaped fake: records the update it was asked to make. */
function fake(opts: { row?: Row; updated?: { id: string }[]; updateError?: boolean; readError?: boolean }) {
  const calls: { update?: Record<string, unknown>; isNull?: string; eq?: [string, string] } = {};
  const supabase = {
    from: (table: string) => {
      expect(table).toBe("profiles");
      return {
        update: (values: Record<string, unknown>) => {
          calls.update = values;
          const chain = {
            eq: (col: string, val: string) => {
              calls.eq = [col, val];
              return chain;
            },
            is: (col: string, val: null) => {
              expect(val).toBeNull();
              calls.isNull = col;
              return chain;
            },
            select: async () =>
              opts.updateError ? { data: null, error: { message: "boom" } } : { data: opts.updated ?? [], error: null },
          };
          return chain;
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              opts.readError ? { data: null, error: { message: "boom" } } : { data: opts.row ?? null, error: null },
          }),
        }),
      };
    },
  };
  return { supabase: supabase as never, calls };
}

const NOW = new Date("2026-09-21T12:00:00.000Z");
const ZONE = "Europe/Paris";

describe("loadProfile", () => {
  it("reports currency, whether onboarding is complete, and the stored time zone", async () => {
    const { supabase } = fake({ row: { currency: "CAD", onboarded_at: "2026-09-01T00:00:00Z", time_zone: "America/Toronto" } });
    expect(await loadProfile(supabase, "u")).toEqual({ currency: "CAD", onboarded: true, timeZone: "America/Toronto" });
  });

  it("treats a null onboarded_at as not onboarded", async () => {
    const { supabase } = fake({ row: { currency: "USD", onboarded_at: null, time_zone: null } });
    expect(await loadProfile(supabase, "u")).toEqual({ currency: "USD", onboarded: false, timeZone: null });
  });

  it("returns null when there is no profile row", async () => {
    expect(await loadProfile(fake({ row: null }).supabase, "u")).toBeNull();
  });

  it("throws on a read error rather than reporting a wrong state", async () => {
    await expect(loadProfile(fake({ readError: true }).supabase, "u")).rejects.toThrow();
  });
});

describe("completeOnboarding", () => {
  it("saves the currency and time zone once, only for a not-yet-onboarded profile", async () => {
    const { supabase, calls } = fake({ updated: [{ id: "u" }] });

    const r = await completeOnboarding(supabase, "u", { currency: "EUR", time_zone: ZONE }, NOW);

    expect(r).toEqual({ ok: true, currency: "EUR", timeZone: ZONE });
    expect(calls.update).toEqual({ currency: "EUR", time_zone: ZONE, onboarded_at: NOW.toISOString() });
    expect(calls.eq).toEqual(["id", "u"]);
    expect(calls.isNull).toBe("onboarded_at"); // the currency is set once: never overwritten afterwards
  });

  it("rejects a currency outside the supported list without touching the database", async () => {
    const { supabase, calls } = fake({});
    expect(await completeOnboarding(supabase, "u", { currency: "JPY", time_zone: ZONE }, NOW)).toEqual({
      ok: false,
      error: "invalid_currency",
    });
    expect(await completeOnboarding(supabase, "u", {}, NOW)).toEqual({ ok: false, error: "invalid_currency" });
    expect(await completeOnboarding(supabase, "u", null, NOW)).toEqual({ ok: false, error: "invalid_currency" });
    expect(calls.update).toBeUndefined();
  });

  it("requires a real IANA time zone (the DB refuses an onboarded profile without one)", async () => {
    const { supabase, calls } = fake({});
    for (const time_zone of [undefined, "", "Mars/Olympus", 42]) {
      expect(await completeOnboarding(supabase, "u", { currency: "EUR", time_zone }, NOW)).toEqual({
        ok: false,
        error: "invalid_time_zone",
      });
    }
    expect(calls.update).toBeUndefined();
  });

  it("says already_onboarded when the profile exists but was already completed (the currency is never changed)", async () => {
    const { supabase } = fake({
      updated: [],
      row: { currency: "USD", onboarded_at: "2026-09-01T00:00:00Z", time_zone: ZONE },
    });
    expect(await completeOnboarding(supabase, "u", { currency: "EUR", time_zone: ZONE }, NOW)).toEqual({
      ok: false,
      error: "already_onboarded",
    });
  });

  it("says profile_missing when the seed trigger never created a row", async () => {
    const { supabase } = fake({ updated: [], row: null });
    expect(await completeOnboarding(supabase, "u", { currency: "EUR", time_zone: ZONE }, NOW)).toEqual({
      ok: false,
      error: "profile_missing",
    });
  });

  it("reports update_failed on a database error", async () => {
    const r = await completeOnboarding(fake({ updateError: true }).supabase, "u", { currency: "EUR", time_zone: ZONE }, NOW);
    expect(r).toMatchObject({ ok: false, error: "update_failed" });
  });
});

describe("saveTimeZone", () => {
  it("stores the zone exactly as the device reports it", async () => {
    const { supabase, calls } = fake({ updated: [{ id: "u" }] });
    expect(await saveTimeZone(supabase, "u", "Asia/Kolkata")).toEqual({ ok: true, timeZone: "Asia/Kolkata" });
    expect(calls.update).toEqual({ time_zone: "Asia/Kolkata" });
    expect(calls.eq).toEqual(["id", "u"]);
  });

  it("rejects a value that is not a time zone without touching the database", async () => {
    const { supabase, calls } = fake({});
    expect(await saveTimeZone(supabase, "u", "Not/AZone")).toEqual({ ok: false, error: "invalid_time_zone" });
    expect(await saveTimeZone(supabase, "u", undefined)).toEqual({ ok: false, error: "invalid_time_zone" });
    expect(calls.update).toBeUndefined();
  });

  it("says profile_missing when no row was updated, update_failed on an error", async () => {
    expect(await saveTimeZone(fake({ updated: [] }).supabase, "u", ZONE)).toEqual({ ok: false, error: "profile_missing" });
    expect(await saveTimeZone(fake({ updateError: true }).supabase, "u", ZONE)).toMatchObject({
      ok: false,
      error: "update_failed",
    });
  });
});
