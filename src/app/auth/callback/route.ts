import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

/**
 * Completes sign-in: exchanges the OAuth `code` (PKCE) or verifies the magic
 * link `token_hash`, then redirects to `next` (default `/`).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const safeNext = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }

  return NextResponse.redirect(
    `${origin}/sign-in?error=${encodeURIComponent("Sign-in link is invalid or expired")}`,
  );
}
