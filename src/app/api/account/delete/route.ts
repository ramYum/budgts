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
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestUser } from "@/lib/auth/get-request-user";
import { AdminConfigError, adminSupabase } from "@/lib/supabase/admin";
import { deleteAccount } from "@/lib/account/delete-account";
import { isRecentlyAuthenticated } from "@/lib/account/reauth";

/** Every unexpected failure looks the same to the client: no detail about what broke. */
const genericFailure = () => NextResponse.json({ error: "could not delete account" }, { status: 500 });

export async function POST(request: Request) {
  try {
    // 1. Who is asking — verified by Supabase Auth, never taken from the request.
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // 2. Can this server delete accounts at all? Checked BEFORE anything else happens, and only
    //    AFTER authentication so an outsider cannot probe how the server is configured. The
    //    client is told only that deletion is temporarily unavailable — never which setting is
    //    missing. The variable NAMES (never values) go to the server log for the operator.
    let admin: SupabaseClient;
    try {
      admin = adminSupabase();
    } catch (e) {
      if (!(e instanceof AdminConfigError)) throw e;
      console.error("[account] deletion unavailable: server admin configuration is missing:", e.missing.join(", "));
      return NextResponse.json(
        {
          error: "account_deletion_unavailable",
          message: "Account deletion is temporarily unavailable. Please try again later.",
        },
        { status: 503 },
      );
    }

    // 3. Step-up: a recent real sign-in.
    if (!isRecentlyAuthenticated(user)) {
      return NextResponse.json(
        { error: "reauth_required", message: "Please sign in again to confirm this action." },
        { status: 403 },
      );
    }

    const result = await deleteAccount(admin, user.id);
    if (!result.ok) {
      console.error("[account] deletion failed", result.error);
      // Once deletion has started the account is read-only. Say so, and say that trying again finishes it:
      // the user must never be left guessing why nothing they do is saving, or how to get out of it.
      if (result.locked) {
        return NextResponse.json(
          {
            error: "account_deletion_incomplete",
            retryable: true,
            message:
              "We couldn't finish deleting your account. It is now read-only until the deletion completes — please try again.",
          },
          { status: 500 },
        );
      }
      return genericFailure();
    }

    return NextResponse.json({ ok: true, alreadyDeleted: result.alreadyDeleted, path: result.path });
  } catch (e) {
    // Never a raw error page, and never the error text: name only.
    console.error("[account] deletion crashed:", e instanceof Error ? e.name : "non-error value thrown");
    return genericFailure();
  }
}
