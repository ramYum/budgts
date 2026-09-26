import { describe, expect, it } from "vitest";
import { firstRunRedirect } from "./gate";

const AT = "2026-09-25T12:00:00Z";

describe("firstRunRedirect", () => {
  it("sends a brand-new user to the welcome guide's first half", () => {
    expect(firstRunRedirect({ onboarded_at: null, tour_seen_at: null })).toBe("/onboarding");
  });

  it("sends a user who picked a currency but left mid-guide back to the rest of it", () => {
    expect(firstRunRedirect({ onboarded_at: AT, tour_seen_at: null })).toBe("/tour");
  });

  it("lets a user who finished or skipped the guide into the app", () => {
    expect(firstRunRedirect({ onboarded_at: AT, tour_seen_at: AT })).toBeNull();
  });

  it("starts at onboarding when the profile row doesn't exist yet", () => {
    expect(firstRunRedirect(null)).toBe("/onboarding");
  });
});
