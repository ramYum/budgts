import { describe, expect, it } from "vitest";
import { arg, fakeSupabase, has, type FakeResult } from "../../../tests/unit/helpers/fake-supabase";
import { buildTourSteps } from "./steps";
import { loadTour, loadTourSeen, markTourSeen, onboardingSteps } from "./load-tour";

function db(over: Record<string, FakeResult> = {}) {
  return fakeSupabase((table) => {
    if (over[table]) return over[table]!;
    if (table === "profiles") return { data: { onboarded_at: "2026-09-01T00:00:00Z", currency: "EUR", tour_seen_at: null } };
    if (table === "plaid_items") return { count: 1 };
    if (table === "accounts") return { data: [{ id: "a1", name: "Wallet" }] };
    return { data: [] };
  });
}

describe("loadTour", () => {
  it("builds the same cards the web page does, with the currency and accounts they show", async () => {
    const tour = await loadTour(db().supabase, { userId: "u", plaidEnabled: true, justOnboarded: true });
    const web = buildTourSteps({ phase: "tour", plaidEnabled: true, hasBank: true, justOnboarded: true });
    expect(tour).toEqual({
      onboarded: true,
      currency: "EUR",
      accounts: [{ id: "a1", name: "Wallet" }],
      stepIds: web.steps.map((s) => s.id),
      offset: web.offset,
      totalVisible: web.totalVisible,
    });
  });

  it("treats a Plaid read error as 'not present', never 'has a bank'", async () => {
    const tour = await loadTour(db({ plaid_items: { error: { message: "no table" } } }).supabase, {
      userId: "u",
      plaidEnabled: true,
      justOnboarded: false,
    });
    const web = buildTourSteps({ phase: "tour", plaidEnabled: true, hasBank: false, justOnboarded: false });
    expect(tour.stepIds).toEqual(web.steps.map((s) => s.id));
  });

  it("reports a user who has not picked a currency", async () => {
    const tour = await loadTour(db({ profiles: { data: { onboarded_at: null, currency: "USD" } } }).supabase, {
      userId: "u",
      plaidEnabled: false,
      justOnboarded: false,
    });
    expect(tour.onboarded).toBe(false);
  });
});

describe("onboardingSteps", () => {
  it("is buildTourSteps' onboarding phase", () => {
    const web = buildTourSteps({ phase: "onboarding", plaidEnabled: true, hasBank: false, justOnboarded: false });
    expect(onboardingSteps(true)).toEqual({ stepIds: web.steps.map((s) => s.id), totalVisible: web.totalVisible });
  });
});

describe("loadTourSeen / markTourSeen", () => {
  it("reads the gate, and throws rather than guessing on a read error", async () => {
    expect(await loadTourSeen(db({ profiles: { data: { tour_seen_at: "2026-09-02T00:00:00Z" } } }).supabase, "u")).toBe(true);
    expect(await loadTourSeen(db({ profiles: { data: { tour_seen_at: null } } }).supabase, "u")).toBe(false);
    await expect(loadTourSeen(db({ profiles: { error: { message: "x" } } }).supabase, "u")).rejects.toThrow();
  });

  it("stamps the caller's own profile, and says missing when there is none", async () => {
    const now = new Date("2026-09-29T10:00:00Z");
    const { supabase, log } = db({ profiles: { data: [{ id: "u" }] } });
    expect(await markTourSeen(supabase, "u", now)).toEqual({ ok: true });
    expect(arg(log[0]!.calls, "update")).toEqual({ tour_seen_at: now.toISOString() });
    expect(has(log[0]!.calls, "eq", "id", "u")).toBe(true);
    expect(await markTourSeen(db({ profiles: { data: [] } }).supabase, "u")).toEqual({ ok: false, error: "missing" });
    expect(await markTourSeen(db({ profiles: { error: { message: "x" } } }).supabase, "u")).toMatchObject({ error: "failed" });
  });
});
