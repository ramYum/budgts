/**
 * The hand-off from the web page an app sign-in link opens
 * (src/app/app/auth/callback) to the app itself. Pure: the page passes in its
 * own location and user agent.
 */

/** The app's sign-in return (mobile/lib/auth/callback-url.ts AUTH_CALLBACK_URL). */
export const APP_AUTH_CALLBACK = "budgts://auth/callback";

/** The link's query and fragment as one parameter list (Supabase puts a failed link's error in the fragment). */
function linkParams(search: string, hash: string): URLSearchParams {
  const params = new URLSearchParams(search);
  for (const [key, value] of new URLSearchParams(hash.replace(/^#/, ""))) {
    if (!params.has(key)) params.set(key, value);
  }
  return params;
}

/**
 * The only parameters the app's sign-in return reads: its PKCE `code` (and
 * `type`), or why the link failed. Nothing else is passed on: not a
 * `token_hash` (the app accepts only PKCE codes it started), and never tokens
 * (`access_token` / `refresh_token`) that an implicit-flow link would carry in
 * its fragment.
 */
export const HANDOFF_PARAMS = ["code", "type", "error", "error_code", "error_description"] as const;

/** The same sign-in return, addressed to the app, carrying only HANDOFF_PARAMS. */
export function appHandoffUrl(search: string, hash: string): string {
  const all = linkParams(search, hash);
  const kept = new URLSearchParams();
  for (const key of HANDOFF_PARAMS) {
    const value = all.get(key);
    if (value !== null) kept.set(key, value);
  }
  const query = kept.toString();
  return query ? `${APP_AUTH_CALLBACK}?${query}` : APP_AUTH_CALLBACK;
}

/** Whether the link failed before reaching the app, and how: an expired or used link, or any other error. */
export function linkProblem(search: string, hash: string): "expired" | "failed" | null {
  const params = linkParams(search, hash);
  const code = params.get("error_code");
  if (code === "otp_expired") return "expired";
  if (code || params.get("error") || params.get("error_description")) return "failed";
  return null;
}

/**
 * Whether this browser is on a phone or tablet, where the app can be. iPadOS
 * Safari reports a Mac, so a Mac with a touch screen counts as an iPad.
 */
export function isHandheld(userAgent: string, maxTouchPoints: number): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}
