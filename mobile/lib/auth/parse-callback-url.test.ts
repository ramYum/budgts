import { describe, expect, it } from "vitest";
import { isAuthCallbackUrl, parseAuthCallbackUrl } from "./parse-callback-url";

describe("parseAuthCallbackUrl", () => {
  it("extracts a PKCE code (OAuth / PKCE magic-link)", () => {
    expect(parseAuthCallbackUrl("budgts://auth/callback?code=abc123")).toEqual({ kind: "code", code: "abc123" });
  });

  it("refuses a token_hash link: the app accepts only PKCE codes it started", () => {
    expect(parseAuthCallbackUrl("budgts://auth/callback?token_hash=deadbeef&type=email")).toEqual({ kind: "error", problem: "not_this_app" });
    // even beside a code: a mixed link is not one the app sent
    expect(parseAuthCallbackUrl("budgts://auth/callback?code=c&token_hash=deadbeef&type=magiclink")).toEqual({ kind: "error", problem: "not_this_app" });
  });

  it("refuses implicit-flow tokens in the fragment", () => {
    expect(parseAuthCallbackUrl("budgts://auth/callback#access_token=a&refresh_token=r&token_type=bearer")).toEqual({
      kind: "error",
      problem: "not_this_app",
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

  it("prefers an error over a stray code", () => {
    expect(parseAuthCallbackUrl("budgts://auth/callback?error=server_error&code=abc123").kind).toBe("error");
  });

  it("reports a link with no code as invalid", () => {
    expect(parseAuthCallbackUrl("budgts://auth/callback")).toEqual({ kind: "error", problem: "invalid" });
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
