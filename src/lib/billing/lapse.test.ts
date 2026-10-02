import { describe, expect, it } from "vitest";
import type { EntitlementState } from "./entitlement";
import { LAPSE_GRACE_DAYS, isLapsedPastGrace, showsLapseRemovalNotice } from "./lapse";

const DAY = 86_400_000;
const NOW = new Date("2026-10-20T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const ent = (state: EntitlementState, accessUntil: Date | null) => ({ state, accessUntil });

describe("isLapsedPastGrace: who loses their bank connections", () => {
  it("the grace window is one named constant of 7 days", () => {
    expect(LAPSE_GRACE_DAYS).toBe(7);
  });

  it("a user with NO entitlement row is never touched (pre-launch and grandfathered accounts)", () => {
    expect(isLapsedPastGrace(null, NOW)).toBe(false);
    expect(isLapsedPastGrace(undefined, NOW)).toBe(false);
  });

  it("an active subscription is untouched", () => {
    expect(isLapsedPastGrace(ent("active", new Date(NOW.getTime() + 20 * DAY)), NOW)).toBe(false);
  });

  it("a running trial and a store grace period are untouched", () => {
    expect(isLapsedPastGrace(ent("trialing", new Date(NOW.getTime() + DAY)), NOW)).toBe(false);
    expect(isLapsedPastGrace(ent("grace", new Date(NOW.getTime() + DAY)), NOW)).toBe(false);
  });

  it("lapsed for less than 7 days is untouched", () => {
    expect(isLapsedPastGrace(ent("expired", ago(1)), NOW)).toBe(false);
    expect(isLapsedPastGrace(ent("expired", new Date(NOW.getTime() - 7 * DAY + 1)), NOW)).toBe(false);
  });

  it("lapsed for 7 days or more is removed", () => {
    expect(isLapsedPastGrace(ent("expired", ago(7)), NOW)).toBe(true);
    expect(isLapsedPastGrace(ent("expired", ago(40)), NOW)).toBe(true);
  });

  it("an expired free trial counts, including one whose stored state still says trialing (a missed webhook)", () => {
    expect(isLapsedPastGrace(ent("expired", ago(8)), NOW)).toBe(true);
    expect(isLapsedPastGrace(ent("trialing", ago(8)), NOW)).toBe(true);
  });

  it("a refund (revoked) counts from the moment access ended", () => {
    expect(isLapsedPastGrace(ent("revoked", ago(10)), NOW)).toBe(true);
    expect(isLapsedPastGrace(ent("revoked", ago(2)), NOW)).toBe(false);
  });

  it("a renewed subscription is untouched, however long ago an earlier period ended", () => {
    // Renewal moves access_until forward: the entitlement is live again.
    expect(isLapsedPastGrace(ent("active", new Date(NOW.getTime() + 30 * DAY)), NOW)).toBe(false);
  });

  it("a row that never had an access window (state none, no access_until) is untouched", () => {
    expect(isLapsedPastGrace(ent("none", null), NOW)).toBe(false);
    expect(isLapsedPastGrace(ent("expired", null), NOW)).toBe(false);
  });
});

describe("showsLapseRemovalNotice", () => {
  const removed = ago(3);

  it("shows while the user is still without Premium after their banks were removed", () => {
    expect(showsLapseRemovalNotice({ state: "expired", accessUntil: ago(10), bankConnectionsRemovedAt: removed }, NOW)).toBe(true);
  });

  it("never shows when nothing was removed, or for a user with no row", () => {
    expect(showsLapseRemovalNotice({ state: "expired", accessUntil: ago(10), bankConnectionsRemovedAt: null }, NOW)).toBe(false);
    expect(showsLapseRemovalNotice(null, NOW)).toBe(false);
  });

  it("hides once the user subscribes again", () => {
    expect(showsLapseRemovalNotice({ state: "active", accessUntil: new Date(NOW.getTime() + 30 * DAY), bankConnectionsRemovedAt: removed }, NOW)).toBe(false);
  });

  it("does not resurface for an older removal while a later period's banks are still in their grace window", () => {
    // Removed after an earlier lapse, re-subscribed, lapsed again 2 days ago: nothing has been removed this time yet.
    expect(showsLapseRemovalNotice({ state: "expired", accessUntil: ago(2), bankConnectionsRemovedAt: ago(30) }, NOW)).toBe(false);
  });
});
