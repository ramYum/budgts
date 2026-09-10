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
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findItemByPlaidItemId } from "@/lib/plaid/item-store";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import {
  categorizeBankTxnSchema,
  disconnectBankSchema,
  mapAccountsSchema,
} from "@/lib/validation/plaid";
import { disconnectPlaidItem } from "./disconnect";
import { plaidDb, syncItem } from "./service";

export type PlaidActionState = {
  error?: string;
  fieldError?: string;
  warning?: string;
  ok?: boolean;
};

function revalidateSynced() {
  for (const p of ["/", "/transactions", "/settings", "/budgets"]) revalidatePath(p);
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

  const result = await syncItem(record);
  revalidateSynced();
  if (!result.ok) {
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
        .insert({ user_id: user.id, name: entry.name, type: entry.type ?? "checking" })
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
    const result = await syncItem(record);
    revalidateSynced();
    if (!result.ok) {
      return { ok: true, warning: "Accounts saved. The first sync didn't finish — it'll retry shortly." };
    }
    return { ok: true };
  }

  revalidateSynced();
  return { ok: true };
}

export async function categorizeBankTransaction(
  _prev: PlaidActionState,
  formData: FormData,
): Promise<PlaidActionState> {
  const parsed = categorizeBankTxnSchema.safeParse({
    transactionId: String(formData.get("transactionId") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
  });
  if (!parsed.success) return { error: "Pick a category and try again." };
  const { transactionId, categoryId } = parsed.data;

  const { user, supabase } = await withUser();

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

  // Remember the merchant → category rule so the next transaction from this
  // merchant is auto-categorised.
  if (updated.merchant_entity_id) {
    await supabase.from("plaid_merchant_rules").upsert(
      { user_id: user.id, merchant_entity_id: updated.merchant_entity_id, category_id: categoryId },
      { onConflict: "user_id,merchant_entity_id" },
    );
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  return { ok: true };
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

  revalidateSynced();
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
