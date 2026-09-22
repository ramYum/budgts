import { describe, expect, it } from "vitest";
import { createAccount, setAccountArchived, updateAccount } from "./commands";

/** PostgREST-shaped fake that records what it was asked to do. */
function fake(result: { data?: unknown; error?: { message: string } | null }) {
  const calls: { insert?: unknown; update?: unknown; eq?: [string, unknown] } = {};
  const done = async () => ({ data: result.data ?? null, error: result.error ?? null });
  const supabase = {
    from: (t: string) => {
      expect(t).toBe("accounts");
      return {
        insert: (v: unknown) => {
          calls.insert = v;
          return { select: () => ({ single: done }) };
        },
        update: (v: unknown) => {
          calls.update = v;
          return {
            eq: (c: string, val: unknown) => {
              calls.eq = [c, val];
              return { select: done };
            },
          };
        },
      };
    },
  };
  return { supabase: supabase as never, calls };
}

describe("createAccount", () => {
  it("creates a manual account for the given user", async () => {
    const { supabase, calls } = fake({ data: { id: "acc-1" } });
    expect(await createAccount(supabase, "user-a", { name: "  Wallet ", type: "cash" })).toEqual({ ok: true, id: "acc-1" });
    expect(calls.insert).toEqual({ user_id: "user-a", name: "Wallet", type: "cash" });
  });

  it("returns a field error and saves nothing for an invalid account", async () => {
    const { supabase, calls } = fake({});
    expect(await createAccount(supabase, "user-a", { name: "", type: "cash" })).toMatchObject({ ok: false, error: "invalid" });
    expect(await createAccount(supabase, "user-a", { name: "x", type: "brokerage" })).toMatchObject({ ok: false, error: "invalid" });
    expect(calls.insert).toBeUndefined();
  });

  it("reports a database error as failed", async () => {
    expect(await createAccount(fake({ error: { message: "nope" } }).supabase, "u", { name: "x", type: "cash" })).toEqual({
      ok: false,
      error: "failed",
      message: "nope",
    });
  });
});

describe("updateAccount", () => {
  it("updates name and type of the visible row", async () => {
    const { supabase, calls } = fake({ data: [{ id: "acc-1" }] });
    expect(await updateAccount(supabase, "acc-1", { name: "Main", type: "checking" })).toEqual({ ok: true });
    expect(calls.update).toEqual({ name: "Main", type: "checking" });
    expect(calls.eq).toEqual(["id", "acc-1"]);
  });

  it("says missing when nothing matched (another user's id is invisible under RLS)", async () => {
    expect(await updateAccount(fake({ data: [] }).supabase, "acc-x", { name: "Main", type: "checking" })).toEqual({
      ok: false,
      error: "missing",
    });
  });

  it("validates before writing", async () => {
    const { supabase, calls } = fake({});
    expect(await updateAccount(supabase, "a", { name: "x".repeat(41), type: "cash" })).toMatchObject({ ok: false, error: "invalid" });
    expect(calls.update).toBeUndefined();
  });
});

describe("setAccountArchived", () => {
  it("archives and unarchives", async () => {
    const a = fake({ data: [{ id: "a" }] });
    expect(await setAccountArchived(a.supabase, "a", true)).toEqual({ ok: true });
    expect(a.calls.update).toEqual({ is_archived: true });
    const b = fake({ data: [{ id: "a" }] });
    await setAccountArchived(b.supabase, "a", false);
    expect(b.calls.update).toEqual({ is_archived: false });
  });

  it("says missing when nothing matched", async () => {
    expect(await setAccountArchived(fake({ data: [] }).supabase, "a", true)).toEqual({ ok: false, error: "missing" });
  });
});
