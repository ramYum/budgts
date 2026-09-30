import { describe, expect, it, vi } from "vitest";
import {
  firstStage,
  parseDeleteScreen,
  requestReauthLink,
  returnAfterSignIn,
  stageAfter,
  takeReturnAfterSignIn,
} from "./delete-screen";
import { DELETE_ACCOUNT_CONFIRM_PATH } from "../shared";

const body = { version: 1, email: "a@b.co", recent: false, google: true, inProgress: false, supportEmail: "help@budgts.com", billing: false, keepsRecords: false };

describe("parseDeleteScreen", () => {
  it("reads GET /api/mobile/account/delete", () => {
    expect(parseDeleteScreen(body)).toEqual({
      email: "a@b.co",
      recent: false,
      google: true,
      inProgress: false,
      supportEmail: "help@budgts.com",
      billing: false,
      keepsRecords: false,
    });
    expect(parseDeleteScreen({ ...body, supportEmail: null }).supportEmail).toBeNull();
  });

  it("refuses what it can't show truthfully", () => {
    expect(() => parseDeleteScreen({ ...body, version: 2 })).toThrow();
    expect(() => parseDeleteScreen({ ...body, recent: "yes" })).toThrow();
    expect(() => parseDeleteScreen({ ...body, email: undefined })).toThrow();
    expect(() => parseDeleteScreen(null)).toThrow();
  });
});

describe("the flow's stages (web delete-account-flow.tsx)", () => {
  it("starts on the explanation, or, back from a fresh sign-in, on confirm (a fresh sign-in if it went stale)", () => {
    expect(firstStage("intro", true)).toBe("intro");
    expect(firstStage("intro", false)).toBe("intro");
    expect(firstStage("confirm", true)).toBe("confirm");
    expect(firstStage("confirm", false)).toBe("reauth");
  });

  it("sends every answer to a state with a way out", () => {
    expect(stageAfter({ status: "reauth_required" })).toEqual({ stage: "reauth", stale: true });
    expect(stageAfter({ status: "auth" })).toEqual({ stage: "signed_out" });
    for (const status of ["incomplete", "plaid", "unavailable", "uncertain", "network", "failed"] as const) {
      expect(stageAfter({ status })).toEqual({ stage: "error", error: status });
    }
  });
});

describe("requestReauthLink (web requestReauthLink)", () => {
  it("sends a link to the account's own address, never creating a user, through the app's hand-off page", async () => {
    const signInWithOtp = vi.fn(async () => ({ error: null }));
    expect(await requestReauthLink("a@b.co", { apiBaseUrl: "https://budgts.com", signInWithOtp })).toEqual({ sent: true });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "a@b.co",
      options: { shouldCreateUser: false, emailRedirectTo: "https://budgts.com/app/auth/callback" },
    });
  });

  it("says the web's words when it can't", async () => {
    const answering = (error: { status?: number } | null) => ({ apiBaseUrl: "https://budgts.com", signInWithOtp: async () => ({ error }) });
    expect(await requestReauthLink("a@b.co", answering({ status: 429 }))).toEqual({ sent: false, error: "A link was sent a moment ago. Wait a minute, then try again." });
    expect(await requestReauthLink("a@b.co", answering({ status: 500 }))).toEqual({ sent: false, error: "We couldn't send the link. Try again in a moment." });
    const throwing = { apiBaseUrl: "https://budgts.com", signInWithOtp: async () => Promise.reject(new Error("offline")) };
    expect(await requestReauthLink("a@b.co", throwing)).toEqual({ sent: false, error: "We couldn't send the link. Try again in a moment." });
    expect(await requestReauthLink("a@b.co", { apiBaseUrl: undefined, signInWithOtp: async () => ({ error: null }) })).toMatchObject({ sent: false });
  });
});

describe("the return after the email sign-in", () => {
  it("is taken once, within the link's hour, by the account that left it", () => {
    returnAfterSignIn(DELETE_ACCOUNT_CONFIRM_PATH, "u1", 0);
    expect(takeReturnAfterSignIn("u1", 60_000)).toBe(DELETE_ACCOUNT_CONFIRM_PATH);
    expect(takeReturnAfterSignIn("u1", 60_000)).toBeNull();

    returnAfterSignIn(DELETE_ACCOUNT_CONFIRM_PATH, "u1", 0);
    expect(takeReturnAfterSignIn("u1", 60 * 60 * 1000 + 1)).toBeNull();

    // someone else signing in on this phone never inherits it, and it's gone afterwards
    returnAfterSignIn(DELETE_ACCOUNT_CONFIRM_PATH, "u1", 0);
    expect(takeReturnAfterSignIn("u2", 1)).toBeNull();
    expect(takeReturnAfterSignIn("u1", 2)).toBeNull();
  });
});
