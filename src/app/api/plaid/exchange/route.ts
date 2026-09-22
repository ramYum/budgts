/**
 * POST /api/plaid/exchange — trade a Link `public_token` for an access token,
 * store it encrypted, and record the Item + its accounts (for the mapping
 * step). The token never appears in the response. Design §9, §11.
 *
 * Body: `{ public_token: string, institution?: { institution_id?, name? } }`
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { plaidClient } from "@/lib/plaid/client";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { encryptToken } from "@/lib/plaid/crypto";
import { getRequestContext } from "@/lib/auth/request-context";
import { isAccountDeleting } from "@/lib/account/deletion-store";

const Body = z.object({
  public_token: z.string().min(1),
  institution: z
    .object({ institution_id: z.string().nullish(), name: z.string().nullish() })
    .nullish(),
});

export async function POST(request: Request) {
  const ctx = await getRequestContext(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user } = ctx;

  // Refuse BEFORE the token exchange: exchanging creates a live Item at Plaid, which a deleting account
  // (whose Items were already removed) would then never disconnect.
  if (await isAccountDeleting(user.id)) {
    return NextResponse.json({ error: "account_deletion_in_progress" }, { status: 409 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { public_token, institution } = parsed.data;

  const cfg = loadPlaidConfig();
  const client = plaidClient();

  let accessToken: string;
  let itemId: string;
  let accounts: Awaited<ReturnType<typeof client.accountsGet>>["data"]["accounts"];
  try {
    const ex = await client.itemPublicTokenExchange({ public_token });
    accessToken = ex.data.access_token;
    itemId = ex.data.item_id;
    accounts = (await client.accountsGet({ access_token: accessToken })).data.accounts;
  } catch (e) {
    console.error("[plaid] exchange", e);
    return NextResponse.json({ error: "could not connect the bank" }, { status: 502 });
  }

  const supabase = ctx.supabase;

  // Same-institution guard: steer to reconnect instead of a duplicate Item.
  if (institution?.institution_id) {
    const { data: existing } = await supabase
      .from("plaid_items")
      .select("id, item_id, status")
      .eq("institution_id", institution.institution_id)
      .neq("status", "revoked")
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "already-linked", itemId: existing.item_id, plaidItemId: existing.id },
        { status: 409 },
      );
    }
  }

  const access_token_enc = encryptToken(accessToken, cfg.tokenEncKey);
  const { data: item, error: itemErr } = await supabase
    .from("plaid_items")
    .insert({
      user_id: user.id,
      item_id: itemId,
      institution_id: institution?.institution_id ?? null,
      institution_name: institution?.name ?? null,
      access_token_enc,
      status: "active",
      needs_sync: true,
    })
    .select("id")
    .single();
  if (itemErr || !item) {
    console.error("[plaid] exchange: item insert", itemErr);
    // The account started deleting AFTER the check above (42501 = the deletion write guard refused the row).
    // The token is already exchanged, so the Item is live at Plaid: remove it now or nothing ever will.
    // Scoped to this one code on purpose — any other insert failure (a duplicate item_id, say) may belong to a
    // valid existing connection, which removing the Item would break.
    if (itemErr?.code === "42501") {
      await client.itemRemove({ access_token: accessToken }).catch((e) => {
        console.error("[plaid] exchange: could not remove the Item created during a deletion", e instanceof Error ? e.name : "error");
      });
      return NextResponse.json({ error: "account_deletion_in_progress" }, { status: 409 });
    }
    return NextResponse.json({ error: "could not save the connection" }, { status: 500 });
  }

  const accountRows = accounts.map((a) => ({
    user_id: user.id,
    plaid_item_id: item.id,
    plaid_account_id: a.account_id,
    account_id: null,
    link_state: "unmapped" as const,
    name: a.name ?? null,
    official_name: a.official_name ?? null,
    mask: a.mask ?? null,
    type: a.type ?? null,
    subtype: a.subtype ?? null,
    iso_currency_code: a.balances?.iso_currency_code ?? null,
    current_balance:
      a.balances?.current != null ? Math.round(a.balances.current * 100) : null,
    available_balance:
      a.balances?.available != null ? Math.round(a.balances.available * 100) : null,
    balance_as_of: new Date().toISOString(),
  }));
  const { error: acctErr } = await supabase.from("plaid_accounts").insert(accountRows);
  if (acctErr) {
    console.error("[plaid] exchange: accounts insert", acctErr);
    return NextResponse.json({ error: "could not save the accounts" }, { status: 500 });
  }

  return NextResponse.json({
    plaidItemId: item.id,
    accounts: accountRows.map((r) => ({
      plaidAccountId: r.plaid_account_id,
      name: r.name,
      officialName: r.official_name,
      mask: r.mask,
      type: r.type,
      subtype: r.subtype,
      currentBalance: r.current_balance,
      isoCurrencyCode: r.iso_currency_code,
    })),
  });
}
