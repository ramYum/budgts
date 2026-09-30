import { beforeEach, describe, expect, it } from "vitest";
import { setAuthStore, type KeyValueStore } from "./persisted";
import { hydrateReturnIntent, resetReturnIntent, returnAfterSignIn, takeReturnAfterSignIn } from "./return-intent";

const CONFIRM = "/settings/delete-account?step=confirm";
const KEY = "budgts.return-after-sign-in";
let disk: Map<string, string>;
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  disk = new Map();
  const store: KeyValueStore = {
    getItem: async (k) => disk.get(k) ?? null,
    setItem: async (k, v) => void disk.set(k, v),
    removeItem: async (k) => void disk.delete(k),
  };
  setAuthStore(store);
  resetReturnIntent();
});

describe("the return after a sign-in link", () => {
  it("is taken once, within the link's hour, by the account that left it", async () => {
    await returnAfterSignIn(CONFIRM, "u1", 0);
    expect(takeReturnAfterSignIn("u1", 60_000)).toBe(CONFIRM);
    expect(takeReturnAfterSignIn("u1", 60_000)).toBeNull();

    await returnAfterSignIn(CONFIRM, "u1", 0);
    expect(takeReturnAfterSignIn("u1", 60 * 60 * 1000 + 1)).toBeNull();

    // someone else signing in on this phone never inherits it, and it's gone afterwards
    await returnAfterSignIn(CONFIRM, "u1", 0);
    expect(takeReturnAfterSignIn("u2", 1)).toBeNull();
    expect(takeReturnAfterSignIn("u1", 2)).toBeNull();
  });

  it("survives the process: stored when left, back at launch, removed from disk once taken (Y1)", async () => {
    await returnAfterSignIn(CONFIRM, "u1", 0);
    expect(JSON.parse(disk.get(KEY)!)).toEqual({ path: CONFIRM, userId: "u1", at: 0 });
    resetReturnIntent(); // the mail app outlived the process
    await hydrateReturnIntent(30_000);
    expect(takeReturnAfterSignIn("u1", 31_000)).toBe(CONFIRM);
    await settle();
    expect(disk.has(KEY)).toBe(false);
  });

  it("drops a stored intent past its hour, or one it can't read", async () => {
    await returnAfterSignIn(CONFIRM, "u1", 0);
    resetReturnIntent();
    await hydrateReturnIntent(60 * 60 * 1000 + 1);
    expect(takeReturnAfterSignIn("u1", 60 * 60 * 1000 + 2)).toBeNull();
    expect(disk.has(KEY)).toBe(false);

    disk.set(KEY, JSON.stringify({ path: CONFIRM, at: 0 }));
    await hydrateReturnIntent(1);
    expect(takeReturnAfterSignIn("u1", 2)).toBeNull();
    expect(disk.has(KEY)).toBe(false);
  });
});
