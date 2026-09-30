import { describe, expect, it } from "vitest";
import { hubTestId, tabTestId } from "@/lib/brand/test-ids";

describe("shared parity test ids", () => {
  it("derives a hub row's id from its href", () => {
    expect(hubTestId("/goals")).toBe("hub-goals");
    expect(hubTestId("/settings/profile")).toBe("hub-settings-profile");
    expect(hubTestId("/help/how-it-works")).toBe("hub-help-how-it-works");
    expect(hubTestId("/transactions#needs-category")).toBe("hub-transactions");
    expect(hubTestId("/")).toBe("hub-home");
  });
  it("derives a tab's id from its label", () => {
    expect(tabTestId("Home")).toBe("tab-home");
    expect(tabTestId("More")).toBe("tab-more");
  });
});
