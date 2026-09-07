import { describe, expect, it } from "vitest";
import { magicLinkSchema } from "./auth";

describe("magicLinkSchema", () => {
  it("accepts a valid email, trimmed and lowercased", () => {
    const parsed = magicLinkSchema.parse({ email: "  User@Example.COM " });
    expect(parsed.email).toBe("user@example.com");
  });

  it("rejects a missing email", () => {
    expect(magicLinkSchema.safeParse({ email: "" }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(magicLinkSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});
