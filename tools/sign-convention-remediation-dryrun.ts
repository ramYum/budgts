/**
 * READ-ONLY dry run for the one-time sign-convention historical remediation
 * (design: 2026-09-12 North Star §10, workflow 2 — "for accounts already
 * connected and already confirmed before this ships"). Never present in any
 * prior migration or script; run here for the first time, 2026-09-15.
 *
 * Uses the REAL production logic (detectSignConvention, resolveEventRole) —
 * no reimplementation, no drift risk. Selects only; writes nothing.
 *
 * Usage: npx tsx tools/sign-convention-remediation-dryrun.ts
 * (needs SUPABASE_SECRET_KEY in .env.local, and that .env.local must point at
 * the production Supabase project — the script refuses to run otherwise.)
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(__dirname, "..", ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { detectSignConvention, type SignEvidenceTxn } from "../src/lib/plaid/sign-convention";
import { resolveEventRole } from "../src/lib/plaid/event-role";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !url.includes("wsmhstqpvbbcqpqhiqyp")) throw new Error("expected the production Supabase project");
if (!secret) throw new Error("SUPABASE_SECRET_KEY missing");
const db = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

const mask = (e: string | null | undefined) => (e ? e.replace(/^(.{2}).*(@.*)$/, "$1***$2") : "?");
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Row = {
  id: string;
  status: "confirmed" | "pending_review";
  direction: "debit" | "credit";
  event_role: string | null;
  plaid_category_primary: string | null;
  plaid_category_detailed: string | null;
  is_transfer: boolean;
  occurred_at: string;
  amount: number;
  rawamt: number | null;
  duplicate_of_id: string | null;
  removed_at: string | null;
};

async function allRows(accountId: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("transactions")
      .select(
        "id,status,direction,event_role,plaid_category_primary,plaid_category_detailed,is_transfer,occurred_at,amount,rawamt:raw->amount,duplicate_of_id,removed_at",
      )
      .eq("plaid_account_id", accountId)
      .eq("source", "bank")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data as Row[]));
    if (data.length < 1000) return out;
  }
}

async function main() {
  const { data: items, error: itemsErr } = await db
    .from("plaid_items")
    .select("id,user_id,institution_name");
  if (itemsErr) throw itemsErr;
  const email: Record<string, string> = {};
  for (const u of new Set((items ?? []).map((i) => i.user_id))) {
    const { data } = await db.auth.admin.getUserById(u);
    email[u] = mask(data.user?.email);
  }

  const { data: pas, error: pasErr } = await db
    .from("plaid_accounts")
    .select("id,user_id,plaid_item_id,name,mask,sign_convention")
    .eq("sign_convention", "unknown"); // only accounts never resolved — the migration's whole scope
  if (pasErr) throw pasErr;

  console.log(`\n${pas!.length} Plaid accounts still at sign_convention=unknown\n`);

  for (const a of pas!) {
    const item = (items ?? []).find((i) => i.id === a.plaid_item_id);
    const rows = await allRows(a.id);
    const live = rows.filter((r) => !r.duplicate_of_id && !r.removed_at);
    if (live.length === 0) continue;

    const evidence: SignEvidenceTxn[] = live
      .map((r) => (typeof r.rawamt === "number" ? { rawAmount: r.rawamt, primary: r.plaid_category_primary } : null))
      .filter((e): e is SignEvidenceTxn => e !== null);
    const verdict = detectSignConvention(evidence);

    console.log(
      `\n=== ${email[a.user_id]} | ${item?.institution_name} | ${a.name}••${a.mask} (plaid_accounts.id ${a.id.slice(0, 8)}…) — ${live.length} live rows — verdict: ${verdict.toUpperCase()} ===`,
    );
    if (verdict === "unknown") {
      console.log("  Not enough/ambiguous evidence — left untouched, no change proposed.");
      continue;
    }
    if (verdict === "standard") {
      console.log("  Already correct as landed — plaid_accounts.sign_convention would be set to 'standard', no row changes.");
      continue;
    }

    // verdict === "inverted": every row's direction flips; event_role is
    // recomputed with the SAME logic finalizeSignConvention now uses.
    let directionChanges = 0;
    let roleChanges = 0;
    const monthly: Record<string, { beforeOut: number; beforeIn: number; afterOut: number; afterIn: number }> = {};
    const roleTransitions: Record<string, number> = {};

    for (const r of live) {
      const newDirection = r.direction === "debit" ? "credit" : "debit";
      if (newDirection !== r.direction) directionChanges++;

      const newRole = resolveEventRole({
        primary: r.plaid_category_primary,
        detailed: r.plaid_category_detailed,
        isTransfer: r.is_transfer,
        direction: newDirection,
      });
      if (newRole !== r.event_role) {
        roleChanges++;
        const k = `${r.event_role ?? "null"} -> ${newRole ?? "null"}`;
        roleTransitions[k] = (roleTransitions[k] ?? 0) + 1;
      }

      if (r.status === "confirmed") {
        const m = r.occurred_at.slice(0, 7);
        monthly[m] ??= { beforeOut: 0, beforeIn: 0, afterOut: 0, afterIn: 0 };
        if (r.direction === "debit") monthly[m].beforeOut += r.amount;
        else monthly[m].beforeIn += r.amount;
        if (newDirection === "debit") monthly[m].afterOut += r.amount;
        else monthly[m].afterIn += r.amount;
      }
    }

    console.log(`  direction flips: ${directionChanges} of ${live.length} rows`);
    console.log(`  event_role changes: ${roleChanges}`);
    for (const [k, n] of Object.entries(roleTransitions).sort((x, y) => y[1] - x[1])) console.log(`    ${k}: ${n}`);
    console.log("  month | spend (money out) before -> after | income (money in) before -> after");
    for (const [m, t] of Object.entries(monthly).sort()) {
      console.log(`    ${m} | ${usd(t.beforeOut)} -> ${usd(t.afterOut)} | ${usd(t.beforeIn)} -> ${usd(t.afterIn)}`);
    }
  }

  // SEPARATE, broader sweep: any CONFIRMED bank row anywhere whose event_role
  // doesn't match what resolveEventRole computes from its OWN current stored
  // direction. This catches the exact defect finalizeSignConvention used to
  // leave behind on any account that had ALREADY been resolved (direction
  // corrected) before the fix — including accounts whose sign_convention is
  // no longer 'unknown', so the scope-by-unknown loop above never sees them.
  console.log("\n=== broader sweep: event_role consistency on ALL confirmed bank rows (any account) ===");
  const inconsistentByAccount: Record<string, { count: number; transitions: Record<string, number> }> = {};
  let scanned = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("transactions")
      .select("id,plaid_account_id,direction,event_role,plaid_category_primary,plaid_category_detailed,is_transfer")
      .eq("source", "bank")
      .eq("status", "confirmed")
      .is("duplicate_of_id", null)
      .is("removed_at", null)
      .not("plaid_account_id", "is", null)
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    scanned += data.length;
    for (const r of data) {
      const expected = resolveEventRole({
        primary: r.plaid_category_primary,
        detailed: r.plaid_category_detailed,
        isTransfer: r.is_transfer,
        direction: r.direction as "debit" | "credit",
      });
      if (expected !== r.event_role) {
        const key = r.plaid_account_id as string;
        inconsistentByAccount[key] ??= { count: 0, transitions: {} };
        inconsistentByAccount[key].count++;
        const t = `${r.event_role ?? "null"} -> ${expected ?? "null"}`;
        inconsistentByAccount[key].transitions[t] = (inconsistentByAccount[key].transitions[t] ?? 0) + 1;
      }
    }
    if (data.length < 1000) break;
  }
  console.log(`  scanned ${scanned} confirmed bank rows total`);
  if (Object.keys(inconsistentByAccount).length === 0) {
    console.log("  none found — no residual mismatches anywhere.");
  }
  for (const [acctId, v] of Object.entries(inconsistentByAccount)) {
    const { data: pa } = await db.from("plaid_accounts").select("user_id,name,mask").eq("id", acctId).maybeSingle();
    const owner = pa ? mask((await db.auth.admin.getUserById(pa.user_id)).data.user?.email) : "?";
    console.log(`  ${owner} | ${pa?.name}••${pa?.mask} (${acctId.slice(0, 8)}…): ${v.count} rows`);
    for (const [k, n] of Object.entries(v.transitions).sort((x, y) => y[1] - x[1])) console.log(`    ${k}: ${n}`);
  }

  console.log("\nNo data was changed. This is a dry run only.");
}

main().catch((e) => {
  console.error("FAILED:", e.message ?? e);
  process.exit(1);
});
