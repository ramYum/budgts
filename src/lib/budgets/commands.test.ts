import { describe, expect, it } from "vitest";
import { copyBudgetsFromPreviousMonth, setBudget } from "./commands";

const CATEGORY = "44444444-4444-4444-8444-444444444444";

/** PostgREST-shaped fake for the `budgets` table. */
function fake(opts: { previous?: { category_id: string; amount: number }[]; readError?: boolean; writeError?: boolean } = {}) {
  const calls: { upsert?: { rows: unknown; opts: unknown }; deleted?: [string, unknown][]; readMonth?: unknown } = {};
  const writeResult = async () => ({ error: opts.writeError ? { message: "nope" } : null });
  const supabase = {
    from: (t: string) => {
      expect(t).toBe("budgets");
      return {
        upsert: async (rows: unknown, o: unknown) => {
          calls.upsert = { rows, opts: o };
          return writeResult();
        },
        delete: () => {
          const eqs: [string, unknown][] = [];
          calls.deleted = eqs;
          const chain = {
            eq: (c: string, v: unknown) => {
              eqs.push([c, v]);
              return eqs.length === 3 ? writeResult() : chain;
            },
          };
          return chain;
        },
        select: () => ({
          eq: () => ({
            eq: async (_c: string, month: unknown) => {
              calls.readMonth = month;
              return opts.readError ? { data: null, error: { message: "nope" } } : { data: opts.previous ?? [], error: null };
            },
          }),
        }),
      };
    },
  };
  return { supabase: supabase as never, calls };
}

describe("setBudget", () => {
  it("upserts one category's budget for the month, in minor units", async () => {
    const { supabase, calls } = fake();
    expect(await setBudget(supabase, "user-a", { categoryId: CATEGORY, month: "2026-09", amount: "400" })).toEqual({ ok: true });
    expect(calls.upsert).toEqual({
      rows: { user_id: "user-a", category_id: CATEGORY, month: "2026-09-01", amount: 40000 },
      opts: { onConflict: "user_id,category_id,month" },
    });
  });

  it("clears the budget when the amount is empty or zero", async () => {
    const { supabase, calls } = fake();
    expect(await setBudget(supabase, "user-a", { categoryId: CATEGORY, month: "2026-09", amount: "" })).toEqual({ ok: true });
    expect(calls.upsert).toBeUndefined();
    expect(calls.deleted).toEqual([
      ["user_id", "user-a"],
      ["category_id", CATEGORY],
      ["month", "2026-09-01"],
    ]);
  });

  it("validates before writing", async () => {
    const { supabase, calls } = fake();
    expect(await setBudget(supabase, "u", { categoryId: "x", month: "2026-09", amount: "5" })).toMatchObject({ ok: false, error: "invalid" });
    expect(await setBudget(supabase, "u", { categoryId: CATEGORY, month: "2026-09", amount: "-5" })).toMatchObject({ ok: false, error: "invalid" });
    expect(calls.upsert).toBeUndefined();
  });

  it("reports a database error as failed", async () => {
    expect(
      await setBudget(fake({ writeError: true }).supabase, "u", { categoryId: CATEGORY, month: "2026-09", amount: "5" }),
    ).toEqual({ ok: false, error: "failed", message: "nope" });
  });
});

describe("copyBudgetsFromPreviousMonth", () => {
  it("copies last month's amounts into the given month", async () => {
    const { supabase, calls } = fake({ previous: [{ category_id: CATEGORY, amount: 25000 }] });
    expect(await copyBudgetsFromPreviousMonth(supabase, "user-a", "2026-01")).toEqual({ ok: true });
    expect(calls.readMonth).toBe("2025-12-01"); // January reads the previous December
    expect(calls.upsert?.rows).toEqual([{ user_id: "user-a", category_id: CATEGORY, month: "2026-01-01", amount: 25000 }]);
  });

  it("says nothing_to_copy when last month has no budgets", async () => {
    expect(await copyBudgetsFromPreviousMonth(fake({ previous: [] }).supabase, "u", "2026-09")).toEqual({ ok: false, error: "nothing_to_copy" });
  });

  it("rejects a malformed month and reports read failures", async () => {
    expect(await copyBudgetsFromPreviousMonth(fake().supabase, "u", "September")).toMatchObject({ ok: false, error: "invalid" });
    expect(await copyBudgetsFromPreviousMonth(fake({ readError: true }).supabase, "u", "2026-09")).toMatchObject({ ok: false, error: "failed" });
  });
});
