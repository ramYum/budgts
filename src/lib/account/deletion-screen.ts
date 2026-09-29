import "server-only";
/**
 * What the Delete account screen decides before anything is confirmed: whether the sign-in is recent enough for the
 * step-up (reauth.ts), which fresh sign-in to offer, whether a deletion already started, and the facts its copy shows.
 * One implementation for the web screen (`src/app/(app)/settings/delete-account/page.tsx`) and the native
 * `GET /api/mobile/account/delete` (moved out of the page, 2026-09-29, Stage 2B). The deletion route
 * (`POST /api/account/delete`) re-checks all of it; this only picks the first state to show.
 *
 * `user` must come from Supabase Auth over the network (`getPrivilegedUser` / `getPrivilegedCookieUser`): local claims
 * cannot see a revoked session and carry no `last_sign_in_at`.
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isRecentlyAuthenticated } from "@/lib/account/reauth";
import { accountWritesLocked } from "@/lib/account/write-lock";
import { billingLive } from "@/lib/billing/config";
import { keepsRecordsAfterDeletion, legalFacts } from "@/lib/legal/config";

export type DeletionFacts = { supportEmail: string | null; billing: boolean; keepsRecords: boolean };

/** The facts the screen's copy shows, with or without a signed-in user. */
export function deletionFacts(): DeletionFacts {
  const facts = legalFacts();
  return { supportEmail: facts?.contactEmail ?? null, billing: billingLive(), keepsRecords: keepsRecordsAfterDeletion(facts) };
}

export type DeletionScreenState = DeletionFacts & {
  email: string;
  /** Signed in within the step-up window: the deletion can be confirmed without a fresh sign-in. */
  recent: boolean;
  /** Google is linked: offer the Google fresh sign-in as well as the email link. */
  google: boolean;
  /** A deletion already took the lock: the screen offers to finish it. */
  inProgress: boolean;
};

export async function deletionScreenState(user: User, supabase: Pick<SupabaseClient, "rpc">): Promise<DeletionScreenState> {
  // A failed lock read is treated as "not started": the flow is the same either way, and the route itself resumes a
  // started deletion.
  const inProgress = await accountWritesLocked(supabase);
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider as string];
  return {
    ...deletionFacts(),
    email: user.email ?? "",
    recent: isRecentlyAuthenticated(user),
    google: providers.includes("google"),
    inProgress,
  };
}
