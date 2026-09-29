import { describe, expect, it } from "vitest";
import { arg, fakeSupabase, has, type FakeCall, type FakeResult } from "../../../tests/unit/helpers/fake-supabase";
import { createCategory, setCategoryArchived, updateCategory } from "./commands";

const CAT = "33333333-3333-4333-8333-333333333333";
const REQ = "44444444-4444-4444-8444-444444444444";

function db(opts: { insertError?: FakeResult["error"]; landed?: boolean; writeRows?: unknown[]; updateError?: boolean } = {}) {
  return fakeSupabase((_table: string, calls: FakeCall[]): FakeResult => {
    if (has(calls, "insert")) {
      if (opts.insertError) return { error: opts.insertError };
      const v = arg(calls, "insert") as { id?: string; name: string };
      return { data: { id: v.id ?? "new-id", name: v.name } };
    }
    if (has(calls, "update")) return opts.updateError ? { error: { message: "denied" } } : { data: opts.writeRows ?? [{ id: CAT }] };
    if (has(calls, "eq", "id", REQ)) return { data: opts.landed ? { id: REQ, name: "Pets" } : null };
    return { data: null };
  });
}

describe("createCategory", () => {
  it("creates for the given user with the default colour when none is picked", async () => {
    const { supabase, log } = db();
    expect(await createCategory(supabase, "user-a", { name: " Pets ", kind: "expense" })).toEqual({ ok: true, id: "new-id", name: "Pets" });
    expect(arg(log[0]!.calls, "insert")).toEqual({ user_id: "user-a", name: "Pets", kind: "expense", color: "#6b716e" });
  });

  it("validates name, kind and colour without writing", async () => {
    const { supabase, log } = db();
    expect(await createCategory(supabase, "u", { name: "", kind: "expense" })).toMatchObject({ error: "invalid" });
    expect(await createCategory(supabase, "u", { name: "x", kind: "asset" })).toMatchObject({ error: "invalid" });
    expect(await createCategory(supabase, "u", { name: "x", kind: "expense", color: "red" })).toMatchObject({ error: "invalid" });
    expect(await createCategory(supabase, "u", { name: "x", kind: "expense" }, "bad")).toMatchObject({ error: "invalid" });
    expect(log).toHaveLength(0);
  });

  it("is idempotent with a request id", async () => {
    const first = db();
    expect(await createCategory(first.supabase, "u", { name: "Pets", kind: "expense" }, REQ)).toMatchObject({ ok: true, id: REQ });
    const replay = db({ insertError: { message: "dup", code: "23505" }, landed: true });
    expect(await createCategory(replay.supabase, "u", { name: "Pets", kind: "expense" }, REQ)).toEqual({ ok: true, id: REQ, name: "Pets" });
    const foreign = db({ insertError: { message: "dup", code: "23505" }, landed: false });
    expect(await createCategory(foreign.supabase, "u", { name: "Pets", kind: "expense" }, REQ)).toMatchObject({ error: "failed" });
  });
});

describe("updateCategory / setCategoryArchived", () => {
  it("renames / recolours the visible row", async () => {
    const { supabase, log } = db();
    expect(await updateCategory(supabase, CAT, { name: "Pet care", kind: "expense", color: "#22c55e" })).toEqual({ ok: true });
    expect(arg(log[0]!.calls, "update")).toEqual({ name: "Pet care", kind: "expense", color: "#22c55e" });
    expect(has(log[0]!.calls, "eq", "id", CAT)).toBe(true);
  });

  it("says missing for an invisible id and failed for a storage error", async () => {
    expect(await updateCategory(db({ writeRows: [] }).supabase, CAT, { name: "x", kind: "income" })).toEqual({ ok: false, error: "missing" });
    expect(await setCategoryArchived(db({ writeRows: [] }).supabase, CAT, true)).toEqual({ ok: false, error: "missing" });
    expect(await setCategoryArchived(db({ updateError: true }).supabase, CAT, true)).toEqual({ ok: false, error: "failed", message: "denied" });
  });

  it("archives and restores", async () => {
    const { supabase, log } = db();
    expect(await setCategoryArchived(supabase, CAT, false)).toEqual({ ok: true });
    expect(arg(log[0]!.calls, "update")).toEqual({ is_archived: false });
  });
});
