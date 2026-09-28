/**
 * POST /api/account/delete — permanently delete (or, if the account has
 * monetization history, de-identify) the signed-in user's account.
 *
 * A plain Route Handler, not a Server Action, deliberately — so the same
 * endpoint is callable by the native app with a Bearer token, not just a
 * browser session (mobile-launch spec §6). The web deletion screen (Phase 1)
 * will be one caller of this, not a special path. `getPrivilegedUser`
 * authenticates either caller against Supabase Auth over the network (a
 * revoked session is refused) and always derives the user id from it, never
 * from the request body.
 *
 * Requires a recent sign-in (step-up auth, see reauth.ts) since Budgts has
 * no password to re-prompt for.
 *
 * Design authority: docs/specs/2026-09-19-account-deletion-design.md.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPrivilegedUser } from "@/server/privileged-user";
import { describePlaidError } from "@/lib/plaid/error-policy";
import { AdminConfigError, adminSupabase } from "@/lib/supabase/admin";
import { deleteAccount } from "@/lib/account/delete-account";
import { isRecentlyAuthenticated } from "@/lib/account/reauth";
import { billingCheckFor } from "@/lib/billing/wiring";
import { MANAGE_STORE_LINKS } from "@/lib/billing/manage";

/** Every unexpected failure looks the same to the client: no detail about what broke. */
const genericFailure = () => NextResponse.json({ error: "could not delete account" }, { status: 500 });

export async function POST(request: Request) {
  try {
    // 1. Who is asking — verified by Supabase Auth, never taken from the request.
    const user = await getPrivilegedUser(request);
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
      const missing = e.missing.join(", ");
      console.error("[account] deletion unavailable: server admin configuration is missing", { missing });
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

    const result = await deleteAccount(admin, user.id, undefined, await billingCheckFor());
    if (!result.ok) {
      // result.error is already log-safe: deleteAccount reduces a database error to its SQLSTATE.
      const failedStep = result.error;
      console.error("[account] deletion failed", { failedStep });
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
      // Plaid would not confirm removing a bank, so deletion stopped before the lock (strict removal): the account is
      // fully usable, though banks removed before that one stay disconnected. The one failure the user can fix:
      // disconnect that bank themselves, then try again.
      if (result.reason === "plaid_removal") {
        return NextResponse.json(
          {
            error: "plaid_removal_failed",
            retryable: true,
            message:
              "We couldn't disconnect one of your banks, so your account wasn't deleted. Disconnect it in Connected banks, then try again.",
          },
          { status: 502 },
        );
      }
      return genericFailure();
    }

    return NextResponse.json({
      ok: true,
      alreadyDeleted: result.alreadyDeleted,
      path: result.path,
      // Deleting the account does not cancel an Apple/Google subscription. When one may still be running, say so and
      // point at the stores' own management pages (the deletion itself is never blocked by this).
      ...("storeSubscriptionMayBeActive" in result && result.storeSubscriptionMayBeActive
        ? { storeSubscriptionMayBeActive: true, manageSubscriptionLinks: MANAGE_STORE_LINKS }
        : {}),
    });
  } catch (e) {
    // Never a raw error page, and never the error text: name only.
    console.error("[account] deletion crashed", describePlaidError(e));
    return genericFailure();
  }
}
