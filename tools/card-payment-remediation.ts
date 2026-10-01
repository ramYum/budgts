/**
 * Card-payment remediation (design: docs/specs/2026-10-01-card-payments-design.md §8). DRY RUN BY DEFAULT.
 *
 *   npx tsx tools/card-payment-remediation.ts --env staging                       # read-only report
 *   npx tsx tools/card-payment-remediation.ts --env staging --apply --confirm-ref uvowywszaiojboaxdmoz
 *   npx tsx tools/card-payment-remediation.ts --env staging --revert <audit.json> --confirm-ref uvowywszaiojboaxdmoz
 *   options: --user <uuid> (one user only), --env-file <path> (default .env.staging / .env.local in the cwd)
 *
 * What it plans, using the app's own logic (no reimplementation):
 *  A. Event-role backfill: confirmed bank rows with no role whose resolver result is now CARD_PAYMENT
 *     (`resolveEventRole` with the account's Plaid type): rows labelled LOAN_PAYMENTS_CREDIT_CARD_PAYMENT that landed
 *     before Event Role existed, and a card's incoming LOAN_PAYMENTS rows. Rows the user categorized themselves are
 *     listed, never changed (their choice outranks a backfill; owner decides).
 *  B. Held rows (`pending_review` / `sign_convention_unknown`), in two parts:
 *     - AUTOMATIC AT DEPLOY (preview only): every account still `unknown` is re-judged by the deployed sync, the next
 *       time it brings that account new rows, with the credit-aware detector (`detectSignConvention`) and the
 *       auto-resolve gate (`autoResolveBlock`). This simulates exactly that, account by account: verdict, gate result,
 *       rows released. Advancial accounts are listed explicitly.
 *     - Stragglers: held rows on an account that already has a convention. The sync never releases these; --apply
 *       does, with `planHeldRowRelease`, the function `finalizeSignConvention` uses.
 *  C. Pairing (AUTOMATIC AT DEPLOY, preview only): the deployed sync pairs with a 3-day Tier B window (was 1). This
 *     runs the real candidate read (`findTransferPairingCandidates`) and matcher (`findTransferPairs`) read-only, and
 *     lists every pair the wider window adds, with the rows Tier B would classify as transfers.
 *
 * For every affected user and month it prints spend / income / Money Left now, at deploy (B-automatic + C), and
 * with A and the stragglers applied too, computed with the app's `rollup`. With `--diagnose` it also prints per-account facts the owner needs to judge the rest (duplicate clusters,
 * rows whose stored direction contradicts the account's convention).
 *
 * Safety:
 *  - The env file's DIRECT_URL must point at the expected project (staging uvowywszaiojboaxdmoz, production
 *    wsmhstqpvbbcqpqhiqyp); the URL is never printed.
 *  - The dry run reads inside a READ ONLY transaction that is rolled back.
 *  - --apply needs --confirm-ref equal to that ref, writes in one transaction, and first saves an audit file with
 *    every old value (.tmp/remediation/card-payments-<ref>-<time>.json). --revert restores those values, only on rows
 *    still holding exactly what the apply wrote (a row the user or a sync changed since is reported, not clobbered).
 *  - Production --apply is for after the owner approves the exact rows and before/after totals (CLAUDE.md).
 */
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { rollup } from "@/lib/budget/rollup";
import type { BudgetCategory, BudgetTxn } from "@/lib/budget/types";
import { isEventRole, resolveEventRole } from "@/lib/plaid/event-role";
import { planHeldRowRelease } from "@/lib/plaid/held-rows";
import { ADVANCIAL_INSTITUTION_ID } from "@/lib/plaid/replay-containment";
import { detectSignConvention } from "@/lib/plaid/sign-convention";
import { autoResolveBlock } from "@/lib/plaid/sync-engine";
import { createPlaidSyncStore, readAutoResolveFacts, type PlaidDb } from "@/lib/plaid/sync-store";
import { findTransferPairs, type AcceptedPair } from "@/lib/plaid/transfer-pairing";

const REFS = { staging: "uvowywszaiojboaxdmoz", production: "wsmhstqpvbbcqpqhiqyp" } as const;
type EnvName = keyof typeof REFS;

// A read-only build (the bundle handed over for production) has this defined true; --apply/--revert then refuse.
declare const __READ_ONLY_BUILD__: boolean | undefined;
const READ_ONLY_BUILD = typeof __READ_ONLY_BUILD__ !== "undefined" && __READ_ONLY_BUILD__ === true;
declare const __DEFAULT_ENV_DIR__: string | undefined;
const DEFAULT_ENV_DIR = typeof __DEFAULT_ENV_DIR__ !== "undefined" ? __DEFAULT_ENV_DIR__ : process.cwd();

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const envName = arg("--env") as EnvName | null;
if (!envName || !(envName in REFS)) {
  console.error("usage: --env staging|production [--user <uuid>] [--diagnose] [--apply|--revert <file>] [--confirm-ref <ref>]");
  process.exit(2);
}
// A build pinned to one environment (the production read-only bundle) refuses every other.
declare const __ONLY_ENV__: string | undefined;
if (typeof __ONLY_ENV__ !== "undefined" && envName !== __ONLY_ENV__) throw new Error(`this build only runs against ${__ONLY_ENV__}`);
const ref = REFS[envName];
const onlyUser = arg("--user");
const apply = args.includes("--apply");
const revertFile = arg("--revert");
const diagnose = args.includes("--diagnose");
if ((apply || revertFile) && READ_ONLY_BUILD) throw new Error("this is a read-only build: --apply/--revert are disabled");
if ((apply || revertFile) && arg("--confirm-ref") !== ref) throw new Error(`--apply/--revert need --confirm-ref ${ref}`);
if (apply && revertFile) throw new Error("choose --apply or --revert, not both");

function readDirectUrl(): string {
  const file = arg("--env-file") ?? path.join(DEFAULT_ENV_DIR, envName === "staging" ? ".env.staging" : ".env.local");
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DIRECT_URL="));
  const url = line?.slice("DIRECT_URL=".length).trim().replace(/^["']|["']$/g, "");
  if (!url) throw new Error(`DIRECT_URL missing in ${file}`);
  if (!url.includes(ref)) throw new Error(`DIRECT_URL in ${file} does not point at ${envName} (${ref}); refusing`);
  return url;
}

const sql = postgres(readDirectUrl(), { prepare: false, max: 1 });
type Tx = postgres.TransactionSql;

const usd = (minor: number) => `${minor < 0 ? "-" : ""}$${(Math.abs(minor) / 100).toFixed(2)}`;
const short = (id: string) => id.slice(0, 8);

type TxnRow = {
  id: string;
  user_id: string;
  account_id: string;
  plaid_account_id: string | null;
  amount: string;
  direction: "debit" | "credit";
  occurred_at: Date;
  category_id: string | null;
  is_transfer: boolean;
  event_role: string | null;
  status: "confirmed" | "pending_review";
  pending_reason: string | null;
  duplicate_of_id: string | null;
  transfer_user_set: boolean;
  user_categorized: boolean;
  plaid_category_primary: string | null;
  plaid_category_detailed: string | null;
  raw_amount: number | null;
  content_fingerprint: string | null;
  removed_at: Date | null;
};

type PlaidAccount = {
  id: string;
  user_id: string;
  type: string | null;
  subtype: string | null;
  sign_convention: "unknown" | "standard" | "inverted";
  excluded_from_calculations: boolean;
  link_state: string;
  institution_name: string | null;
  institution_id: string | null;
  item_status: string;
};

/** One planned row change; `before` is what the row holds now, `after` what it becomes. `role_backfill` and
 * `held_release` (stragglers) are what --apply writes; `held_release_auto` and `pairing_auto` are what the deployed
 * sync will do by itself, previewed only. */
type RowState = { event_role: string | null; direction: string; status: string; pending_reason: string | null; is_transfer?: boolean };
type RowChange = {
  id: string;
  userId: string;
  kind: "role_backfill" | "held_release" | "held_release_auto" | "pairing_auto";
  before: RowState;
  after: RowState;
};
const APPLIED_KINDS = new Set<RowChange["kind"]>(["role_backfill", "held_release"]);
type ConventionChange = { plaidAccountId: string; before: "unknown"; after: "standard" | "inverted" };

async function loadPlaidAccounts(tx: Tx): Promise<PlaidAccount[]> {
  return tx<PlaidAccount[]>`
    select pa.id, pa.user_id, pa.type, pa.subtype, pa.sign_convention, pa.excluded_from_calculations, pa.link_state,
           pi.institution_name, pi.institution_id, pi.status as item_status
    from public.plaid_accounts pa join public.plaid_items pi on pi.id = pa.plaid_item_id
    ${onlyUser ? tx`where pa.user_id = ${onlyUser}` : tx``}`;
}

const TXN_COLUMNS = (tx: Tx) => tx`
  t.id, t.user_id, t.account_id, t.plaid_account_id, t.amount, t.direction, t.occurred_at, t.category_id, t.is_transfer,
  t.event_role, t.status, t.pending_reason, t.duplicate_of_id, t.transfer_user_set, t.user_categorized,
  t.plaid_category_primary, t.plaid_category_detailed,
  case when jsonb_typeof(t.raw->'amount') = 'number' then (t.raw->>'amount')::float8 end as raw_amount,
  t.content_fingerprint, t.removed_at`;

async function plan(tx: Tx) {
  // The app's own Drizzle reads (pairing candidates, the auto-resolve facts) inside this same transaction.
  // A transaction handle lacks the client's `options`, which the driver configures; lend it the client's.
  const drz = drizzle(Object.assign(tx, { options: sql.options }) as unknown as postgres.Sql, { schema }) as unknown as PlaidDb;
  const accounts = await loadPlaidAccounts(tx);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const changes: RowChange[] = [];
  const conventionChanges: ConventionChange[] = [];
  const skippedUserCategorized: TxnRow[] = [];
  const autoAccounts: { account: PlaidAccount; held: number; verdict: string; block: string | null }[] = [];

  // A. role backfill candidates: only LOAN_PAYMENTS rows can resolve to CARD_PAYMENT.
  const roleless = await tx<TxnRow[]>`
    select ${TXN_COLUMNS(tx)} from public.transactions t
    where t.source = 'bank' and t.removed_at is null and t.status = 'confirmed' and t.event_role is null
      and t.transfer_user_set = false and t.plaid_category_primary = 'LOAN_PAYMENTS' and t.plaid_account_id is not null
      ${onlyUser ? tx`and t.user_id = ${onlyUser}` : tx``}`;
  for (const t of roleless) {
    const acct = accountById.get(t.plaid_account_id!);
    const role = resolveEventRole({
      primary: t.plaid_category_primary,
      detailed: t.plaid_category_detailed,
      isTransfer: t.is_transfer,
      direction: t.direction,
      accountType: acct?.type ?? null,
    });
    if (role !== "CARD_PAYMENT") continue;
    if (t.user_categorized) {
      skippedUserCategorized.push(t);
      continue;
    }
    const before = { event_role: t.event_role, direction: t.direction, status: t.status, pending_reason: t.pending_reason };
    changes.push({ id: t.id, userId: t.user_id, kind: "role_backfill", before, after: { ...before, event_role: role } });
  }

  // B. held rows.
  const held = await tx<TxnRow[]>`
    select ${TXN_COLUMNS(tx)} from public.transactions t
    where t.source = 'bank' and t.status = 'pending_review' and t.pending_reason = 'sign_convention_unknown'
      and t.plaid_account_id is not null ${onlyUser ? tx`and t.user_id = ${onlyUser}` : tx``}`;
  const heldByAccount = new Map<string, TxnRow[]>();
  for (const t of held) heldByAccount.set(t.plaid_account_id!, [...(heldByAccount.get(t.plaid_account_id!) ?? []), t]);
  for (const [plaidAccountId, rows] of heldByAccount) {
    const acct = accountById.get(plaidAccountId);
    if (!acct) continue;
    let convention: "standard" | "inverted" | "unknown" = acct.sign_convention;
    let kind: RowChange["kind"] = "held_release";
    if (convention === "unknown") {
      // Exactly what the deployed sync does (sync-engine.ts): the same evidence, detector and gate.
      const evidence = rows
        .filter((r) => typeof r.raw_amount === "number")
        .map((r) => ({ rawAmount: r.raw_amount as number, primary: r.plaid_category_primary }));
      convention = detectSignConvention(evidence, acct.type);
      const block = convention === "unknown" ? null : autoResolveBlock(await readAutoResolveFacts(drz, plaidAccountId, convention));
      autoAccounts.push({ account: acct, held: rows.length, verdict: convention, block });
      if (convention === "unknown" || block) continue; // stays held for the user's answer (Connected banks)
      conventionChanges.push({ plaidAccountId, before: "unknown", after: convention });
      kind = "held_release_auto";
    }
    const releases = planHeldRowRelease(
      rows.map((r) => ({
        id: r.id,
        direction: r.direction,
        primary: r.plaid_category_primary,
        detailed: r.plaid_category_detailed,
        isTransfer: r.is_transfer,
      })),
      convention,
      acct.type,
    );
    const rowById = new Map(rows.map((r) => [r.id, r]));
    for (const rel of releases) {
      const r = rowById.get(rel.id)!;
      changes.push({
        id: r.id,
        userId: r.user_id,
        kind,
        before: { event_role: r.event_role, direction: r.direction, status: r.status, pending_reason: r.pending_reason },
        after: { event_role: rel.eventRole, direction: rel.direction, status: "confirmed", pending_reason: null },
      });
    }
  }
  // C. pairing at deploy: the real candidate read and matcher, with the new window and the old one.
  const pairs: { userId: string; pair: AcceptedPair; added: boolean }[] = [];
  const store = createPlaidSyncStore(drz);
  for (const userId of new Set(accounts.map((a) => a.user_id))) {
    const rows = await store.findTransferPairingCandidates(userId);
    const candidates = rows.map((c) => ({ ...c, eventRole: c.eventRole != null && isEventRole(c.eventRole) ? c.eventRole : null }));
    const key = (x: AcceptedPair) => [x.tier, [x.legA, x.legB].sort().join("|")].join(":");
    const before = new Set(findTransferPairs(candidates, { tierBWindowDays: 1 }).accepted.map(key));
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const pair of findTransferPairs(candidates).accepted) {
      const added = !before.has(key(pair));
      pairs.push({ userId, pair, added });
      if (!added || !pair.classifyLegId) continue;
      const leg = byId.get(pair.classifyLegId)!;
      const st = { event_role: leg.eventRole, direction: leg.direction, status: "confirmed", pending_reason: null };
      changes.push({
        id: leg.id,
        userId,
        kind: "pairing_auto",
        before: { ...st, is_transfer: leg.isTransfer },
        after: { ...st, event_role: "TRANSFER", is_transfer: true },
      });
    }
  }
  return { accounts, changes, conventionChanges, skippedUserCategorized, autoAccounts, pairs };
}

async function loadUserTxns(tx: Tx, userId: string): Promise<TxnRow[]> {
  return tx<TxnRow[]>`
    select ${TXN_COLUMNS(tx)} from public.transactions t
    where t.user_id = ${userId} and t.removed_at is null`;
}

function toBudgetTxn(t: TxnRow, excluded: Set<string>): BudgetTxn {
  return {
    categoryId: t.category_id,
    amount: Number(t.amount),
    direction: t.direction,
    occurredAt: new Date(t.occurred_at),
    status: t.status,
    isTransfer: t.is_transfer,
    duplicateOfId: t.duplicate_of_id,
    eventRole: t.event_role != null && isEventRole(t.event_role) ? t.event_role : null,
    transferUserSet: t.transfer_user_set,
    accountExcluded: t.plaid_account_id != null && excluded.has(t.plaid_account_id),
  };
}

const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

function withState(t: TxnRow, c: RowChange | undefined): TxnRow {
  if (!c) return t;
  return {
    ...t,
    event_role: c.after.event_role,
    direction: c.after.direction as TxnRow["direction"],
    status: c.after.status as TxnRow["status"],
    pending_reason: c.after.pending_reason,
    is_transfer: c.after.is_transfer ?? t.is_transfer,
  };
}

async function report(tx: Tx, p: Awaited<ReturnType<typeof plan>>) {
  const users = new Set([...p.changes.map((c) => c.userId), ...p.skippedUserCategorized.map((t) => t.user_id)]);
  if (diagnose) for (const a of p.accounts) users.add(a.user_id);
  const excluded = new Set(p.accounts.filter((a) => a.excluded_from_calculations).map((a) => a.id));
  console.log(`\n=== card-payment remediation, ${envName} (${ref}), ${apply ? "APPLY" : "dry run"} ===`);
  const n = (k: RowChange["kind"]) => p.changes.filter((c) => c.kind === k).length;
  console.log(
    `--apply would write: ${n("role_backfill")} role backfills, ${n("held_release")} held-row releases; ` +
      `${p.skippedUserCategorized.length} user-categorized card payments left alone`,
  );
  console.log(
    `automatic at deploy: ${n("held_release_auto")} held rows released on ${p.conventionChanges.length} accounts (B), ` +
      `${p.pairs.filter((x) => x.added).length} new pairs, ${n("pairing_auto")} rows classified as transfers (C)`,
  );

  console.log(`\nB. accounts still being checked (the deployed sync judges each the next time it brings it new rows):`);
  if (p.autoAccounts.length === 0) console.log("  none");
  for (const a of p.autoAccounts) {
    const advancial = a.account.institution_id === ADVANCIAL_INSTITUTION_ID || /advancial/i.test(a.account.institution_name ?? "");
    const outcome =
      a.verdict === "unknown" ? "stays held (no verdict): the user's answer" : a.block ? `held back (${a.block}): the user's answer` : `AUTO-RESOLVES ${a.verdict}, releases ${a.held} rows`;
    console.log(
      `  ${advancial ? "[ADVANCIAL] " : ""}${short(a.account.id)} user ${short(a.account.user_id)} ${a.account.institution_name ?? "?"} ` +
        `${a.account.type}/${a.account.subtype} item=${a.account.item_status} held=${a.held} -> ${outcome}`,
    );
  }
  for (const a of p.accounts) {
    const advancial = a.institution_id === ADVANCIAL_INSTITUTION_ID || /advancial/i.test(a.institution_name ?? "");
    if (advancial && !p.autoAccounts.some((x) => x.account.id === a.id)) {
      console.log(`  [ADVANCIAL] ${short(a.id)} user ${short(a.user_id)} ${a.type}/${a.subtype} ${a.sign_convention} item=${a.item_status}: no held rows, nothing automatic`);
    }
  }

  console.log(`\nC. pairs the deployed sync makes (3-day window; "new" = not made with the old 1-day window):`);
  if (p.pairs.length === 0) console.log("  none");
  const allRows = new Map<string, TxnRow>();
  for (const userId of new Set(p.pairs.map((x) => x.userId))) for (const r of await loadUserTxns(tx, userId)) allRows.set(r.id, r);
  for (const { userId, pair, added } of p.pairs) {
    const a = allRows.get(pair.legA);
    const b = allRows.get(pair.legB);
    const leg = (r: TxnRow | undefined) =>
      r ? `${short(r.id)} acct ${short(r.account_id)} ${r.direction} ${usd(Number(r.amount))} ${new Date(r.occurred_at).toISOString().slice(0, 10)} role=${r.event_role ?? "null"}` : "?";
    console.log(
      `  ${added ? "NEW " : "old "}user ${short(userId)} tier ${pair.tier}: ${leg(a)} <-> ${leg(b)}` +
        (pair.classifyLegId ? ` | becomes a transfer: ${short(pair.classifyLegId)}` : ""),
    );
  }

  for (const userId of users) {
    const rows = await loadUserTxns(tx, userId);
    const cats = await tx<BudgetCategory[]>`select id, kind from public.categories where user_id = ${userId}`;
    const mine = p.changes.filter((c) => c.userId === userId);
    const changeById = new Map(mine.map((c) => [c.id, c]));
    const autoById = new Map(mine.filter((c) => !APPLIED_KINDS.has(c.kind)).map((c) => [c.id, c]));
    const before = rows.map((t) => toBudgetTxn(t, excluded));
    const atDeploy = rows.map((t) => toBudgetTxn(withState(t, autoById.get(t.id)), excluded));
    // every change in sequence: the automatic ones, then what --apply writes on top
    const after = rows.map((t) => {
      const auto = withState(t, autoById.get(t.id));
      const applied = mine.find((c) => c.id === t.id && APPLIED_KINDS.has(c.kind));
      return toBudgetTxn(withState(auto, applied), excluded);
    });
    const months = [...new Set(rows.map((t) => monthOf(new Date(t.occurred_at))))].sort().slice(-6);
    console.log(`\nuser ${short(userId)}: ${changeById.size} row changes`);
    const counts = new Map<string, number>();
    for (const c of changeById.values()) {
      const t = rows.find((r) => r.id === c.id)!;
      const key = `${c.kind} ${t.plaid_category_detailed ?? t.plaid_category_primary ?? "no PFC"} ${c.before.event_role ?? "null"}->${c.after.event_role ?? "null"} ${c.before.direction}->${c.after.direction}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [k, n] of counts) console.log(`  ${n} x ${k}`);
    console.log("  month    | spend now -> at deploy -> +apply | income now -> at deploy -> +apply | Money Left now -> at deploy -> +apply");
    for (const m of months) {
      const b = rollup(before, cats, m as never);
      const d = rollup(atDeploy, cats, m as never);
      const a = rollup(after, cats, m as never);
      console.log(
        `  ${m}  | ${usd(b.spend)} -> ${usd(d.spend)} -> ${usd(a.spend)} | ${usd(b.income)} -> ${usd(d.income)} -> ${usd(a.income)}` +
          ` | ${usd(b.net)} -> ${usd(d.net)} -> ${usd(a.net)}`,
      );
    }
    if (diagnose) diagnoseUser(userId, rows, p.accounts.filter((a) => a.user_id === userId), cats, excluded, months);
  }
}

/** Facts for the owner's judgement; computed, never written. */
function diagnoseUser(
  userId: string,
  rows: TxnRow[],
  accounts: PlaidAccount[],
  cats: BudgetCategory[],
  excluded: Set<string>,
  months: string[],
) {
  console.log(`  accounts:`);
  for (const a of accounts) {
    const live = rows.filter((t) => t.plaid_account_id === a.id);
    const counting = live.filter((t) => t.status === "confirmed" && t.duplicate_of_id == null);
    const groups = new Map<string, number>();
    for (const t of counting) if (t.content_fingerprint) groups.set(t.content_fingerprint, (groups.get(t.content_fingerprint) ?? 0) + 1);
    const excessCopies = [...groups.values()].reduce((s, n) => s + (n - 1), 0);
    const biggest = Math.max(0, ...groups.values());
    // Stored direction vs the raw Plaid sign under the account's current convention: a mismatch is a row that landed
    // before the convention was known and was never corrected (or a user's own edit; the two can't be told apart).
    const contradicting = counting.filter((t) => {
      if (typeof t.raw_amount !== "number" || t.raw_amount === 0 || a.sign_convention === "unknown") return false;
      const out = a.sign_convention === "inverted" ? t.raw_amount < 0 : t.raw_amount > 0;
      return (out ? "debit" : "credit") !== t.direction;
    }).length;
    console.log(
      `    ${short(a.id)} ${a.institution_name ?? "?"} ${a.type}/${a.subtype} ${a.sign_convention} link=${a.link_state} item=${a.item_status}` +
        ` excluded=${a.excluded_from_calculations} rows=${live.length} counting=${counting.length} dup-marked=${live.filter((t) => t.duplicate_of_id).length}` +
        ` excess-identical-copies=${excessCopies} (largest cluster ${biggest}) direction-contradicts-convention=${contradicting}`,
    );
  }
  // What each suspect group moves today: rollup(all) minus rollup(all without the group), latest months.
  const all = rows.map((t) => toBudgetTxn(t, excluded));
  const fingerprintSeen = new Set<string>();
  const isExcessCopy = rows.map((t) => {
    if (t.status !== "confirmed" || t.duplicate_of_id || !t.content_fingerprint) return false;
    const key = `${t.account_id}:${t.content_fingerprint}`;
    if (fingerprintSeen.has(key)) return true;
    fingerprintSeen.add(key);
    return false;
  });
  const groups: [string, (t: TxnRow, i: number) => boolean][] = [
    ["identical copies beyond the first", (_t, i) => isExcessCopy[i]],
    ["LOAN_PAYMENTS rows with no role", (t) => t.plaid_category_primary === "LOAN_PAYMENTS" && t.event_role == null],
    ["rows with no role at all", (t) => t.event_role == null],
  ];
  for (const [label, pick] of groups) {
    const without = rows.map((t, i) => (pick(t, i) ? null : all[i])).filter((x): x is BudgetTxn => x != null);
    const line = months
      .map((m) => {
        const w = rollup(all, cats, m as never);
        const wo = rollup(without, cats, m as never);
        return `${m} spend ${usd(w.spend - wo.spend)} income ${usd(w.income - wo.income)}`;
      })
      .join("; ");
    console.log(`  effect today of ${label}: ${line}`);
  }
  void userId;
}

async function main() {
  if (revertFile) return revert(revertFile);
  if (!apply) {
    await sql
      .begin("read only", async (tx) => {
        await report(tx, await plan(tx));
        throw new RolledBack();
      })
      .catch((e) => {
        if (!(e instanceof RolledBack)) throw e;
      });
    console.log("\nDry run: nothing was written (read-only transaction, rolled back).");
    return;
  }
  await sql.begin(async (tx) => {
    const p = await plan(tx);
    await report(tx, p);
    const dir = path.join(process.cwd(), ".tmp", "remediation");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `card-payments-${ref}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    // Only A and the stragglers: B-automatic and C are the deployed sync's, behind its own gate.
    const toWrite = p.changes.filter((c) => APPLIED_KINDS.has(c.kind));
    fs.writeFileSync(file, JSON.stringify({ ref, at: new Date().toISOString(), changes: toWrite, conventionChanges: [] }, null, 1));
    console.log(`\naudit file (old and new values): ${file}`);
    let written = 0;
    for (const c of toWrite) {
      const res = await tx`
        update public.transactions set event_role = ${c.after.event_role}, direction = ${c.after.direction}::txn_direction,
          status = ${c.after.status}::txn_status, pending_reason = ${c.after.pending_reason}
        where id = ${c.id} and event_role is not distinct from ${c.before.event_role}
          and direction = ${c.before.direction}::txn_direction and status = ${c.before.status}::txn_status`;
      written += res.count;
    }
    console.log(`applied: ${written} of ${toWrite.length} rows`);
  });
}

class RolledBack extends Error {}

async function revert(file: string) {
  const audit = JSON.parse(fs.readFileSync(file, "utf8")) as {
    ref: string;
    changes: RowChange[];
    conventionChanges: ConventionChange[];
  };
  if (audit.ref !== ref) throw new Error(`audit file is for ${audit.ref}, not ${ref}`);
  await sql.begin(async (tx) => {
    let restored = 0;
    const changedSince: string[] = [];
    for (const c of audit.changes) {
      const res = await tx`
        update public.transactions set event_role = ${c.before.event_role}, direction = ${c.before.direction}::txn_direction,
          status = ${c.before.status}::txn_status, pending_reason = ${c.before.pending_reason}
        where id = ${c.id} and event_role is not distinct from ${c.after.event_role}
          and direction = ${c.after.direction}::txn_direction and status = ${c.after.status}::txn_status`;
      if (res.count === 1) restored++;
      else changedSince.push(c.id);
    }
    for (const c of audit.conventionChanges) {
      await tx`update public.plaid_accounts set sign_convention = 'unknown', updated_at = now()
               where id = ${c.plaidAccountId} and sign_convention = ${c.after}`;
    }
    console.log(`reverted ${restored} of ${audit.changes.length} rows; ${changedSince.length} changed since the apply and were left alone`);
    for (const id of changedSince.slice(0, 50)) console.log(`  left alone: ${id}`);
  });
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
