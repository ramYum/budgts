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
import { describePlaidError } from "@/lib/plaid/error-policy";
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

type LinkRow = { account_id: string | null; link_state: "mapped" | "ignored" | "unmapped" };

/** Does this link already reflect the entry? "new": any open account; "existing": that account; "ignore": ignored. */
async function linkMatches(supabase: SupabaseClient, entry: AccountMapEntryInput, link: LinkRow): Promise<boolean> {
  if (entry.mode === "ignore") return link.link_state === "ignored";
  if (link.link_state !== "mapped" || !link.account_id) return false;
  if (entry.mode === "existing") return link.account_id === entry.existingAccountId;
  return (await readOwnOpenAccount(supabase, link.account_id)) !== null;
}

/** The refusal for a mapping the link's current state rules out, worded by that state. */
function refusalFor(link: LinkRow | null): PlaidCommandResult {
  if (!link) return { ok: false, error: "not_found", message: "That bank account no longer exists. Try connecting again." };
  if (link.link_state === "ignored") {
    return link.account_id
      ? { ok: false, error: "invalid", message: "That account is paused. Turn it back on from Connected banks." }
      : { ok: false, error: "invalid", message: "You chose not to import that account. Refresh and choose again." };
  }
  return { ok: false, error: "invalid", message: "That account is already imported. Refresh to see where it goes." };
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

  // Each Plaid account's current link, read before any write. An account that already imports into an open Budgts
  // account is never re-created or repointed: a repeated request (a double tap, a retry after a lost reply) is a no-op,
  // and anything else is refused. Only a link with no account, or one whose account is gone or archived (a paused
  // account the connect switch offers again), is mapped here.
  // A request the link already reflects (`linkMatches`) is a no-op, and still runs the sync below like a first mapping.
  const ids = [...new Set(entries.map((e) => e.plaidAccountId))];
  const { data: linkRows, error: readErr } = await supabase
    .from("plaid_accounts")
    .select("plaid_account_id, account_id, link_state")
    .eq("plaid_item_id", plaidItemId)
    .in("plaid_account_id", ids);
  if (readErr) return { ok: false, error: "failed", message: "Could not save the account mapping. Try again." };
  const current = new Map(((linkRows ?? []) as ({ plaid_account_id: string } & LinkRow)[]).map((l) => [l.plaid_account_id, l]));

  const plan: { entry: AccountMapEntryInput; was: string | null }[] = [];
  for (const entry of entries) {
    const link = current.get(entry.plaidAccountId) ?? null;
    if (!link) return refusalFor(null);
    if (await linkMatches(supabase, entry, link)) continue;
    if (link.account_id && (await readOwnOpenAccount(supabase, link.account_id))) return refusalFor(link);
    plan.push({ entry, was: link.account_id });
  }

  for (const { entry, was } of plan) {
    let accountId: string | null = null;
    let linkState: "mapped" | "ignored" = "ignored";
    let created: string | null = null;

    if (entry.mode === "new") {
      const { data, error } = await supabase
        .from("accounts")
        .insert({ user_id: userId, name: entry.name, type: entry.type ?? "checking", source: "plaid" })
        .select("id")
        .single();
      if (error || !data) return { ok: false, error: "failed", message: "Could not create the account. Try again." };
      accountId = created = data.id as string;
      linkState = "mapped";
    } else if (entry.mode === "existing") {
      accountId = entry.existingAccountId ?? null;
      linkState = "mapped";
    }

    // Guarded on the link still being what was read: a concurrent duplicate that got there first wins.
    const update = supabase
      .from("plaid_accounts")
      .update({ account_id: accountId, link_state: linkState })
      .eq("plaid_item_id", plaidItemId)
      .eq("plaid_account_id", entry.plaidAccountId);
    const { data: linked, error: linkErr } = await (was === null ? update.is("account_id", null) : update.eq("account_id", was)).select("id");
    if (linkErr) return { ok: false, error: "failed", message: "Could not save the account mapping. Try again." };
    if ((linked ?? []).length > 0) continue;

    // Lost the race. The account this request created was never linked and holds nothing, so it goes either way.
    if (created) {
      const { error: delErr } = await supabase.from("accounts").delete().eq("id", created).eq("user_id", userId);
      if (delErr) {
        // Ids only (describePlaidError keeps database text out): an empty account is left behind, which the user can archive.
        console.error("mapAccountsFor: could not remove the unlinked account after losing a mapping race", {
          accountId: created,
          plaidItemRowId: plaidItemId,
          ...describePlaidError(delErr),
        });
      }
    }
    // Ok only when the winner's link is what this request asked for; otherwise the caller's choice was not applied.
    const { data: now, error: rereadErr } = await supabase
      .from("plaid_accounts")
      .select("account_id, link_state")
      .eq("plaid_item_id", plaidItemId)
      .eq("plaid_account_id", entry.plaidAccountId)
      .maybeSingle();
    if (rereadErr) return { ok: false, error: "failed", message: "Could not save the account mapping. Try again." };
    if (!now || !(await linkMatches(supabase, entry, now as LinkRow))) return refusalFor((now as LinkRow | null) ?? null);
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
