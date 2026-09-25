/**
 * Plaid-integration harness: a real Sandbox client + a helper to stand up a
 * Sandbox Item that already has transactions. Reuses the staging-DB harness.
 */
import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products, TransactionsUpdateStatus } from "plaid";
import { loadPlaidConfig } from "@/lib/plaid/config";

export { cleanupUser, client as pg, db, categoryIdByName, mainAccountId, seedUser } from "../integration/_db";

const cfg = loadPlaidConfig();

export function plaidTestClient(): PlaidApi {
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[cfg.env],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": cfg.clientId,
          "PLAID-SECRET": cfg.secret,
          "Plaid-Version": cfg.plaidVersion,
        },
      },
    }),
  );
}

export interface SandboxItem {
  accessToken: string;
  itemId: string;
  accounts: Array<{ account_id: string; name: string; type: string }>;
}

/** How long a fresh Sandbox Item gets to finish its historical pull. */
export const HISTORICAL_READY_DEADLINE_MS = 90_000;

interface Readiness {
  /** `/transactions/sync` `transactions_update_status`. */
  status: TransactionsUpdateStatus;
  /** Transactions a sync from no cursor returns, all pages. */
  syncView: number;
  /** `/transactions/get` `total_transactions` over the whole history window. */
  total: number | string;
}

async function readReadiness(client: PlaidApi, accessToken: string): Promise<Readiness> {
  let cursor: string | undefined;
  let syncView = 0;
  let status: TransactionsUpdateStatus;
  for (;;) {
    const s = (await client.transactionsSync({ access_token: accessToken, cursor, count: 500 })).data;
    syncView += s.added.length;
    status = s.transactions_update_status;
    cursor = s.next_cursor;
    if (!s.has_more) break;
  }
  const today = new Date().toISOString().slice(0, 10);
  const twoYearsAgo = new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10);
  let total: number | string;
  try {
    total = (
      await client.transactionsGet({
        access_token: accessToken,
        start_date: twoYearsAgo,
        end_date: today,
        options: { count: 1 },
      })
    ).data.total_transactions;
  } catch (e) {
    total = (e as { response?: { data?: { error_code?: string } } }).response?.data?.error_code ?? "error";
  }
  return { status, syncView, total };
}

/**
 * Wait until the Item's transaction history is complete AND visible to
 * `/transactions/sync`. Plaid fills a new Item in two steps (recent days,
 * then the rest of `days_requested`) and reports progress in
 * `transactions_update_status`. On its own that flag isn't enough in Sandbox:
 * observed, it read `HISTORICAL_UPDATE_COMPLETE` while a sync still returned
 * 16 of 48 rows, and the next sync from that cursor added the other 32 — the
 * exact-count failures this fixture exists to prevent. So ready means both:
 * the flag is complete, and a sync from no cursor returns every transaction
 * `/transactions/get` counts for the Item. Cursor-less reads move no cursor
 * the tests later use.
 */
export async function waitForHistoricalUpdate(
  client: PlaidApi,
  accessToken: string,
  deadlineMs = HISTORICAL_READY_DEADLINE_MS,
): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    const r = await readReadiness(client, accessToken);
    if (r.status === TransactionsUpdateStatus.HistoricalUpdateComplete && r.syncView > 0 && r.syncView === r.total) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Plaid Sandbox Item not ready after ${deadlineMs}ms: transactions_update_status = ${r.status} ` +
          `(want ${TransactionsUpdateStatus.HistoricalUpdateComplete}), /transactions/sync returns ${r.syncView}, ` +
          `/transactions/get total_transactions = ${r.total}`,
      );
    }
    await new Promise((res) => setTimeout(res, 1000)); // pacing between readiness reads, not a wait for data
  }
}

/** Create a Sandbox Item whose transaction history Plaid reports complete. */
export async function createSandboxItemWithTxns(client = plaidTestClient()): Promise<SandboxItem> {
  const pt = await client.sandboxPublicTokenCreate({
    institution_id: "ins_109508",
    initial_products: [Products.Transactions],
    // a webhook URL is required for /sandbox/item/fire_webhook to be accepted;
    // it points nowhere on purpose — this layer never receives the delivery.
    options: { transactions: { days_requested: 90 }, webhook: "https://example.com/plaid/webhook" },
  });
  const ex = await client.itemPublicTokenExchange({ public_token: pt.data.public_token });
  const accessToken = ex.data.access_token;

  await waitForHistoricalUpdate(client, accessToken);

  const accounts = (await client.accountsGet({ access_token: accessToken })).data.accounts.map((a) => ({
    account_id: a.account_id,
    name: a.name ?? "",
    type: String(a.type),
  }));
  return { accessToken, itemId: ex.data.item_id, accounts };
}

export const COUNTRY = CountryCode.Us;
