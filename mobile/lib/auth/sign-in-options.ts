/**
 * How the app asks Supabase to sign someone in. Pure (the environment is passed
 * in), so the contract is unit-tested.
 *
 * Same account as the web: the app uses the same Supabase project and the same
 * Google provider as budgts.com, so one Google account is one Budgts user
 * wherever it signs in (Supabase keys a Google identity by Google's own user
 * id), and an email address is one user whichever way it signs in (Supabase
 * links a verified Google identity to the email's existing user).
 */

/**
 * Where a sign-in email link lands: the web page that hands it to the app
 * (src/app/app/auth/callback). A link opened on a computer then gets a page
 * that says to open it on the phone, not a dead `budgts://` address. With
 * universal links / app links set up, the phone opens the app straight away.
 * Must be on the Supabase project's Redirect URLs list (a
 * `https://budgts.com/**` entry covers it); Supabase sends an address that
 * isn't to the Site URL instead.
 */
export const EMAIL_LINK_PATH = "/app/auth/callback";

export function emailLinkRedirect(apiBaseUrl: string | undefined): string {
  if (!apiBaseUrl) throw new Error("EXPO_PUBLIC_API_BASE_URL must be set (see .env.local.example)");
  return `${apiBaseUrl.replace(/\/+$/, "")}${EMAIL_LINK_PATH}`;
}

/**
 * Google through Supabase's hosted OAuth, as on the web, returning to the app
 * (`budgts://auth/callback`, caught by the in-app browser session). Google
 * always asks which account: someone with two Google accounts picks the one
 * they use on budgts.com rather than being signed in silently as the other.
 */
export function googleSignInOptions(redirectTo: string) {
  return {
    provider: "google" as const,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  };
}

/**
 * Sign in with Apple stays off until the owner's Apple developer account
 * exists (it waits on the LLC's D-U-N-S number) and Supabase's Apple provider
 * is set up (mobile/README.md). Then set `EXPO_PUBLIC_APPLE_SIGN_IN=on` for
 * the iOS build; the button also needs the OS to offer it (iOS 13+).
 */
export function appleSignInEnabled(flag: string | undefined): boolean {
  return flag === "on";
}

/** Seconds before another sign-in email may be sent, after one went out (Supabase's default per-address limit). */
export const RESEND_AFTER_SECONDS = 60;
