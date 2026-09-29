import { describe, expect, it } from "vitest";
import { isAuthCallbackUrl, parseAuthCallbackUrl } from "./parse-callback-url";

describe("parseAuthCallbackUrl", () => {
  it("extracts a PKCE code (OAuth / PKCE magic-link)", () => {
    expect(parseAuthCallbackUrl("budgts://auth/callback?code=abc123")).toEqual({ kind: "code", code: "abc123" });
  });

  it("extracts token_hash + type (magic-link OTP verification)", () => {
    expect(parseAuthCallbackUrl("budgts://auth/callback?token_hash=deadbeef&type=email")).toEqual({
      kind: "otp",
      tokenHash: "deadbeef",
      type: "email",
    });
  });

  it("reads an expired or used link's error from the fragment, where Supabase puts it", () => {
    // the exact shape staging returned for a spent link (2026-09-29)
    const url =
      "budgts://auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=";
    expect(parseAuthCallbackUrl(url)).toEqual({ kind: "error", problem: "expired" });
  });

  it("reads the same error forwarded as parameters by the web hand-off page", () => {
    expect(parseAuthCallbackUrl("budgts://auth/callback?error=access_denied&error_code=otp_expired")).toEqual({
      kind: "error",
      problem: "expired",
    });
  });

  it("tells a refused Google consent from a broken link", () => {
    expect(parseAuthCallbackUrl("budgts://auth/callback?error=access_denied&error_description=User+denied+access")).toEqual({
      kind: "error",
      problem: "denied",
    });
    expect(parseAuthCallbackUrl("budgts://auth/callback?error=server_error")).toEqual({ kind: "error", problem: "invalid" });
  });

  it("prefers an error over a stray code/token_hash", () => {
    expect(parseAuthCallbackUrl("budgts://auth/callback?error=server_error&code=abc123").kind).toBe("error");
  });

  it("reports a link with neither code nor token_hash as invalid", () => {
    expect(parseAuthCallbackUrl("budgts://auth/callback")).toEqual({ kind: "error", problem: "invalid" });
    expect(parseAuthCallbackUrl("budgts://auth/callback?token_hash=deadbeef")).toEqual({ kind: "error", problem: "invalid" });
  });

  it("reports a malformed URL as invalid", () => {
    expect(parseAuthCallbackUrl("not a url")).toEqual({ kind: "error", problem: "invalid" });
  });
});

describe("isAuthCallbackUrl", () => {
  it("knows the app's sign-in return, with or without parameters", () => {
    expect(isAuthCallbackUrl("budgts://auth/callback?code=x")).toBe(true);
    expect(isAuthCallbackUrl("budgts://auth/callback#error=access_denied")).toBe(true);
    expect(isAuthCallbackUrl("budgts://auth/callback")).toBe(true);
    expect(isAuthCallbackUrl("budgts://app/plaid-oauth?oauth_state_id=1")).toBe(false);
    expect(isAuthCallbackUrl("budgts://auth/callbacks")).toBe(false);
    expect(isAuthCallbackUrl(null)).toBe(false);
  });
});
