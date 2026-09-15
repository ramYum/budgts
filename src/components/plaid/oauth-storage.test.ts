import { afterEach, describe, expect, it } from "vitest";
import { clearLinkContext, loadLinkContext, saveLinkContext } from "./oauth-storage";

afterEach(() => {
  sessionStorage.clear();
});

describe("Plaid OAuth link-context persistence", () => {
  it("round-trips a fresh-connect context", () => {
    saveLinkContext("link-sandbox-abc", { kind: "connect" });
    expect(loadLinkContext()).toEqual({ linkToken: "link-sandbox-abc", context: { kind: "connect" } });
  });

  it("round-trips a reconnect context with the item id", () => {
    saveLinkContext("link-sandbox-xyz", { kind: "reconnect", itemId: "item-123" });
    expect(loadLinkContext()).toEqual({
      linkToken: "link-sandbox-xyz",
      context: { kind: "reconnect", itemId: "item-123" },
    });
  });

  it("returns null when nothing was saved", () => {
    expect(loadLinkContext()).toBeNull();
  });

  it("returns null after clearing, even though something was saved before", () => {
    saveLinkContext("link-sandbox-abc", { kind: "connect" });
    clearLinkContext();
    expect(loadLinkContext()).toBeNull();
  });

  it("returns null instead of throwing on corrupted stored JSON", () => {
    sessionStorage.setItem("budgts:plaid-link", "{not json");
    expect(loadLinkContext()).toBeNull();
  });

  it("never throws when sessionStorage itself throws (private-browsing style failure)", () => {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked");
      },
    });
    try {
      expect(() => saveLinkContext("x", { kind: "connect" })).not.toThrow();
      expect(loadLinkContext()).toBeNull();
      expect(() => clearLinkContext()).not.toThrow();
    } finally {
      Object.defineProperty(window, "sessionStorage", original);
    }
  });
});
