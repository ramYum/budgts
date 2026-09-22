import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DeleteAccountConfirm } from "@/components/delete-account-confirm";
import { SignInForm } from "@/app/(auth)/sign-in/sign-in-form";
import { getSessionUser } from "@/lib/supabase/server";
import { isRecentlyAuthenticated } from "@/lib/account/reauth";

export const metadata: Metadata = { title: "Delete account" };

const NEXT = "/settings/delete-account";

/**
 * The web-accessible account-deletion entry point (also satisfies the Google
 * Play "web-accessible deletion-request path" requirement, since this page
 * needs no mobile app installed — mobile-launch spec §11, account-deletion
 * design §9). Sits under the normal authenticated app shell, so signing in
 * here is identical to signing in anywhere else in the product.
 *
 * Requires a *recent* sign-in before showing the actual destructive step —
 * Budgts has no password to re-prompt for, so "recent" is the step-up
 * mechanism (design §8; the server independently re-checks this in
 * /api/account/delete, this page's gate is UX only).
 */
export default async function DeleteAccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=" + encodeURIComponent(NEXT));

  if (!isRecentlyAuthenticated(user)) {
    return (
      <div className="space-y-4 pt-1">
        <PageHeader title="Delete account" back="/settings" />
        <div className="card space-y-3 rounded-2xl border border-hairline p-4">
          <p className="text-sm font-semibold text-heading">Verify it&apos;s you first</p>
          <p className="text-sm text-muted">
            Deleting your account is permanent, so we need a fresh sign-in before continuing.
          </p>
        </div>
        <SignInForm next={NEXT} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-1">
      <PageHeader title="Delete account" back="/settings" />
      <DeleteAccountConfirm />
    </div>
  );
}
