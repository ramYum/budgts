import { beforeEach, describe, expect, it } from "vitest";
import { LINK_PROBLEM_MESSAGE } from "./auth-errors";
import { setAuthStore, type KeyValueStore } from "./persisted";
import { expectReauthAs, reauthVerdict, refusalOf, resetReauthGuard, signOutFailed, startupVerdict, takeSignInProblem } from "./reauth-guard";

const KEY = "budgts.reauth-expected";
let disk: Map<string, string>;
const memoryStore = (): KeyValueStore => ({
  getItem: async (k) => disk.get(k) ?? null,
  setItem: async (k, v) => void disk.set(k, v),
  removeItem: async (k) => void disk.delete(k),
});
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  disk = new Map();
  setAuthStore(memoryStore());
  resetReauthGuard();
});

describe("reauth guard: a re-sign-in must come back as the same account", () => {
  it("changes nothing when no re-sign-in is under way (ordinary sign-in, any account)", () => {
    expect(reauthVerdict("SIGNED_IN", "anyone")).toBe("accept");
    expect(takeSignInProblem()).toBeNull();
  });

  it("accepts the same account, and that ends the re-sign-in, in memory and on disk (G4)", async () => {
    await expectReauthAs("alice", 0);
    expect(disk.has(KEY)).toBe(true);
    expect(reauthVerdict("SIGNED_IN", "alice", 1)).toBe("accept");
    await settle();
    expect(disk.has(KEY)).toBe(false);
    expect(reauthVerdict("SIGNED_IN", "bob", 2)).toBe("accept"); // an ordinary sign-in now
  });

  it("refuses a different account: remembered for the callback, the reason given to sign-in once", async () => {
    await expectReauthAs("alice", 0);
    expect(reauthVerdict("SIGNED_IN", "bob", 1_000)).toBe("reject");
    expect(refusalOf("bob")).toBe("other_account");
    expect(refusalOf("alice")).toBeNull();
    expect(takeSignInProblem()).toBe("other_account");
    expect(takeSignInProblem()).toBeNull();
    expect(LINK_PROBLEM_MESSAGE.other_account).toBe(
      "That sign-in was for a different account, so nothing was deleted and you've been signed out. Sign in again with the account you want to delete.",
    );
  });

  it("keeps the stored expectation until the refused session's sign-out lands", async () => {
    await expectReauthAs("alice", 0);
    reauthVerdict("SIGNED_IN", "bob", 1);
    await settle();
    expect(disk.has(KEY)).toBe(true);
    reauthVerdict("SIGNED_OUT", null, 2);
    await settle();
    expect(disk.has(KEY)).toBe(false);
  });

  it("never shows the refused session refreshed before its sign-out lands; ignores the first session read otherwise", async () => {
    await expectReauthAs("alice", 0);
    expect(reauthVerdict("INITIAL_SESSION", "bob", 1)).toBe("accept");
    expect(reauthVerdict("SIGNED_IN", "bob", 2)).toBe("reject");
    expect(reauthVerdict("TOKEN_REFRESHED", "bob", 3)).toBe("reject");
    expect(reauthVerdict("TOKEN_REFRESHED", "alice", 3)).toBe("accept");
  });

  it("stops watching on sign-out, and after the hour a re-sign-in can take", async () => {
    await expectReauthAs("alice", 0);
    expect(reauthVerdict("SIGNED_OUT", null, 1)).toBe("accept");
    expect(reauthVerdict("SIGNED_IN", "bob", 2)).toBe("accept");

    await expectReauthAs("alice", 0);
    expect(reauthVerdict("SIGNED_IN", "bob", 60 * 60 * 1000 + 1)).toBe("accept");
    await settle();
    expect(disk.has(KEY)).toBe(false);
  });

  it("forgets a refusal once that account signs in on purpose (R1: the callback never hangs, sign-in never shows a stale reason)", async () => {
    await expectReauthAs("alice", 0);
    expect(reauthVerdict("SIGNED_IN", "bob", 1)).toBe("reject");
    expect(reauthVerdict("SIGNED_OUT", null, 2)).toBe("accept");
    expect(refusalOf("bob")).toBe("other_account"); // still known after the local sign-out, for the callback
    expect(reauthVerdict("SIGNED_IN", "bob", 3)).toBe("accept");
    expect(refusalOf("bob")).toBeNull();
    expect(takeSignInProblem()).toBeNull();
  });

  it("says when the refusal's sign-out failed (G2)", async () => {
    await expectReauthAs("alice", 0);
    reauthVerdict("SIGNED_IN", "bob", 1);
    signOutFailed();
    expect(refusalOf("bob")).toBe("sign_out_failed");
    expect(takeSignInProblem()).toBe("sign_out_failed");
    expect(LINK_PROBLEM_MESSAGE.sign_out_failed).toMatch(/couldn't finish signing it out\. Nothing was deleted\./);
  });
});

describe("Y1: a process killed mid re-sign-in", () => {
  it("refuses, at the next launch, a stored session for another account within the hour", async () => {
    await expectReauthAs("alice", 0);
    resetReauthGuard(); // the process died: memory is gone, the disk isn't
    expect(await startupVerdict("bob", 10_000)).toBe("reject");
    expect(refusalOf("bob")).toBe("other_account");
    expect(takeSignInProblem()).toBe("other_account");
  });

  it("resumes expecting the same account (the Custom Tab may still come back)", async () => {
    await expectReauthAs("alice", 0);
    resetReauthGuard();
    expect(await startupVerdict("alice", 10_000)).toBe("accept");
    expect(reauthVerdict("SIGNED_IN", "bob", 20_000)).toBe("reject");
  });

  it("lets it go after the hour, or when there's nothing (or nothing readable) stored", async () => {
    await expectReauthAs("alice", 0);
    resetReauthGuard();
    expect(await startupVerdict("bob", 60 * 60 * 1000 + 1)).toBe("accept");
    expect(disk.has(KEY)).toBe(false);

    expect(await startupVerdict("bob", 0)).toBe("accept");

    disk.set(KEY, "{not json");
    expect(await startupVerdict("bob", 0)).toBe("accept");
    disk.set(KEY, JSON.stringify({ userId: 3, at: 0 }));
    expect(await startupVerdict("bob", 0)).toBe("accept");
    expect(disk.has(KEY)).toBe(false);
  });
});
