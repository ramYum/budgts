import "server-only";
/**
 * Plaid commands for a signed-in user — the one implementation behind the web Server Actions (`./actions.ts`) and the
 * native `/api/mobile/plaid/*` routes. Every command takes the CALLER'S Supabase client (cookie or Bearer), so RLS
 * confirms ownership before the owner-level sync engine (`db()`, `syncRunner()`) ever sees an id. Commands never
 * redirect or revalidate: that is the adapter's business. Messages are the web's own wording, shared verbatim.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { db } from "@/lib/db";
import { claimMissReason, findItemByPlaidItemId } from "@/lib/plaid/item-store";
import { claimMissMessage, runClaimedSync } from "@/lib/plaid/sync-runner";
import { standardCategory } from "@/lib/categories/standard";
import { recategorizeUncategorizedBankTxns } from "@/lib/plaid/recategorize";
import { categorizeBankTxnSchema, type AccountMapEntryInput } from "@/lib/validation/plaid";
import { accountWritesLocked } from "@/lib/account/write-lock";
import { LOCKED_MESSAGE, referencesVisible } from "@/lib/ownership";
import { drainItemInBackground, syncRunner } from "./service";

type SyncKind = { kind: "synced" } | { kind: "failed" } | { kind: "not_started"; message: string };

/**
 * A user-requested sync of an Item the caller was already confirmed to own, through the same per-Item lease as the
 * webhook and the sweep. Any pages left over (page cap) keep draining after the response.
 */
async function syncOwnedItem(itemId: string): Promise<SyncKind> {
  const out = await runClaimedSync(syncRunner(), itemId, { kind: "requested" });
  if (!out.claimed) {
    return { kind: "not_started", message: claimMissMessage(await claimMissReason(db(), itemId)) };
  }
  if (out.result.ok && out.morePending) after(() => drainItemInBackground(itemId));
  return out.result.ok ? { kind: "synced" } : { kind: "failed" };
}

/** Syncs the caller's Item if its owner is the caller (re-checked on the owner-level record); null when it is not. */
async function syncIfOwned(userId: string, itemId: string): Promise<SyncKind | null> {
  const record = await findItemByPlaidItemId(db(), itemId);
  if (!record || record.userId !== userId) return null;
  return syncOwnedItem(record.itemId);
}

/** `warning` is a message for the user (the work succeeded, the sync did not finish or start). */
export type PlaidCommandResult =
  | { ok: true; warning?: string }
  | { ok: false; error: "not_found" | "invalid" | "failed" | "locked"; message: string };

/** A refused write: `locked` (with the paused message) while an account deletion holds the lock, else `otherwise`. */
async function lockedOr(supabase: SupabaseClient, otherwise: PlaidCommandResult): Promise<PlaidCommandResult> {
  return (await accountWritesLocked(supabase)) ? { ok: false, error: "locked", message: LOCKED_MESSAGE } : otherwise;
}

const warningFor = (sync: SyncKind | null, prefix: string, failed: string): string | undefined => {
  if (!sync) return undefined;
  if (sync.kind === "not_started") return prefix ? `${prefix} ${sync.message}` : sync.message;
  if (sync.kind === "failed") return failed;
  return undefined;
};

/** "Sync now" for one connected Item (`item_id`, Plaid's id). */
export async function syncConnectionFor(supabase: SupabaseClient, userId: string, itemId: string): Promise<PlaidCommandResult> {
  // Ownership gate: RLS confirms this Item is the caller's before the owner-level engine ever sees the id.
  const { data: owned } = await supabase.from("plaid_items").select("item_id").eq("item_id", itemId).maybeSingle();
  if (!owned) return { ok: false, error: "not_found", message: "That bank connection no longer exists." };

  const sync = await syncIfOwned(userId, itemId);
  if (!sync) return { ok: false, error: "not_found", message: "That bank connection no longer exists." };
  const warning = warningFor(sync, "", "Connected, but the first sync didn't finish. It'll retry shortly.");
  return warning ? { ok: true, warning } : { ok: true };
}

/**
 * Account mapping for a newly linked Item (`plaid_items.id`): per Plaid account, a new Budgts account, an existing one,
 * or "don't import". Runs the first sync afterwards so imported transactions are on screen straight away.
 */
export async function mapAccountsFor(
  supabase: SupabaseClient,
  userId: string,
  plaidItemId: string,
  entries: AccountMapEntryInput[],
): Promise<PlaidCommandResult> {
  // Confirm the Item is the caller's and grab its Plaid `item_id` for the sync.
  const { data: item } = await supabase.from("plaid_items").select("item_id").eq("id", plaidItemId).maybeSingle();
  if (!item) return { ok: false, error: "not_found", message: "That bank connection no longer exists. Try connecting again." };

  // Every "existing" account must be the caller's own, checked before anything is written (src/lib/ownership.ts): a
  // foreign account id would otherwise route this bank's transactions into another user's account.
  const existing = await referencesVisible(
    supabase,
    "accounts",
    entries.map((e) => (e.mode === "existing" ? e.existingAccountId : null)),
  );
  if (!existing.ok) {
    return existing.error === "missing"
      ? { ok: false, error: "not_found", message: "That account no longer exists. Refresh and try again." }
      : { ok: false, error: "failed", message: "Could not save the account mapping. Try again." };
  }

  for (const entry of entries) {
    let accountId: string | null = null;
    let linkState: "mapped" | "ignored" = "ignored";

    if (entry.mode === "new") {
      const { data: created, error } = await supabase
        .from("accounts")
        .insert({ user_id: userId, name: entry.name, type: entry.type ?? "checking", source: "plaid" })
        .select("id")
        .single();
      if (error || !created) {
        return lockedOr(supabase, { ok: false, error: "failed", message: "Could not create the account. Try again." });
      }
      accountId = created.id;
      linkState = "mapped";
    } else if (entry.mode === "existing") {
      accountId = entry.existingAccountId ?? null;
      linkState = "mapped";
    }

    const { error: linkErr, count } = await supabase
      .from("plaid_accounts")
      .update({ account_id: accountId, link_state: linkState }, { count: "exact" })
      .eq("plaid_item_id", plaidItemId)
      .eq("plaid_account_id", entry.plaidAccountId);
    if (linkErr || count === 0) {
      const failure: PlaidCommandResult = linkErr
        ? { ok: false, error: "failed", message: "Could not save the account mapping. Try again." }
        : { ok: false, error: "not_found", message: "That bank account no longer exists. Try connecting again." };
      return lockedOr(supabase, failure);
    }
  }

  // First sync — so transactions are on screen when the user lands back.
  const sync = await syncIfOwned(userId, item.item_id);
  const warning = warningFor(sync, "Accounts saved.", "Accounts saved. The first sync didn't finish — it'll retry shortly.");
  return warning ? { ok: true, warning } : { ok: true };
}

/**
 * Turn importing on/off for one already-linked Plaid account (`plaid_accounts.id`). Turning off never nulls
 * `account_id`, so turning back on resumes the SAME Budgts account; it imports only what arrives from then on (Plaid's
 * cursor is per Item — see the web action's doc comment for why a pause can skip rows).
 */
export async function setAccountImportingFor(
  supabase: SupabaseClient,
  userId: string,
  plaidAccountRowId: string,
  importing: boolean,
): Promise<PlaidCommandResult> {
  // RLS scopes this to the caller.
  const { data: row } = await supabase
    .from("plaid_accounts")
    .select("account_id, plaid_item_id")
    .eq("id", plaidAccountRowId)
    .maybeSingle();
  if (!row) return { ok: false, error: "not_found", message: "That account no longer exists." };
  if (importing && !row.account_id) {
    return { ok: false, error: "invalid", message: "Choose which Budgts account to import into first." };
  }

  const { error } = await supabase
    .from("plaid_accounts")
    .update({ link_state: importing ? "mapped" : "ignored" })
    .eq("id", plaidAccountRowId);
  if (error) return { ok: false, error: "failed", message: "Could not update the import setting. Try again." };

  if (importing) {
    const { data: item } = await supabase.from("plaid_items").select("item_id").eq("id", row.plaid_item_id).maybeSingle();
    const sync = item ? await syncIfOwned(userId, item.item_id) : null;
    const warning = warningFor(sync, "Importing resumed.", "Importing resumed. The first sync didn't finish — it'll retry shortly.");
    if (warning) return { ok: true, warning };
  }
  return { ok: true };
}

/**
 * Clear an account's anomaly-review flag (`plaid_accounts.id`; design: 2026-09-12). An explicit, one-account-at-a-time
 * owner action, never automatic. It touches no transaction row; it only stops the warning.
 */
export async function clearAccountReviewFor(supabase: SupabaseClient, plaidAccountRowId: string): Promise<PlaidCommandResult> {
  const { data, error } = await supabase
    .from("plaid_accounts")
    .update({ needs_review: false, review_reason: null, review_flagged_at: null })
    .eq("id", plaidAccountRowId)
    .select("id");
  if (error) return lockedOr(supabase, { ok: false, error: "failed", message: "Could not update the review status. Try again." });
  if (!data?.length) return lockedOr(supabase, { ok: false, error: "not_found", message: "That account no longer exists." });
  return { ok: true };
}

/**
 * "Needs a category": set one imported bank transaction's category and mark it user-owned, so a re-sync never overwrites
 * it (design §18). Picking a standard category the user doesn't have adds it back (un-archive, or create). Then remember
 * the merchant → category rule and backfill this user's other still-blank rows from the same merchant: blanks only, never
 * a user-set category, a removed row or a transfer, and the backfilled rows stay `user_categorized = false` (auto, not
 * manual). Moved verbatim from the web action (2026-09-29, Stage 2B). RLS scopes every write to the caller.
 */
export async function categorizeBankTransactionFor(
  supabase: SupabaseClient,
  userId: string,
  input: { transactionId: string; categoryId?: string; standardCategoryName?: string },
): Promise<PlaidCommandResult> {
  const parsed = categorizeBankTxnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", message: "Pick a category and try again." };
  const { transactionId, standardCategoryName } = parsed.data;

  // Resolve the target category id. If the user picked a standard category they
  // don't currently have, add it back (un-archive, or create) — no setup screen.
  let categoryId = parsed.data.categoryId ?? "";
  if (!standardCategoryName) {
    // The picked category must be the caller's own (src/lib/ownership.ts): it is written to this row, to the merchant
    // rule and onto the merchant's other rows, and foreign keys would accept another user's category id.
    const owned = await referencesVisible(supabase, "categories", [categoryId]);
    if (!owned.ok) {
      return owned.error === "missing"
        ? { ok: false, error: "not_found", message: "That category no longer exists. Refresh and try again." }
        : { ok: false, error: "failed", message: "Could not save the category. Try again." };
    }
  }
  if (standardCategoryName) {
    const std = standardCategory(standardCategoryName);
    if (!std) return { ok: false, error: "invalid", message: "Unknown category." };
    const { data: existing } = await supabase
      .from("categories")
      .select("id, is_archived")
      .eq("name", std.name)
      .maybeSingle();
    if (existing) {
      categoryId = existing.id;
      if (existing.is_archived) {
        await supabase.from("categories").update({ is_archived: false }).eq("id", existing.id);
      }
    } else {
      const { data: created, error: createErr } = await supabase
        .from("categories")
        .insert({ user_id: userId, name: std.name, kind: std.kind, color: std.color })
        .select("id")
        .single();
      if (createErr || !created) {
        return lockedOr(supabase, { ok: false, error: "failed", message: "Could not add that category. Try again." });
      }
      categoryId = created.id;
    }
  }

  // Set the category and mark it user-owned so re-sync never overwrites it
  // (design §18). RLS scopes the update to the caller.
  const { data: updated, error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId, user_categorized: true })
    .eq("id", transactionId)
    .eq("source", "bank")
    .select("merchant_entity_id")
    .maybeSingle();
  if (error) return lockedOr(supabase, { ok: false, error: "failed", message: "Could not save the category. Try again." });
  if (!updated) {
    // Under the deletion lock the update matches nothing, which is not "the transaction is gone".
    return lockedOr(supabase, { ok: false, error: "not_found", message: "That transaction no longer exists. Refresh and try again." });
  }

  // Remember the merchant → category rule, and backfill this user's other
  // uncategorised transactions from the same merchant (design §18). Blanks only:
  // never touch a user-set category, a removed row, or a transfer; leave
  // `user_categorized = false` on the backfilled rows (auto, not manual).
  if (updated.merchant_entity_id) {
    await supabase.from("plaid_merchant_rules").upsert(
      { user_id: userId, merchant_entity_id: updated.merchant_entity_id, category_id: categoryId },
      { onConflict: "user_id,merchant_entity_id" },
    );
    await supabase
      .from("transactions")
      .update({ category_id: categoryId })
      .eq("source", "bank")
      .eq("merchant_entity_id", updated.merchant_entity_id)
      .is("category_id", null)
      .eq("user_categorized", false)
      .is("removed_at", null)
      .eq("is_transfer", false);
  }
  return { ok: true };
}

/**
 * "Re-scan": run the deterministic evidence chain over every still-uncategorised bank row of the verified user and fill
 * the ones it can now resolve. Idempotent; never touches user-set, removed or transfer rows. Owner-level (`db()`), so the
 * user id must be the verified one, never a request value.
 */
export async function rescanUncategorizedFor(userId: string): Promise<PlaidCommandResult> {
  const { updated } = await recategorizeUncategorizedBankTxns(db(), userId);
  return updated === 0 ? { ok: true, warning: "Nothing new to categorise." } : { ok: true };
}
