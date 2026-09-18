/**
 * POST /api/account/delete — permanently delete (or, if the account has
 * monetization history, de-identify) the signed-in user's account.
 *
 * A plain Route Handler, not a Server Action, deliberately — so the same
 * endpoint is callable by the native mobile client with a Bearer token, not
 * just a browser session (mobile-launch spec §6). The web UI
 * (`/settings/delete-account`) is one caller of this, not a special path.
 * `getRequestUser` authenticates either caller and always derives the user
 * id from a verified token/session, never from the request body.
 *
 * Requires a recent sign-in (step-up auth, see reauth.ts) since Budgts has
 * no password to re-prompt for.
 *
 * Design authority: docs/specs/2026-09-19-account-deletion-design.md.
 */
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/get-request-user";
import { adminSupabase } from "@/lib/supabase/admin";
import { deleteAccount } from "@/lib/account/delete-account";
import { isRecentlyAuthenticated } from "@/lib/account/reauth";

export async function POST(request: Request) {
  const user = await getRequestUser(request);
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
