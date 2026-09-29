import type { Metadata } from "next";
import { StandaloneShell } from "@/components/standalone-shell";
import { DeleteAccountFlow } from "@/components/account/delete-account-flow";
import { createClient } from "@/lib/supabase/server";
import { deletionFacts, deletionScreenState } from "@/lib/account/deletion-screen";
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
  // The state and the facts come from deletion-screen.ts, shared with the native GET /api/mobile/account/delete.
  const { supportEmail, billing, keepsRecords } = deletionFacts();

  if (!user) {
    return (
      <StandaloneShell align="top">
        <DeleteAccountFlow email="" recent={false} google={false} inProgress={false} initial="signed_out" supportEmail={supportEmail} billing={billing} keepsRecords={keepsRecords} />
      </StandaloneShell>
    );
  }

  const state = await deletionScreenState(user, await createClient());

  return (
    <StandaloneShell align="top">
      <DeleteAccountFlow
        email={state.email}
        recent={state.recent}
        google={state.google}
        inProgress={state.inProgress}
        initial={sp.step === "confirm" ? "confirm" : "intro"}
        supportEmail={supportEmail}
        billing={billing}
        keepsRecords={keepsRecords}
      />
    </StandaloneShell>
  );
}
