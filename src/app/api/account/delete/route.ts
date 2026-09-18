/**
 * POST /api/account/delete — permanently delete (or, if the account has
 * monetization history, de-identify) the signed-in user's account.
 *
 * A plain Route Handler, not a Server Action, deliberately — so the same
 * endpoint is callable by the future native mobile client with a bearer
 * token, not just a browser session (mobile-launch spec §6). The web UI
 * (`/settings/delete-account`) is one caller of this, not a special path.
 *
 * The user id is never taken from the request body — it comes only from the
 * verified session, exactly like every other authenticated route in this
 * app. Requires a recent sign-in (step-up auth, see reauth.ts) since Budgts
 * has no password to re-prompt for.
 *
 * Design authority: docs/specs/2026-09-19-account-deletion-design.md.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { deleteAccount } from "@/lib/account/delete-account";
import { isRecentlyAuthenticated } from "@/lib/account/reauth";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!isRecentlyAuthenticated(user)) {
    return NextResponse.json(
      { error: "reauth_required", message: "Please sign in again to confirm this action." },
      { status: 403 },
    );
  }

  const result = await deleteAccount(adminSupabase(), user.id);
  if (!result.ok) {
    console.error("[account] deletion failed", result.error);
    return NextResponse.json({ error: "could not delete account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, alreadyDeleted: result.alreadyDeleted, path: result.path });
}
