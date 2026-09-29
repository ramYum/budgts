/**
 * What every signed-in native screen shows around its content, the way the web dashboard layout does on every page: the
 * "Needs a category" bell's count, the bank review warnings (`<ReviewBanner>`) and the account-deletion lock
 * (`<DeletionBanner>`). The contract of `GET /api/mobile/status`; each part comes from the same shared function the web
 * layout calls, so the two can never disagree. Also the Activity screen's extras (`GET /api/mobile/activity`): the
 * "Needs a category" merchant groups and the limited-history advisory.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountWritesLocked } from "@/lib/account/write-lock";
import { loadCategories, MOBILE_API_VERSION } from "@/lib/mobile/reads";
import { groupUncategorized, type MerchantGroup } from "@/lib/plaid/group-uncategorized";
import { loadLimitedHistoryMessages } from "@/lib/plaid/limited-history";
import { loadReviewMessages, type ReviewMessages } from "@/lib/plaid/review-messages";
import { loadNeedsCategory, missingStandardCategories, needsCategoryCount } from "@/lib/transactions/needs-category";

async function profileCreatedAt(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("created_at").eq("id", userId).maybeSingle();
  if (error) throw new Error("profile_read_failed");
  return (data as { created_at: string } | null)?.created_at ?? null;
}

export type MobileStatus = {
  version: typeof MOBILE_API_VERSION;
  /** Bank rows awaiting a category (the header bell); null when bank connections are switched off. */
  needsCategoryCount: number | null;
  /** The bank review warnings, verbatim; both null when nothing is flagged (or bank connections are off). */
  review: ReviewMessages;
  /** A started deletion has locked the account: every screen says it is read-only, with the way to finish deleting. */
  deletionInProgress: boolean;
};

export async function loadMobileStatus(supabase: SupabaseClient, userId: string, plaidEnabled: boolean): Promise<MobileStatus> {
  const [count, review, locked] = await Promise.all([
    plaidEnabled
      ? profileCreatedAt(supabase, userId).then((createdAt) => (createdAt ? needsCategoryCount(supabase, createdAt) : 0))
      : Promise.resolve(null),
    plaidEnabled ? loadReviewMessages(supabase) : Promise.resolve({ advisory: null, excluded: null }),
    accountWritesLocked(supabase),
  ]);
  return { version: MOBILE_API_VERSION, needsCategoryCount: count, review, deletionInProgress: locked };
}

export type MobileActivityExtras = {
  version: typeof MOBILE_API_VERSION;
  /** False when bank connections are switched off: no prompt, no advisory. */
  plaidEnabled: boolean;
  /** "Needs a category", one group per merchant, most rows first; each group's `anchorId` is the row to categorize. */
  needsCategory: MerchantGroup[];
  /** Standard categories the user doesn't have, offered in the picker as "add this one". */
  missingStandardCategories: string[];
  /** The limited-history advisory lines (a bank sent less history than the 90 days asked for). */
  limitedHistory: string[];
};

export async function loadMobileActivityExtras(
  supabase: SupabaseClient,
  userId: string,
  plaidEnabled: boolean,
): Promise<MobileActivityExtras> {
  if (!plaidEnabled) {
    return { version: MOBILE_API_VERSION, plaidEnabled, needsCategory: [], missingStandardCategories: [], limitedHistory: [] };
  }
  const [createdAt, categories, limitedHistory] = await Promise.all([
    profileCreatedAt(supabase, userId),
    loadCategories(supabase),
    loadLimitedHistoryMessages(supabase),
  ]);
  const rows = createdAt ? await loadNeedsCategory(supabase, createdAt, categories) : [];
  return {
    version: MOBILE_API_VERSION,
    plaidEnabled,
    needsCategory: groupUncategorized(rows),
    missingStandardCategories: missingStandardCategories(categories.map((c) => c.name)),
    limitedHistory,
  };
}
