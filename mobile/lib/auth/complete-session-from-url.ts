import { supabase } from "../supabase/client";
import { completeSession, type CompleteSessionResult } from "./complete-session";
import { onceByKey } from "./once-by-key";

export type { CompleteSessionResult };

class RetryableSignInError extends Error {}

// A network failure is thrown, so onceByKey doesn't keep it: opening the same
// link again, once back online, tries again. Every other outcome is final for
// that single-use link and is shared.
const once = onceByKey(async (url: string) => {
  const result = await completeSession(url, supabase.auth);
  if (!result.ok && result.problem === "network") throw new RetryableSignInError();
  return result;
});

/**
 * Finishes sign-in from the `budgts://auth/callback` deep link — the mobile
 * equivalent of `src/app/auth/callback/route.ts` — over the app's Supabase
 * client (the PKCE verifier lives in its secure storage).
 *
 * Deduplicated per URL: the same single-use link can reach the app both via
 * `openAuthSessionAsync` (Google) and via the intent routed to
 * `app/auth/callback.tsx`; both callers get the one shared result.
 */
export async function completeSessionFromUrl(url: string): Promise<CompleteSessionResult> {
  try {
    return await once(url);
  } catch {
    return { ok: false, problem: "network" };
  }
}
