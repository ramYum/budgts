import type { Metadata } from "next";
import { StandaloneShell } from "@/components/standalone-shell";
import { DeleteAccountFlow } from "@/components/account/delete-account-flow";
import { createClient } from "@/lib/supabase/server";
import { isRecentlyAuthenticated } from "@/lib/account/reauth";
import { legalFacts } from "@/lib/legal/config";
import { getPrivilegedCookieUser } from "@/server/privileged-user";

export const metadata: Metadata = { title: "Delete account" };

/**
 * Settings → Delete account, on the web (and the screen the public /account-deletion page sends a signed-out visitor
 * to, through sign-in). It sits outside the dashboard shell on purpose: that shell sends anyone who hasn't finished
 * onboarding to /onboarding, and deleting an account must never depend on setting one up first. A focused standalone
 * column also keeps a destructive flow free of the tab bar.
 *
 * What the page decides, from Supabase Auth (the network check the deletion route itself uses, never local claims):
 * whether the sign-in is recent enough (the 10-minute step-up), which fresh sign-in to offer, and whether a deletion
 * already started (the write guard's own `account_accepts_writes()`). The route re-checks all of it; this only picks
 * the first state to show. Design: docs/specs/2026-09-19-account-deletion-design.md.
 */
export default async function DeleteAccountPage({ searchParams }: PageProps<"/settings/delete-account">) {
  const [user, sp] = await Promise.all([getPrivilegedCookieUser(), searchParams]);
  const facts = legalFacts();
  const supportEmail = facts?.contactEmail ?? null;

  if (!user) {
    return (
      <StandaloneShell align="top">
        <DeleteAccountFlow email="" recent={false} google={false} inProgress={false} initial="signed_out" supportEmail={supportEmail} />
      </StandaloneShell>
    );
  }

  // `true` while the account accepts writes; false once a deletion has taken the lock. A failed read is treated as
  // "not started": the flow is the same either way, and the route itself resumes a started deletion.
  const { data: acceptsWrites } = await (await createClient()).rpc("account_accepts_writes");
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider as string];

  return (
    <StandaloneShell align="top">
      <DeleteAccountFlow
        email={user.email ?? ""}
        recent={isRecentlyAuthenticated(user)}
        google={providers.includes("google")}
        inProgress={acceptsWrites === false}
        initial={sp.step === "confirm" ? "confirm" : "intro"}
        supportEmail={supportEmail}
      />
    </StandaloneShell>
  );
}
