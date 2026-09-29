import { describe, expect, it } from "vitest";
import { arg, fakeSupabase, has, type FakeCall, type FakeResult } from "../../../tests/unit/helpers/fake-supabase";
import { addContribution, createGoal, deleteContribution, setGoalArchived, updateGoal } from "./commands";

const GOAL = "11111111-1111-4111-8111-111111111111";
const REQ = "22222222-2222-4222-8222-222222222222";

/** Answers per table; an insert with an explicit id already present answers a unique violation. */
function db(opts: { goalVisible?: boolean; insertError?: FakeResult["error"]; landed?: boolean; writeRows?: unknown[] } = {}) {
  return fakeSupabase((table: string, calls: FakeCall[]): FakeResult => {
    if (has(calls, "insert")) {
      if (opts.insertError) return { error: opts.insertError };
      return { data: { id: (arg(calls, "insert") as { id?: string }).id ?? "new-id" } };
    }
    if (has(calls, "update") || has(calls, "delete")) return { data: opts.writeRows ?? [{ id: GOAL }] };
    if (has(calls, "eq", "id", REQ)) return { data: opts.landed ? { id: REQ } : null };
    if (table === "savings_goals" && has(calls, "maybeSingle")) return { data: opts.goalVisible === false ? null : { id: GOAL } };
    return { data: null };
  });
}

describe("createGoal", () => {
  it("stores the target in minor units for the given user", async () => {
    const { supabase, log } = db();
    const r = await createGoal(supabase, "user-a", { name: " Trip ", targetAmount: "1,234.50", targetDate: "2027-01-01" });
    expect(r).toEqual({ ok: true, id: "new-id" });
    expect(arg(log[0]!.calls, "insert")).toEqual({
      user_id: "user-a",
      name: "Trip",
      target_amount: 123450,
      target_date: "2027-01-01",
    });
  });

  it("rejects an invalid goal or a malformed request id without writing", async () => {
    const { supabase, log } = db();
    expect(await createGoal(supabase, "u", { name: "", targetAmount: "10", targetDate: "" })).toMatchObject({
      error: "invalid",
      fieldErrors: { name: expect.any(String) },
    });
    expect(await createGoal(supabase, "u", { name: "x", targetAmount: "0", targetDate: "" })).toMatchObject({ error: "invalid" });
    expect(await createGoal(supabase, "u", { name: "x", targetAmount: "5", targetDate: "" }, "nope")).toMatchObject({
      error: "invalid",
      fieldErrors: { requestId: expect.any(String) },
    });
    expect(log).toHaveLength(0);
  });

  it("uses the request id as the row id, and a replay returns the goal that landed", async () => {
    const first = db();
    expect(await createGoal(first.supabase, "u", { name: "x", targetAmount: "5", targetDate: "" }, REQ)).toEqual({ ok: true, id: REQ });
    expect((arg(first.log[0]!.calls, "insert") as { id: string }).id).toBe(REQ);

    const replay = db({ insertError: { message: "duplicate key", code: "23505" }, landed: true });
    expect(await createGoal(replay.supabase, "u", { name: "x", targetAmount: "5", targetDate: "" }, REQ)).toEqual({ ok: true, id: REQ });
  });

  it("a key held by someone else (invisible under RLS) stays a failure", async () => {
    const { supabase } = db({ insertError: { message: "duplicate key", code: "23505" }, landed: false });
    expect(await createGoal(supabase, "u", { name: "x", targetAmount: "5", targetDate: "" }, REQ)).toMatchObject({
      ok: false,
      error: "failed",
    });
  });
});

describe("updateGoal / setGoalArchived", () => {
  it("updates the visible row", async () => {
    const { supabase, log } = db();
    expect(await updateGoal(supabase, GOAL, { name: "Car", targetAmount: "900", targetDate: "" })).toEqual({ ok: true });
    expect(arg(log[0]!.calls, "update")).toEqual({ name: "Car", target_amount: 90000, target_date: null });
    expect(has(log[0]!.calls, "eq", "id", GOAL)).toBe(true);
  });

  it("says missing when RLS shows no such row (another user's id)", async () => {
    expect(await updateGoal(db({ writeRows: [] }).supabase, GOAL, { name: "C", targetAmount: "9", targetDate: "" })).toEqual({
      ok: false,
      error: "missing",
    });
    expect(await setGoalArchived(db({ writeRows: [] }).supabase, GOAL, true)).toEqual({ ok: false, error: "missing" });
  });

  it("archives and restores", async () => {
    const { supabase, log } = db();
    expect(await setGoalArchived(supabase, GOAL, true)).toEqual({ ok: true });
    expect(arg(log[0]!.calls, "update")).toEqual({ is_archived: true });
  });
});

describe("addContribution", () => {
  const input = { goalId: GOAL, amount: "25", occurredAt: "2026-09-10", note: "" };

  it("adds a positive amount, and a withdrawal is stored negative", async () => {
    const add = db();
    expect(await addContribution(add.supabase, "user-a", input, 1)).toEqual({ ok: true, id: "new-id" });
    expect(arg(add.log.at(-1)!.calls, "insert")).toEqual({
      user_id: "user-a",
      goal_id: GOAL,
      amount: 2500,
      occurred_at: "2026-09-10",
      note: null,
    });
    const take = db();
    await addContribution(take.supabase, "user-a", input, -1);
    expect((arg(take.log.at(-1)!.calls, "insert") as { amount: number }).amount).toBe(-2500);
  });

  it("never attaches money to a goal the caller cannot see", async () => {
    const { supabase, log } = db({ goalVisible: false });
    expect(await addContribution(supabase, "user-a", input, 1)).toEqual({ ok: false, error: "missing" });
    expect(log.some((l) => has(l.calls, "insert"))).toBe(false);
  });

  it("a retried contribution lands once", async () => {
    const { supabase } = db({ insertError: { message: "duplicate key", code: "23505" }, landed: true });
    expect(await addContribution(supabase, "u", input, 1, REQ)).toEqual({ ok: true, id: REQ });
  });

  it("rejects a non-positive amount or a bad date without writing", async () => {
    const { supabase, log } = db();
    expect(await addContribution(supabase, "u", { ...input, amount: "-5" }, 1)).toMatchObject({ error: "invalid" });
    expect(await addContribution(supabase, "u", { ...input, occurredAt: "10/09/2026" }, 1)).toMatchObject({ error: "invalid" });
    expect(log).toHaveLength(0);
  });
});

describe("deleteContribution", () => {
  it("deletes the visible row, or says missing", async () => {
    expect(await deleteContribution(db().supabase, "c1")).toEqual({ ok: true });
    expect(await deleteContribution(db({ writeRows: [] }).supabase, "c1")).toEqual({ ok: false, error: "missing" });
  });
});
