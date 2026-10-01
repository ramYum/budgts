// Recover a Plaid Item whose transactions cursor was stored past rows that
// never landed (a sync that ran before its accounts were mapped: the pre-lease
// 30s poller, or a stale deployment still running it). STAGING ONLY.
//
//   node tools/plaid-resync-item.mjs --item <plaid item_id>            # dry run: shows the Item, changes nothing
//   node tools/plaid-resync-item.mjs --item <plaid item_id> --apply    # clears the cursor, flags the Item
//
// Clearing `plaid_items.transactions_cursor` makes the next sync (Sync now,
// or the sweep, since `needs_sync` is set) re-pull the Item's whole history.
// Landing is idempotent on the Plaid transaction id (`transactions_source_ref_uq`):
// rows already here are matched and updated in place, keeping user categories,
// notes and transfer marks; only the missing rows are inserted. Accounts set
// to "Don't import" stay skipped. Same logic as `resetItemCursor` in
// src/lib/plaid/item-store.ts, proven by tests/plaid-integration/sync-cursor-loss.test.ts.
//
// Two caveats, so a reset is never automatic and always reviewed first:
//  - Deleted rows come back. Deleting a bank transaction hard-deletes it
//    (deleteTransactionById; no tombstone), so the re-pull inserts it again.
//    The database keeps no record of deletions, so how many can't be
//    estimated in advance: the dry run prints the current row counts as the
//    baseline to compare against after the re-pull.
//  - Paused-window rows come back. An account that was paused ("Don't import")
//    and later resumed skipped its rows while paused; the re-pull lands them,
//    because it is mapped now. No pause history is kept (plaid_accounts holds
//    only the current link_state, and updated_at is not maintained on change),
//    so the dry run can't list which accounts were ever paused. It shows each
//    mapped account's longest gap between bank rows as a hint only.
//
// Production is refused here on purpose: there it is an owner-approved
// remediation with exact affected rows and before/after totals (CLAUDE.md).
import fs from "node:fs";
import postgres from "postgres";

const STAGING_REF = "uvowywszaiojboaxdmoz";

const args = process.argv.slice(2);
const itemId = args[args.indexOf("--item") + 1];
const apply = args.includes("--apply");
if (!args.includes("--item") || !itemId || itemId.startsWith("--")) {
  console.error("usage: node tools/plaid-resync-item.mjs --item <plaid item_id> [--apply]");
  process.exit(2);
}

const env = Object.fromEntries(
  fs
    .readFileSync(".env.staging", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
if (!env.DIRECT_URL?.includes(STAGING_REF)) {
  console.error(`refusing: .env.staging DIRECT_URL does not point at staging (${STAGING_REF})`);
  process.exit(1);
}

const sql = postgres(env.DIRECT_URL, { prepare: false, max: 1 });
try {
  const [item] = await sql`
    select i.id, i.status, i.transactions_cursor is not null as has_cursor, i.last_synced_at,
      (select count(*)::int from public.plaid_accounts a where a.plaid_item_id = i.id and a.link_state = 'mapped') as mapped,
      (select count(*)::int from public.plaid_accounts a where a.plaid_item_id = i.id and a.link_state = 'unmapped') as unmapped,
      (select count(*)::int from public.transactions t
         join public.plaid_accounts a on a.id = t.plaid_account_id
        where a.plaid_item_id = i.id and t.source = 'bank') as bank_rows
    from public.plaid_items i where i.item_id = ${itemId}`;
  if (!item) {
    console.error("no such Item on staging");
    process.exit(1);
  }
  console.log("before:", item);
  const accts = await sql`
    select a.name, a.mask, a.link_state, count(t.id)::int as bank_rows,
      min(t.occurred_at)::date as first_row, max(t.occurred_at)::date as last_row,
      max(t.gap)::int as longest_gap_days
    from public.plaid_accounts a
    join public.plaid_items i on i.id = a.plaid_item_id
    left join lateral (
      select x.id, x.occurred_at,
        extract(day from x.occurred_at - lag(x.occurred_at) over (order by x.occurred_at)) as gap
      from public.transactions x where x.plaid_account_id = a.id and x.source = 'bank'
    ) t on true
    where i.item_id = ${itemId} and a.link_state = 'mapped'
    group by a.id order by a.name`;
  console.table(accts);
  console.log(
    "caveats: (1) bank rows the user deleted are re-added; deletions leave no record, so the count can't be estimated:" +
      " compare bank_rows above with the count after the re-pull. (2) No pause history is recorded, so accounts that" +
      " were ever paused can't be listed; a resumed account gets its paused-window rows back. longest_gap_days is a hint only.",
  );
  if (item.unmapped > 0) console.log("note: the Item still has unmapped accounts, so it won't sync until they are mapped.");
  if (!apply) {
    console.log("dry run: pass --apply to clear the cursor and flag the Item for a full re-pull.");
  } else {
    await sql`update public.plaid_items set transactions_cursor = null, needs_sync = true, updated_at = now() where item_id = ${itemId}`;
    console.log("cursor cleared, needs_sync set. Tap Sync now (or wait for the sweep), then re-run without --apply to compare bank_rows.");
  }
} finally {
  await sql.end();
}
