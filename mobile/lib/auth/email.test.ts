import { describe, expect, it } from "vitest";
import { isPlausibleEmail, normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("trims the whitespace Android keyboards append after autocomplete", () => {
    expect(normalizeEmail("  you@example.com ")).toBe("you@example.com");
  });
});

describe("isPlausibleEmail", () => {
  it.each(["you@example.com", "a.b+tag@mail.co.uk"])("accepts %s", (v) => {
    expect(isPlausibleEmail(v)).toBe(true);
  });

  it.each(["", "you", "you@", "@example.com", "you@example", "you @example.com"])(
    "rejects %j",
    (v) => {
      expect(isPlausibleEmail(v)).toBe(false);
    },
  );
});
