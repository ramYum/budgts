import { describe, expect, it } from "vitest";
import { parseAuthCallbackUrl } from "./parse-callback-url";

describe("parseAuthCallbackUrl", () => {
  it("extracts a PKCE code (OAuth / PKCE magic-link)", () => {
    const result = parseAuthCallbackUrl("budgts://auth/callback?code=abc123");
    expect(result).toEqual({ kind: "code", code: "abc123" });
  });

  it("extracts token_hash + type (magic-link OTP verification)", () => {
    const result = parseAuthCallbackUrl(
      "budgts://auth/callback?token_hash=deadbeef&type=email",
    );
    expect(result).toEqual({ kind: "otp", tokenHash: "deadbeef", type: "email" });
  });

  it("surfaces an error_description from a failed provider redirect", () => {
    const result = parseAuthCallbackUrl(
      "budgts://auth/callback?error=access_denied&error_description=User+denied+access",
    );
    expect(result).toEqual({ kind: "error", message: "User denied access" });
  });

  it("prefers error over a stray code/token_hash", () => {
    const result = parseAuthCallbackUrl(
      "budgts://auth/callback?error=server_error&code=abc123",
    );
    expect(result.kind).toBe("error");
  });

  it("reports an error when neither code nor token_hash is present", () => {
    const result = parseAuthCallbackUrl("budgts://auth/callback");
    expect(result).toEqual({
      kind: "error",
      message: "Callback URL had no code or token_hash",
    });
  });

  it("reports an error for a malformed URL", () => {
    const result = parseAuthCallbackUrl("not a url");
    expect(result).toEqual({ kind: "error", message: "Malformed callback URL" });
  });

  it("ignores a token_hash without a type", () => {
    const result = parseAuthCallbackUrl("budgts://auth/callback?token_hash=deadbeef");
    expect(result.kind).toBe("error");
  });
});
