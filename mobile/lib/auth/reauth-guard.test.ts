import { beforeEach, describe, expect, it } from "vitest";
import { LINK_PROBLEM_MESSAGE } from "./auth-errors";
import { expectReauthAs, reauthVerdict, resetReauthGuard, takeSignInProblem, wasRejected } from "./reauth-guard";

beforeEach(() => resetReauthGuard());

describe("reauth guard: a re-sign-in must come back as the same account", () => {
  it("changes nothing when no re-sign-in is under way (ordinary sign-in, any account)", () => {
    expect(reauthVerdict("SIGNED_IN", "anyone")).toBe("accept");
    expect(takeSignInProblem()).toBeNull();
  });

  it("accepts the same account, and keeps watching (a repeated SIGNED_IN can't spend it)", () => {
    expectReauthAs("alice", 0);
    expect(reauthVerdict("SIGNED_IN", "alice", 1)).toBe("accept");
    expect(reauthVerdict("SIGNED_IN", "bob", 2)).toBe("reject");
  });

  it("refuses a different account: remembered for the callback, the reason given to sign-in once", () => {
    expectReauthAs("alice", 0);
    expect(reauthVerdict("SIGNED_IN", "bob", 1_000)).toBe("reject");
    expect(wasRejected("bob")).toBe(true);
    expect(wasRejected("alice")).toBe(false);
    expect(takeSignInProblem()).toBe("other_account");
    expect(takeSignInProblem()).toBeNull();
    expect(LINK_PROBLEM_MESSAGE.other_account).toBe(
      "That sign-in was for a different account, so nothing was deleted and you've been signed out. Sign in again with the account you want to delete.",
    );
  });

  it("ignores token refreshes and the first session read", () => {
    expectReauthAs("alice", 0);
    expect(reauthVerdict("TOKEN_REFRESHED", "bob", 1)).toBe("accept");
    expect(reauthVerdict("INITIAL_SESSION", "bob", 1)).toBe("accept");
    expect(reauthVerdict("SIGNED_IN", "bob", 2)).toBe("reject");
  });

  it("stops watching on sign-out, and after the hour a re-sign-in can take", () => {
    expectReauthAs("alice", 0);
    expect(reauthVerdict("SIGNED_OUT", null, 1)).toBe("accept");
    expect(reauthVerdict("SIGNED_IN", "bob", 2)).toBe("accept");

    expectReauthAs("alice", 0);
    expect(reauthVerdict("SIGNED_IN", "bob", 60 * 60 * 1000 + 1)).toBe("accept");
  });

  it("forgets a refusal once that account signs in on purpose (R1: the callback never hangs, sign-in never shows a stale reason)", () => {
    expectReauthAs("alice", 0);
    expect(reauthVerdict("SIGNED_IN", "bob", 1)).toBe("reject");
    expect(reauthVerdict("SIGNED_OUT", null, 2)).toBe("accept");
    expect(wasRejected("bob")).toBe(true); // still known after the local sign-out, for the callback
    expect(reauthVerdict("SIGNED_IN", "bob", 3)).toBe("accept");
    expect(wasRejected("bob")).toBe(false);
    expect(takeSignInProblem()).toBeNull();
  });
});
