"use server";

/**
 * Server actions for the Plaid UI (design §11, §18, §24). Every action:
 *  - authenticates with the session (`getSessionUser`);
 *  - takes only an id + the user's choice, and re-reads the rest through the
 *    user's RLS-scoped Supabase client;
 *  - revalidates the pages that show synced data.
 *
 * The service-role sync engine is reached only after an ownership check, and
 * only with an `item_id` that RLS confirmed belongs to the caller. Sync, account
 * mapping and the import toggle live in `./commands.ts`, shared with the
 * native `/api/mobile/plaid/*` routes; these actions adapt them to forms.
 */
import { revalidateUserData } from "@/server/revalidate";
import { LOCKED_MESSAGE } from "@/lib/ownership";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import {
  answerDetachedHeldSchema,
  answerSignCheckSchema,
  clearAccountReviewSchema,
  disconnectBankSchema,
  mapAccountsSchema,
  mappingSuggestionsSchema,
  setAccountCalculationExclusionSchema,
  setAccountImportingSchema,
} from "@/lib/validation/plaid";
import { setAccountCalculationExclusion } from "./account-exclusion";
import { disconnectPlaidItem } from "./disconnect";
import { db } from "@/lib/db";
import type { MappingSuggestion } from "@/lib/accounts/account-suggestion";
import { loadMappingSuggestions } from "@/lib/plaid/mapping-suggestions";
import {
  categorizeBankTransactionFor,
  clearAccountReviewFor,
  mapAccountsFor,
  rescanUncategorizedFor,
  setAccountImportingFor,
  syncConnectionFor,
} from "./commands";
import { changeSignConventionAnswer, resolveSignConventionFromAnswer } from "./sign-answer";
import { changeDetachedHeldAnswer, resolveDetachedHeldFromAnswer } from "./detached-sign-answer";

export type PlaidActionState = {
  error?: string;
  fieldError?: string;
  warning?: string;
  ok?: boolean;
};


async function withUser() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return { user, supabase: await createClient() };
}

/**
 * Pull `/transactions/sync` for one connected Item, now. Used by "Sync now" on
 * a connected bank and once at the end of account mapping so imported
 * transactions show up straight away (design §30.12 manual refresh).
 */
export async function syncConnection(itemId: string): Promise<PlaidActionState> {
  const { user, supabase } = await withUser();
  const result = await syncConnectionFor(supabase, user.id, itemId);
  if (!result.ok) return { error: result.message };
  revalidateUserData();
  return result.warning ? { ok: true, warning: result.warning } : { ok: true };
}

export async function mapAccounts(
  _prev: PlaidActionState,
  formData: FormData,
): Promise<PlaidActionState> {
  const raw = {
    plaidItemId: String(formData.get("plaidItemId") ?? ""),
    entries: safeJson(formData.get("entries")),
  };
  const parsed = mapAccountsSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldError: parsed.error.issues[0]?.message ?? "Check the account choices and try again." };
  }
  const { plaidItemId, entries } = parsed.data;

  const { user, supabase } = await withUser();
  const result = await mapAccountsFor(supabase, user.id, plaidItemId, entries);
  if (!result.ok) return { error: result.message };
  revalidateUserData();
  return result.warning ? { ok: true, warning: result.warning } : { ok: true };
}

/**
 * The mapping step's reconnect suggestions (owner decision 2026-10-02): per unmapped Plaid account of this connection,
 * the Budgts account the same bank account fed before. Read-only, through the caller's RLS client.
 */
export async function mappingSuggestionsAction(
  plaidItemId: string,
): Promise<{ ok: true; suggestions: Record<string, MappingSuggestion> } | { ok: false }> {
  const parsed = mappingSuggestionsSchema.safeParse({ plaidItemId });
  if (!parsed.success) return { ok: false };
  const { user, supabase } = await withUser();
  try {
    const suggestions = await loadMappingSuggestions(supabase, user.id, parsed.data.plaidItemId);
    return suggestions ? { ok: true, suggestions } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * Clear an account's anomaly-review flag (design: 2026-09-12). Deliberately an
 * explicit, one-account-at-a-time owner action — never automatic, and never
 * something a stray tap on the read-only warning banner can trigger. Clearing
 * the flag does not touch any transaction row; it only stops the warning.
 */
export async function clearAccountReview(
  _prev: PlaidActionState,
  formData: FormData,
): Promise<PlaidActionState> {
  const parsed = clearAccountReviewSchema.safeParse({
    plaidAccountRowId: String(formData.get("plaidAccountRowId") ?? ""),
  });
  if (!parsed.success) return { error: "Something went wrong. Refresh and try again." };

  const { supabase } = await withUser();
  const result = await clearAccountReviewFor(supabase, parsed.data.plaidAccountRowId);
  if (!result.ok) return { error: result.message };

  revalidateUserData();
  return { ok: true };
}

/**
 * The user's answer to "Was this money going out or coming in?" about one held transaction (design: 2026-10-01 card
 * payments §5): resolves the account's transaction format and releases its held rows. Ownership is enforced inside
 * `resolveSignConventionFromAnswer` against the session user, never client state.
 */
export async function answerSignCheckAction(
  _prev: PlaidActionState,
  formData: FormData,
): Promise<PlaidActionState> {
  const parsed = answerSignCheckSchema.safeParse({
    plaidAccountRowId: String(formData.get("plaidAccountRowId") ?? ""),
    transactionId: String(formData.get("transactionId") ?? ""),
    answer: String(formData.get("answer") ?? ""),
  });
  if (!parsed.success) return { error: "Something went wrong. Refresh and try again." };

  const { user, supabase } = await withUser();
  const result = await resolveSignConventionFromAnswer(
    db(),
    supabase,
    user.id,
    parsed.data.plaidAccountRowId,
    parsed.data.transactionId,
    parsed.data.answer,
  );
  if (result.outcome === "locked") return { error: LOCKED_MESSAGE };
  if (result.outcome === "not_found") return { error: "That transaction is no longer waiting. Refresh and try again." };
  if (result.outcome === "busy") return { error: BUSY_MESSAGE };
  if (result.outcome === "setting_up") return { error: SETTING_UP_MESSAGE };

  revalidateUserData();
  return { ok: true };
}

const BUSY_MESSAGE = "This bank is syncing right now. Try again in a moment.";
const SETTING_UP_MESSAGE = "Finish choosing which accounts to import from this bank first.";

/**
 * "Change answer" (design: 2026-10-01 card payments §5a), and "Amounts on this account look reversed?" for an account
 * resolved from evidence (§5b): the user answers the question for a resolved account; a different answer flips the
 * account's transaction format and re-evaluates its rows.
 * Ownership is enforced inside `changeSignConventionAnswer` against the session user, never client state.
 */
export async function changeSignAnswerAction(
  _prev: PlaidActionState,
  formData: FormData,
): Promise<PlaidActionState> {
  const parsed = answerSignCheckSchema.safeParse({
    plaidAccountRowId: String(formData.get("plaidAccountRowId") ?? ""),
    transactionId: String(formData.get("transactionId") ?? ""),
    answer: String(formData.get("answer") ?? ""),
  });
  if (!parsed.success) return { error: "Something went wrong. Refresh and try again." };

  const { user, supabase } = await withUser();
  const result = await changeSignConventionAnswer(
    db(),
    supabase,
    user.id,
    parsed.data.plaidAccountRowId,
    parsed.data.transactionId,
    parsed.data.answer,
  );
  if (result.outcome === "locked") return { error: LOCKED_MESSAGE };
  if (result.outcome === "not_found" || result.outcome === "not_answered") {
    return { error: "This account can't change its answer. Refresh and try again." };
  }
  if (result.outcome === "busy") return { error: BUSY_MESSAGE };
  if (result.outcome === "setting_up") return { error: SETTING_UP_MESSAGE };

  revalidateUserData();
  return { ok: true };
}

/**
 * The question about held rows a removed bank left behind (design: 2026-10-01 card payments §5c), first answer and
 * "Change answer". The group (Budgts account + original bank feed) comes from the transaction, checked against the
 * session user inside `resolveDetachedHeldFromAnswer` / `changeDetachedHeldAnswer`, never from client state.
 */
export async function answerDetachedHeldAction(_prev: PlaidActionState, formData: FormData): Promise<PlaidActionState> {
  const parsed = answerDetachedHeldSchema.safeParse({
    transactionId: String(formData.get("transactionId") ?? ""),
    answer: String(formData.get("answer") ?? ""),
  });
  if (!parsed.success) return { error: "Something went wrong. Refresh and try again." };
  const { user, supabase } = await withUser();
  const result = await resolveDetachedHeldFromAnswer(db(), supabase, user.id, parsed.data.transactionId, parsed.data.answer);
  if (result.outcome === "locked") return { error: LOCKED_MESSAGE };
  if (result.outcome === "not_found") return { error: "That transaction is no longer waiting. Refresh and try again." };
  revalidateUserData();
  return { ok: true };
}

export async function changeDetachedHeldAnswerAction(_prev: PlaidActionState, formData: FormData): Promise<PlaidActionState> {
  const parsed = answerDetachedHeldSchema.safeParse({
    transactionId: String(formData.get("transactionId") ?? ""),
    answer: String(formData.get("answer") ?? ""),
  });
  if (!parsed.success) return { error: "Something went wrong. Refresh and try again." };
  const { user, supabase } = await withUser();
  const result = await changeDetachedHeldAnswer(db(), supabase, user.id, parsed.data.transactionId, parsed.data.answer);
  if (result.outcome === "locked") return { error: LOCKED_MESSAGE };
  if (result.outcome === "not_found" || result.outcome === "not_answered") {
    return { error: "These transactions can't change their answer. Refresh and try again." };
  }
  revalidateUserData();
  return { ok: true };
}

/**
 * Exclude/re-include a Plaid account's transactions from financial
 * calculations (design: 2026-09-13 Advancial containment). Deliberately an
 * explicit, one-account-at-a-time owner action — never automatic. Ownership
 * and the `needs_review`-required-to-exclude rule are enforced by
 * `setAccountCalculationExclusion` itself, not just RLS. No transaction row
 * is ever touched.
 */
export async function setAccountCalculationExclusionAction(
  _prev: PlaidActionState,
  formData: FormData,
): Promise<PlaidActionState> {
  const parsed = setAccountCalculationExclusionSchema.safeParse({
    plaidAccountRowId: String(formData.get("plaidAccountRowId") ?? ""),
    excluded: formData.get("excluded") === "1",
  });
  if (!parsed.success) return { error: "Something went wrong. Refresh and try again." };

  const { user, supabase } = await withUser();
  const result = await setAccountCalculationExclusion(
    supabase,
    user.id,
    parsed.data.plaidAccountRowId,
    parsed.data.excluded,
  );

  if (result.outcome === "not_found") return { error: "That account no longer exists." };
  if (result.outcome === "needs_review_required") {
    return { error: "Only an account currently flagged for review can be excluded from totals." };
  }

  revalidateUserData();
  return { ok: true };
}

/**
 * Turn importing on/off for one already-linked Plaid account (design
 * 2026-09-15). Reversible in the sense that turning off never nulls
 * `account_id` (unlike the "Don't import this one" choice in account
 * mapping), so turning back on resumes the SAME Budgts account — no
 * re-mapping, no risk of a second duplicate account being created for the
 * same real-world bank account. Requires a Budgts account already mapped;
 * an account that was never mapped has nothing to resume.
 *
 * NOT reversible for data: `link_state = 'ignored'` makes the adapter skip
 * this account's rows outright (adapter.ts's `ignored-account` check —
 * unchanged, pre-existing behavior, same as it's always meant for "Don't
 * import this one"), and Plaid's `/transactions/sync` cursor is per-Item,
 * so ANY sync of a sibling account on the same Item while this one is
 * paused — a manual "Sync now", the sync-due cron, a webhook — advances
 * past this account's new transactions with no way to re-fetch them later.
 * Turning back on only imports what arrives AFTER that point, not what
 * happened during the pause. A true no-loss pause would need to land those
 * rows held (mirroring the sign-convention pending mechanism) rather than
 * skip them — worth building if pausing becomes a routine action rather
 * than an occasional one; out of scope for this pass.
 */
export async function setAccountImportingAction(
  _prev: PlaidActionState,
  formData: FormData,
): Promise<PlaidActionState> {
  const parsed = setAccountImportingSchema.safeParse({
    plaidAccountRowId: String(formData.get("plaidAccountRowId") ?? ""),
    importing: formData.get("importing") === "1",
  });
  if (!parsed.success) return { error: "Something went wrong. Refresh and try again." };

  const { user, supabase } = await withUser();
  const result = await setAccountImportingFor(supabase, user.id, parsed.data.plaidAccountRowId, parsed.data.importing);
  if (!result.ok) return { error: result.message };
  revalidateUserData();
  return result.warning ? { ok: true, warning: result.warning } : { ok: true };
}

export async function categorizeBankTransaction(
  _prev: PlaidActionState,
  formData: FormData,
): Promise<PlaidActionState> {
  const rawCategoryId = String(formData.get("categoryId") ?? "");
  const rawStandard = String(formData.get("standardCategoryName") ?? "");
  const input = {
    transactionId: String(formData.get("transactionId") ?? ""),
    categoryId: rawCategoryId || undefined,
    standardCategoryName: rawStandard || undefined,
  };
  const { user, supabase } = await withUser();
  // The rule lives in categorizeBankTransactionFor (./commands.ts), shared with the native API.
  const result = await categorizeBankTransactionFor(supabase, user.id, input);
  if (!result.ok) return { error: result.message };

  revalidateUserData();
  return { ok: true };
}

/**
 * "Re-scan" — run the deterministic evidence chain over every still-uncategorised
 * bank row for the signed-in user and fill the ones it can now resolve. Safe to
 * run repeatedly (idempotent); never touches user-set, removed, or transfer
 * rows. For the pre-existing backlog + picking up merchant-knowledge additions.
 */
export async function rescanUncategorized(): Promise<PlaidActionState> {
  const { user } = await withUser();
  const result = await rescanUncategorizedFor(user.id);
  revalidateUserData();
  return { ok: true, warning: result.ok ? result.warning : undefined };
}

export async function disconnectBank(
  _prev: PlaidActionState,
  formData: FormData,
): Promise<PlaidActionState> {
  const parsed = disconnectBankSchema.safeParse({
    itemId: String(formData.get("itemId") ?? ""),
    purge: formData.get("purge") === "1",
  });
  if (!parsed.success) return { error: "Something went wrong. Refresh and try again." };

  const { user, supabase } = await withUser();
  const result = await disconnectPlaidItem(supabase, {
    userId: user.id,
    itemId: parsed.data.itemId,
    purge: parsed.data.purge,
  });
  if (!result.ok) {
    return { error: result.status === 404 ? "That bank is already disconnected." : result.error };
  }

  revalidateUserData();
  return { ok: true };
}

function safeJson(v: FormDataEntryValue | null): unknown {
  if (typeof v !== "string") return undefined;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}
