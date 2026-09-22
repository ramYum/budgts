import { describe, expect, it } from "vitest";
import { completeOnboarding, loadProfile } from "./onboarding";

type Row = { currency: string; onboarded_at: string | null } | null;

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

describe("loadProfile", () => {
  it("reports currency and whether onboarding is complete", async () => {
    const { supabase } = fake({ row: { currency: "CAD", onboarded_at: "2026-09-01T00:00:00Z" } });
    expect(await loadProfile(supabase, "u")).toEqual({ currency: "CAD", onboarded: true });
  });

  it("treats a null onboarded_at as not onboarded", async () => {
    const { supabase } = fake({ row: { currency: "USD", onboarded_at: null } });
    expect(await loadProfile(supabase, "u")).toEqual({ currency: "USD", onboarded: false });
  });

  it("returns null when there is no profile row", async () => {
    expect(await loadProfile(fake({ row: null }).supabase, "u")).toBeNull();
  });

  it("throws on a read error rather than reporting a wrong state", async () => {
    await expect(loadProfile(fake({ readError: true }).supabase, "u")).rejects.toThrow();
  });
});

describe("completeOnboarding", () => {
  it("saves the currency once, only for a not-yet-onboarded profile", async () => {
    const { supabase, calls } = fake({ updated: [{ id: "u" }] });

    const r = await completeOnboarding(supabase, "u", { currency: "EUR" }, NOW);

    expect(r).toEqual({ ok: true, currency: "EUR" });
    expect(calls.update).toEqual({ currency: "EUR", onboarded_at: NOW.toISOString() });
    expect(calls.eq).toEqual(["id", "u"]);
    expect(calls.isNull).toBe("onboarded_at"); // the currency is set once: never overwritten afterwards
  });

  it("rejects a currency outside the supported list without touching the database", async () => {
    const { supabase, calls } = fake({});
    expect(await completeOnboarding(supabase, "u", { currency: "JPY" }, NOW)).toEqual({ ok: false, error: "invalid_currency" });
    expect(await completeOnboarding(supabase, "u", {}, NOW)).toEqual({ ok: false, error: "invalid_currency" });
    expect(calls.update).toBeUndefined();
  });

  it("says already_onboarded when the profile exists but was already completed", async () => {
    const { supabase } = fake({ updated: [], row: { currency: "USD", onboarded_at: "2026-09-01T00:00:00Z" } });
    expect(await completeOnboarding(supabase, "u", { currency: "EUR" }, NOW)).toEqual({ ok: false, error: "already_onboarded" });
  });

  it("says profile_missing when the seed trigger never created a row", async () => {
    const { supabase } = fake({ updated: [], row: null });
    expect(await completeOnboarding(supabase, "u", { currency: "EUR" }, NOW)).toEqual({ ok: false, error: "profile_missing" });
  });

  it("reports update_failed on a database error", async () => {
    expect(await completeOnboarding(fake({ updateError: true }).supabase, "u", { currency: "EUR" }, NOW)).toEqual({
      ok: false,
      error: "update_failed",
    });
  });
});
