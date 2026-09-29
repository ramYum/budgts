import { describe, expect, it, vi } from "vitest";
import { LINK_PROBLEM_MESSAGE, describeSendLinkError, problemFromAuthError } from "./auth-errors";
import { completeSession, type SessionAuth } from "./complete-session";
import { sendEmailLink } from "./email-link";
import { signInWithGoogle, type GoogleDeps } from "./google";
import { appleSignInEnabled, emailLinkRedirect, googleSignInOptions } from "./sign-in-options";

describe("sign-in options", () => {
  it("lands email links on the web hand-off page, so a computer gets a way on", () => {
    expect(emailLinkRedirect("https://budgts.com")).toBe("https://budgts.com/app/auth/callback");
    expect(emailLinkRedirect("http://localhost:3000/")).toBe("http://localhost:3000/app/auth/callback");
    expect(() => emailLinkRedirect(undefined)).toThrow();
  });

  it("asks Google which account, through the same Supabase provider as the web", () => {
    expect(googleSignInOptions("budgts://auth/callback")).toEqual({
      provider: "google",
      options: { redirectTo: "budgts://auth/callback", skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
    });
  });

  it("keeps Sign in with Apple off unless the build switches it on", () => {
    expect(appleSignInEnabled(undefined)).toBe(false);
    expect(appleSignInEnabled("")).toBe(false);
    expect(appleSignInEnabled("true")).toBe(false);
    expect(appleSignInEnabled("on")).toBe(true);
  });
});

describe("sending an email link", () => {
  const redirectTo = "https://budgts.com/app/auth/callback";

  it("sends the trimmed address with the hand-off redirect", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    expect(await sendEmailLink("  me@example.com ", { redirectTo, signInWithOtp })).toEqual({ ok: true, email: "me@example.com" });
    expect(signInWithOtp).toHaveBeenCalledWith({ email: "me@example.com", options: { emailRedirectTo: redirectTo } });
  });

  it("never spends an email on an address that can't be one", async () => {
    const signInWithOtp = vi.fn();
    const result = await sendEmailLink("me@", { redirectTo, signInWithOtp });
    expect(result).toMatchObject({ ok: false, invalidEmail: true });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("explains Supabase's rate limits in words, with the wait it asks for", async () => {
    const wait = { message: "For security purposes, you can only request this after 42 seconds.", status: 429, code: "over_email_send_rate_limit" };
    expect(await sendEmailLink("me@example.com", { redirectTo, signInWithOtp: async () => ({ error: wait }) })).toEqual({
      ok: false,
      message: "For your security, wait 42 seconds before asking for another link.",
      retryAfterSeconds: 42,
    });
    const hourly = describeSendLinkError({ message: "Email rate limit exceeded", status: 429, code: "over_email_send_rate_limit" });
    expect(hourly.message).toMatch(/Too many sign-in emails/);
    expect(hourly.message).not.toMatch(/rate limit/i);
  });

  it("reports a dropped connection as one, and never Supabase's text", async () => {
    const offline = { name: "AuthRetryableFetchError", message: "Network request failed" };
    expect(await sendEmailLink("me@example.com", { redirectTo, signInWithOtp: async () => ({ error: offline }) })).toMatchObject({
      ok: false,
      message: LINK_PROBLEM_MESSAGE.network,
    });
    const odd = await sendEmailLink("me@example.com", { redirectTo, signInWithOtp: async () => ({ error: { message: "Unexpected failure: db" } }) });
    expect(odd).toMatchObject({ ok: false, message: "Couldn't send the sign-in link. Try again in a moment." });
  });
});

describe("finishing a sign-in from its return link", () => {
  const auth = (over: Partial<SessionAuth> = {}): SessionAuth => ({
    exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ error: null }),
    ...over,
  });

  it("exchanges a PKCE code", async () => {
    const a = auth();
    expect(await completeSession("budgts://auth/callback?code=c1", a)).toEqual({ ok: true });
    expect(a.exchangeCodeForSession).toHaveBeenCalledWith("c1");
  });

  it("verifies a token hash", async () => {
    const a = auth();
    expect(await completeSession("budgts://auth/callback?token_hash=t&type=magiclink", a)).toEqual({ ok: true });
    expect(a.verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "t" });
  });

  it("stops at an expired link without calling Supabase", async () => {
    const a = auth();
    expect(await completeSession("budgts://auth/callback#error=access_denied&error_code=otp_expired", a)).toEqual({
      ok: false,
      problem: "expired",
    });
    expect(a.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("knows a link from another device: its code has no verifier here", async () => {
    const a = auth({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        error: { name: "AuthPKCECodeVerifierMissingError", message: "PKCE code verifier not found in storage.", code: "pkce_code_verifier_not_found" },
      }),
    });
    expect(await completeSession("budgts://auth/callback?code=c1", a)).toEqual({ ok: false, problem: "other_device" });
  });

  it("maps Supabase's error codes to what the person can do", () => {
    expect(problemFromAuthError({ code: "flow_state_not_found", message: "invalid flow state, no valid flow state found" })).toBe("other_device");
    expect(problemFromAuthError({ code: "otp_expired", message: "Email link is invalid or has expired" })).toBe("expired");
    expect(problemFromAuthError({ name: "AuthRetryableFetchError", message: "Network request failed" })).toBe("network");
    expect(problemFromAuthError({ message: "something else" })).toBe("invalid");
  });

  it("has a way forward in every message", () => {
    for (const message of Object.values(LINK_PROBLEM_MESSAGE)) expect(message).toMatch(/(new|again|try|ready)/i);
  });
});

describe("Google sign-in", () => {
  const deps = (over: Partial<GoogleDeps> = {}): GoogleDeps => ({
    redirectTo: "budgts://auth/callback",
    signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://supabase.example/authorize?x" }, error: null }),
    openAuthSession: vi.fn().mockResolvedValue({ type: "success", url: "budgts://auth/callback?code=g1" }),
    completeSession: vi.fn().mockResolvedValue({ ok: true }),
    ...over,
  });

  it("opens Supabase's Google page and finishes with the returned code", async () => {
    const d = deps();
    expect(await signInWithGoogle(d)).toEqual({ status: "signed_in" });
    expect(d.signInWithOAuth).toHaveBeenCalledWith(googleSignInOptions("budgts://auth/callback"));
    expect(d.openAuthSession).toHaveBeenCalledWith("https://supabase.example/authorize?x", "budgts://auth/callback");
    expect(d.completeSession).toHaveBeenCalledWith("budgts://auth/callback?code=g1");
  });

  it("treats closing the sheet, or saying no to Google, as a quiet cancel", async () => {
    expect(await signInWithGoogle(deps({ openAuthSession: vi.fn().mockResolvedValue({ type: "cancel" }) }))).toEqual({ status: "cancelled" });
    expect(await signInWithGoogle(deps({ openAuthSession: vi.fn().mockResolvedValue({ type: "dismiss" }) }))).toEqual({ status: "cancelled" });
    expect(await signInWithGoogle(deps({ completeSession: vi.fn().mockResolvedValue({ ok: false, problem: "denied" }) }))).toEqual({
      status: "cancelled",
    });
  });

  it("says so, in words, when it can't start or finish", async () => {
    const noUrl = await signInWithGoogle(deps({ signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: null }, error: { message: "provider disabled" } }) }));
    expect(noUrl).toEqual({ status: "error", message: "Couldn't open Google sign-in. Check your connection and try again." });
    const failed = await signInWithGoogle(deps({ completeSession: vi.fn().mockResolvedValue({ ok: false, problem: "other_device" }) }));
    expect(failed).toEqual({ status: "error", message: "Google sign-in didn't finish. Please try again." });
    const thrown = await signInWithGoogle(deps({ openAuthSession: vi.fn().mockRejectedValue(new Error("boom")) }));
    expect(thrown.status).toBe("error");
  });
});
