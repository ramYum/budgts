"use server";

import { createClient, getSessionUser } from "@/lib/supabase/server";
import { signInWithGoogle } from "@/server/auth";
import { DELETE_ACCOUNT_CONFIRM_PATH } from "@/lib/account/screen";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export type ReauthLinkState = { sent?: boolean; error?: string };

/**
 * Account deletion's fresh sign-in by email: a sign-in link to the SIGNED-IN user's own address (from the verified
 * session, never the form), returning them to the deletion screen's confirm step. Budgts has no password, so this
 * round-trip is the step-up (src/lib/account/reauth.ts); `shouldCreateUser: false` so it can never mint an account.
 */
export async function requestReauthLink(_prev: ReauthLinkState, _formData: FormData): Promise<ReauthLinkState> {
  const user = await getSessionUser();
  if (!user?.email) return { error: "You're signed out. Sign in again to continue." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(DELETE_ACCOUNT_CONFIRM_PATH)}`,
    },
  });
  if (error) {
    return {
      error:
        error.status === 429
          ? "A link was sent a moment ago. Wait a minute, then try again."
          : "We couldn't send the link. Try again in a moment.",
    };
  }
  return { sent: true };
}

/** The same fresh sign-in through Google, for an account that uses it. Back to the confirm step afterwards. */
export async function reauthWithGoogle() {
  const form = new FormData();
  form.set("next", DELETE_ACCOUNT_CONFIRM_PATH);
  await signInWithGoogle(form);
}
