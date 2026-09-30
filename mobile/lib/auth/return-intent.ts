import { isStamped, persist, restore } from "./persisted";

/**
 * Where the app goes once a sign-in link's sign-in completes (app/auth/callback.tsx): back to the deletion screen, as
 * the web's link does with `next`. The app's hand-off page passes on only the link's code, so the intent waits on this
 * device, in memory and in secure storage (the mail app may outlive the process), for the hour a sign-in link lasts. It
 * is taken once, and only by the account that left it: anyone else signing in on this phone lands on Home.
 */
const TTL_MS = 60 * 60 * 1000;
const KEY = "budgts.return-after-sign-in";

type Intent = { path: string; userId: string; at: number };
let pending: Intent | null = null;

/** Leaves the intent; resolves once it is stored, so it survives the app being killed while the user reads the email. */
export async function returnAfterSignIn(path: string, userId: string, now: number = Date.now()): Promise<void> {
  pending = { path, userId, at: now };
  await persist(KEY, pending);
}

export function takeReturnAfterSignIn(userId: string, now: number = Date.now()): string | null {
  const p = pending;
  pending = null;
  if (p) void persist(KEY, null);
  return p && p.userId === userId && now - p.at <= TTL_MS ? p.path : null;
}

/** At launch, before any sign-in can complete: the intent a killed process left, if it's still within its hour. */
export async function hydrateReturnIntent(now: number = Date.now()): Promise<void> {
  const v = await restore(KEY);
  if (isStamped(v, ["path", "userId"] as const) && now - v.at <= TTL_MS) pending = { path: v.path, userId: v.userId, at: v.at };
  else if (v !== null) await persist(KEY, null);
}

/** Tests only. */
export function resetReturnIntent(): void {
  pending = null;
}
