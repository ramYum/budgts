import { describe, expect, it, vi } from "vitest";
import { returnAfterSignIn, takeReturnAfterSignIn } from "../account/delete-screen";
import { callbackDecision } from "./callback-decision";
import { completeSession, type SessionAuth } from "./complete-session";

const CONFIRM = "/settings/delete-account?step=confirm";

/** A supabase auth double that records every call, so a test can prove nothing but the exchange ran. */
function auth(exchange: SessionAuth["exchangeCodeForSession"]) {
  const signOut = vi.fn();
  const setSession = vi.fn();
  const verifyOtp = vi.fn();
  const exchangeCodeForSession = vi.fn(exchange);
  return { exchangeCodeForSession, signOut, setSession, verifyOtp };
}

describe("signed out: the callback behaves as before", () => {
  it("waits for the answer, then for the session a success brings, then goes Home", () => {
    const take = vi.fn(() => null);
    expect(callbackDecision(null, null, take)).toEqual({ kind: "wait" });
    expect(callbackDecision({ ok: true }, null, take)).toEqual({ kind: "wait" });
    expect(take).not.toHaveBeenCalled();
    expect(callbackDecision({ ok: true }, "u1", take)).toEqual({ kind: "go", href: "/" });
  });

  it("sends a failure to sign-in with its problem, leaving any return intent in place", () => {
    const take = vi.fn(() => "/somewhere");
    expect(callbackDecision({ ok: false, problem: "expired" }, null, take)).toEqual({ kind: "sign-in", problem: "expired" });
    expect(take).not.toHaveBeenCalled();
  });

  it("returns to the deletion screen after 'Sign in again', for that same account only", () => {
    returnAfterSignIn("/settings/delete-account", "u1");
    expect(callbackDecision({ ok: true }, "u1", takeReturnAfterSignIn)).toEqual({ kind: "go", href: "/settings/delete-account" });
    returnAfterSignIn("/settings/delete-account", "u1");
    expect(callbackDecision({ ok: true }, "u2", takeReturnAfterSignIn)).toEqual({ kind: "go", href: "/" });
  });
});

describe("signed in: a fresh sign-in returns through the callback", () => {
  it("goes back to confirm after the re-sign-in, once, and Home after that", () => {
    returnAfterSignIn(CONFIRM, "u1");
    expect(callbackDecision({ ok: true }, "u1", takeReturnAfterSignIn)).toEqual({ kind: "go", href: CONFIRM });
    expect(callbackDecision({ ok: true }, "u1", takeReturnAfterSignIn)).toEqual({ kind: "go", href: "/" });
  });

  it("an expired intent goes Home", () => {
    returnAfterSignIn(CONFIRM, "u1", Date.now() - 60 * 60 * 1000 - 1);
    expect(callbackDecision({ ok: true }, "u1", takeReturnAfterSignIn)).toEqual({ kind: "go", href: "/" });
  });

  it("a failed exchange shows the problem with a way back (the intent, else Home), never sign-in", () => {
    returnAfterSignIn(CONFIRM, "u1");
    expect(callbackDecision({ ok: false, problem: "expired" }, "u1", takeReturnAfterSignIn)).toEqual({ kind: "problem", problem: "expired", back: CONFIRM });
    expect(callbackDecision({ ok: false, problem: "network" }, "u1", takeReturnAfterSignIn)).toEqual({ kind: "problem", problem: "network", back: "/" });
  });
});

describe("an old or foreign link while signed in changes nothing", () => {
  it("a code this phone didn't start fails the exchange: no sign-out, no other session call, a way back", async () => {
    const a = auth(async () => ({ error: { name: "AuthPKCECodeVerifierMissingError", message: "PKCE code verifier not found in storage." } }));
    const outcome = await completeSession("budgts://auth/callback?code=someone-elses", a);
    expect(outcome.ok).toBe(false);
    expect(a.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(a.signOut).not.toHaveBeenCalled();
    expect(a.setSession).not.toHaveBeenCalled();
    expect(callbackDecision(outcome, "u1", () => null)).toMatchObject({ kind: "problem", back: "/" });
  });

  it("an already used or expired link fails the same way", async () => {
    const a = auth(async () => ({ error: { code: "flow_state_expired", message: "invalid flow state", status: 400 } }));
    const outcome = await completeSession("budgts://auth/callback?code=old", a);
    expect(outcome).toMatchObject({ ok: false });
    expect(a.signOut).not.toHaveBeenCalled();
    expect(callbackDecision(outcome, "u1", () => null).kind).toBe("problem");
  });

  it("a token_hash or implicit-token link is refused before any session call: only PKCE codes the app started exchange", async () => {
    for (const url of [
      "budgts://auth/callback?token_hash=attacker&type=magiclink",
      "budgts://auth/callback#access_token=a&refresh_token=r",
      "budgts://auth/callback?code=c&token_hash=t",
    ]) {
      const a = auth(async () => ({ error: null }));
      const outcome = await completeSession(url, a);
      expect(outcome).toEqual({ ok: false, problem: "not_this_app" });
      expect(a.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(a.verifyOtp).not.toHaveBeenCalled();
      expect(a.setSession).not.toHaveBeenCalled();
      expect(callbackDecision(outcome, "u1", () => null)).toEqual({ kind: "problem", problem: "not_this_app", back: "/" });
    }
  });

  it("a link carrying its own error changes nothing", async () => {
    const a = auth(async () => ({ error: null }));
    const outcome = await completeSession("budgts://auth/callback#error=access_denied&error_code=otp_expired", a);
    expect(outcome).toEqual({ ok: false, problem: "expired" });
    expect(a.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe("a re-sign-in that came back as a different account", () => {
  const bobRejected = (id: string | null | undefined) => id === "bob";

  it("never goes on as the other account: it waits for the sign-out, then shows sign-in with the reason", () => {
    const take = vi.fn(() => "/settings/delete-account?step=confirm");
    // the refused session never reached the app; alice's is still on screen while the phone signs out
    expect(callbackDecision({ ok: true, userId: "bob" }, "alice", take, bobRejected)).toEqual({ kind: "wait" });
    expect(callbackDecision({ ok: true, userId: "bob" }, null, take, bobRejected)).toEqual({ kind: "sign-in", problem: "other_account" });
    expect(take).not.toHaveBeenCalled();
  });

  it("the same account goes on to confirm as before", () => {
    returnAfterSignIn(CONFIRM, "alice");
    expect(callbackDecision({ ok: true, userId: "alice" }, "alice", takeReturnAfterSignIn, bobRejected)).toEqual({ kind: "go", href: CONFIRM });
  });
});

describe("completeSession names who the exchange signed in", () => {
  it("from the exchange's own answer", async () => {
    const a = auth(async () => ({ data: { user: { id: "bob" } }, error: null }));
    expect(await completeSession("budgts://auth/callback?code=c", a)).toEqual({ ok: true, userId: "bob" });
  });
});

describe("R1: a refused account that later signs in on purpose", () => {
  it("goes on (refuse B, sign out, sign in as B → go)", async () => {
    const guard = await import("./reauth-guard");
    guard.resetReauthGuard();
    guard.expectReauthAs("alice");
    expect(guard.reauthVerdict("SIGNED_IN", "bob")).toBe("reject");
    guard.reauthVerdict("SIGNED_OUT", null);
    expect(guard.reauthVerdict("SIGNED_IN", "bob")).toBe("accept");
    expect(callbackDecision({ ok: true, userId: "bob" }, "bob", () => null, guard.wasRejected)).toEqual({ kind: "go", href: "/" });
  });
});
