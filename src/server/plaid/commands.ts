import "server-only";
/**
 * Plaid commands for a signed-in user — the one implementation behind the web Server Actions (`./actions.ts`) and the
 * native `/api/mobile/plaid/*` routes. Every command takes the CALLER'S Supabase client (cookie or Bearer), so RLS
 * confirms ownership before the owner-level sync engine (`db()`, `syncRunner()`) ever sees an id. Commands never
 * redirect or revalidate: that is the adapter's business. Messages are the web's own wording, shared verbatim.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { readOwnOpenAccount } from "@/lib/accounts/selectable-accounts";
import { db } from "@/lib/db";
import { claimMissReason, findItemByPlaidItemId } from "@/lib/plaid/item-store";
import { NEW_ACCOUNTS_UNMAPPED } from "@/lib/plaid/sync-engine";
import { claimMissMessage, runClaimedSync } from "@/lib/plaid/sync-runner";
import type { AccountMapEntryInput } from "@/lib/validation/plaid";
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
  // The bank added accounts: the pass landed nothing and holds until the user maps them, which is a choice, not a failure.
  if (!out.result.ok && out.result.error === NEW_ACCOUNTS_UNMAPPED) {
    return { kind: "not_started", message: claimMissMessage({ kind: "unmapped" }) };
  }
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
  | { ok: false; error: "not_found" | "invalid" | "failed"; message: string };

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

  // An "existing" target must be the caller's own, open account: RLS on plaid_accounts checks only the link row's
  // user_id, not the account it points at. Checked for every entry before any write, so a bad entry saves nothing.
  for (const entry of entries) {
    if (entry.mode !== "existing") continue;
    const target = entry.existingAccountId ? await readOwnOpenAccount(supabase, entry.existingAccountId) : null;
    if (!target) return { ok: false, error: "invalid", message: "That account is no longer available. Refresh and choose again." };
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
      if (error || !created) return { ok: false, error: "failed", message: "Could not create the account. Try again." };
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
    if (linkErr) return { ok: false, error: "failed", message: "Could not save the account mapping. Try again." };
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
