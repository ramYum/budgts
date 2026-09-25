"use server";

/**
 * Server actions for the Plaid UI (design §11, §18, §24). Every action:
 *  - authenticates with the session (`getSessionUser`);
 *  - takes only an id + the user's choice, and re-reads the rest through the
 *    user's RLS-scoped Supabase client;
 *  - revalidates the pages that show synced data.
 *
 * The service-role sync engine is reached only after an ownership check, and
 * only with an `item_id` that RLS confirmed belongs to the caller.
 */
import { revalidateUserData } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { standardCategory } from "@/lib/categories/standard";
import { after } from "next/server";
import { claimMissReason, findItemByPlaidItemId } from "@/lib/plaid/item-store";
import { runClaimedSync } from "@/lib/plaid/sync-runner";
import { recategorizeUncategorizedBankTxns } from "@/lib/plaid/recategorize";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import {
  categorizeBankTxnSchema,
  clearAccountReviewSchema,
  disconnectBankSchema,
  mapAccountsSchema,
  setAccountCalculationExclusionSchema,
  setAccountImportingSchema,
} from "@/lib/validation/plaid";
import { setAccountCalculationExclusion } from "./account-exclusion";
import { disconnectPlaidItem } from "./disconnect";
import { drainItemInBackground, plaidDb, syncRunner } from "./service";

export type PlaidActionState = {
  error?: string;
  fieldError?: string;
  warning?: string;
  ok?: boolean;
};


/**
 * A user-requested sync of an Item the caller was already confirmed to own,
 * through the same per-Item lease as the webhook and the sweep. Any pages
 * left over (page cap) keep draining after the response.
 */
async function syncOwnedItem(
  itemId: string,
): Promise<{ kind: "synced" } | { kind: "failed" } | { kind: "not_started"; message: string }> {
  const out = await runClaimedSync(syncRunner(), itemId, { kind: "requested" });
  if (!out.claimed) {
    const reason = await claimMissReason(plaidDb, itemId);
    return {
      kind: "not_started",
      message:
        reason === "unmapped"
          ? "Choose where this bank's new accounts go first — then it will sync."
          : reason === "gone"
            ? "That bank connection no longer exists."
            : "A sync for this bank is already running — new transactions will appear in a moment.",
    };
  }
  if (out.result.ok && out.morePending) after(() => drainItemInBackground(itemId));
  return out.result.ok ? { kind: "synced" } : { kind: "failed" };
}

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

  // Ownership gate: RLS confirms this Item is the caller's before the
  // service-role engine ever sees the id.
  const { data: owned } = await supabase
    .from("plaid_items")
    .select("item_id")
    .eq("item_id", itemId)
    .maybeSingle();
  if (!owned) return { error: "That bank connection no longer exists." };

  const record = await findItemByPlaidItemId(plaidDb, itemId);
  if (!record || record.userId !== user.id) {
    return { error: "That bank connection no longer exists." };
  }

  const sync = await syncOwnedItem(record.itemId);
  revalidateUserData();
  if (sync.kind === "not_started") return { ok: true, warning: sync.message };
  if (sync.kind === "failed") {
    return { ok: true, warning: "Connected, but the first sync didn't finish. It'll retry shortly." };
  }
  return { ok: true };
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

  // Confirm the Item is the caller's and grab its Plaid `item_id` for the sync.
  const { data: item } = await supabase
    .from("plaid_items")
    .select("item_id")
    .eq("id", plaidItemId)
    .maybeSingle();
  if (!item) return { error: "That bank connection no longer exists. Try connecting again." };

  for (const entry of entries) {
    let accountId: string | null = null;
    let linkState: "mapped" | "ignored" = "ignored";

    if (entry.mode === "new") {
      const { data: created, error } = await supabase
        .from("accounts")
        .insert({ user_id: user.id, name: entry.name, type: entry.type ?? "checking", source: "plaid" })
        .select("id")
        .single();
      if (error || !created) return { error: "Could not create the account. Try again." };
      accountId = created.id;
      linkState = "mapped";
    } else if (entry.mode === "existing") {
      accountId = entry.existingAccountId ?? null;
      linkState = "mapped";
    }

    const { error: linkErr } = await supabase
      .from("plaid_accounts")
      .update({ account_id: accountId, link_state: linkState })
      .eq("plaid_item_id", plaidItemId)
      .eq("plaid_account_id", entry.plaidAccountId);
    if (linkErr) return { error: "Could not save the account mapping. Try again." };
  }

  // First sync — so transactions are on screen when the user lands back.
  const record = await findItemByPlaidItemId(plaidDb, item.item_id);
  if (record && record.userId === user.id) {
    const sync = await syncOwnedItem(record.itemId);
    revalidateUserData();
    if (sync.kind === "not_started") return { ok: true, warning: `Accounts saved. ${sync.message}` };
    if (sync.kind === "failed") {
      return { ok: true, warning: "Accounts saved. The first sync didn't finish — it'll retry shortly." };
    }
    return { ok: true };
  }

  revalidateUserData();
  return { ok: true };
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
  const { error } = await supabase
    .from("plaid_accounts")
    .update({ needs_review: false, review_reason: null, review_flagged_at: null })
    .eq("id", parsed.data.plaidAccountRowId);
  if (error) return { error: "Could not update the review status. Try again." };

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

  // RLS scopes this to the caller.
  const { data: row } = await supabase
    .from("plaid_accounts")
    .select("account_id, plaid_item_id")
    .eq("id", parsed.data.plaidAccountRowId)
    .maybeSingle();
  if (!row) return { error: "That account no longer exists." };
  if (parsed.data.importing && !row.account_id) {
    return { error: "Choose which Budgts account to import into first." };
  }

  const { error } = await supabase
    .from("plaid_accounts")
    .update({ link_state: parsed.data.importing ? "mapped" : "ignored" })
    .eq("id", parsed.data.plaidAccountRowId);
  if (error) return { error: "Could not update the import setting. Try again." };

  if (parsed.data.importing) {
    // Picks up new activity from now on — NOT a replay of what happened
    // while paused (see the doc comment above; Plaid's cursor already moved
    // past it if any sync ran meanwhile). Same first-sync-on-save pattern as
    // account mapping (design §11).
    const { data: item } = await supabase
      .from("plaid_items")
      .select("item_id")
      .eq("id", row.plaid_item_id)
      .maybeSingle();
    const record = item ? await findItemByPlaidItemId(plaidDb, item.item_id) : null;
    if (record && record.userId === user.id) {
      const sync = await syncOwnedItem(record.itemId);
      revalidateUserData();
      if (sync.kind === "not_started") return { ok: true, warning: `Importing resumed. ${sync.message}` };
      if (sync.kind === "failed") {
        return { ok: true, warning: "Importing resumed. The first sync didn't finish — it'll retry shortly." };
      }
    }
  }

  revalidateUserData();
  return { ok: true };
}

export async function categorizeBankTransaction(
  _prev: PlaidActionState,
  formData: FormData,
): Promise<PlaidActionState> {
  const rawCategoryId = String(formData.get("categoryId") ?? "");
  const rawStandard = String(formData.get("standardCategoryName") ?? "");
  const parsed = categorizeBankTxnSchema.safeParse({
    transactionId: String(formData.get("transactionId") ?? ""),
    categoryId: rawCategoryId || undefined,
    standardCategoryName: rawStandard || undefined,
  });
  if (!parsed.success) return { error: "Pick a category and try again." };
  const { transactionId, standardCategoryName } = parsed.data;

  const { user, supabase } = await withUser();

  // Resolve the target category id. If the user picked a standard category they
  // don't currently have, add it back (un-archive, or create) — no setup screen.
  let categoryId = parsed.data.categoryId ?? "";
  if (standardCategoryName) {
    const std = standardCategory(standardCategoryName);
    if (!std) return { error: "Unknown category." };
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
        .insert({ user_id: user.id, name: std.name, kind: std.kind, color: std.color })
        .select("id")
        .single();
      if (createErr || !created) return { error: "Could not add that category. Try again." };
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
  if (error) return { error: "Could not save the category. Try again." };
  if (!updated) return { error: "That transaction no longer exists. Refresh and try again." };

  // Remember the merchant → category rule, and backfill this user's other
  // uncategorised transactions from the same merchant (design §18). Blanks only:
  // never touch a user-set category, a removed row, or a transfer; leave
  // `user_categorized = false` on the backfilled rows (auto, not manual).
  if (updated.merchant_entity_id) {
    await supabase.from("plaid_merchant_rules").upsert(
      { user_id: user.id, merchant_entity_id: updated.merchant_entity_id, category_id: categoryId },
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
  const { updated } = await recategorizeUncategorizedBankTxns(plaidDb, user.id);
  revalidateUserData();
  return { ok: true, warning: updated === 0 ? "Nothing new to categorise." : undefined };
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
