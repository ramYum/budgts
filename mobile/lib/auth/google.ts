import { LINK_PROBLEM_MESSAGE } from "./auth-errors";
import type { CompleteSessionResult } from "./complete-session";
import { googleSignInOptions } from "./sign-in-options";

export type GoogleSignInResult = { status: "signed_in" } | { status: "cancelled" } | { status: "error"; message: string };

type OAuthArgs = ReturnType<typeof googleSignInOptions>;

export type GoogleDeps = {
  /** `budgts://auth/callback` (callback-url.ts) */
  redirectTo: string;
  /** supabase.auth.signInWithOAuth */
  signInWithOAuth(args: OAuthArgs): Promise<{ data: { url: string | null } | null; error: { message: string } | null }>;
  /** expo-web-browser openAuthSessionAsync: the in-app browser session that catches the return */
  openAuthSession(url: string, returnUrl: string): Promise<{ type: string; url?: string }>;
  /** complete-session-from-url.ts */
  completeSession(url: string): Promise<CompleteSessionResult>;
};

const START_FAILED = "Couldn't open Google sign-in. Check your connection and try again.";

/**
 * Google sign-in, as on the web: Supabase's hosted Google OAuth (the same
 * project and provider, so the same Google account is the same Budgts user)
 * in an in-app browser session, then the PKCE code exchanged on the device.
 * Closing the sheet is a quiet cancel. Messages are fixed strings.
 */
export async function signInWithGoogle(deps: GoogleDeps): Promise<GoogleSignInResult> {
  try {
    const { data, error } = await deps.signInWithOAuth(googleSignInOptions(deps.redirectTo));
    if (error || !data?.url) return { status: "error", message: START_FAILED };

    const result = await deps.openAuthSession(data.url, deps.redirectTo);
    if (result.type === "cancel" || result.type === "dismiss") return { status: "cancelled" };
    if (result.type !== "success" || !result.url) return { status: "error", message: START_FAILED };

    const completion = await deps.completeSession(result.url);
    if (completion.ok) return { status: "signed_in" };
    if (completion.problem === "denied") return { status: "cancelled" };
    return {
      status: "error",
      message: completion.problem === "network" ? LINK_PROBLEM_MESSAGE.network : "Google sign-in didn't finish. Please try again.",
    };
  } catch {
    return { status: "error", message: START_FAILED };
  }
}
