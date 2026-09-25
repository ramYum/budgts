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

/**
 * Wait until Plaid reports the Item's historical transaction pull complete.
 * Plaid fills a new Item in two steps (recent days first, then the rest of
 * `days_requested`), and `/transactions/sync` reports which one it has
 * reached in `transactions_update_status`. Until it reads
 * `HISTORICAL_UPDATE_COMPLETE`, a sync can come back empty or partial and a
 * later sync from that cursor picks up the rest — which is exactly what the
 * tests' exact insert counts must not see. A cursor-less `count: 1` call only
 * reads the status; it moves no cursor the test later uses.
 */
export async function waitForHistoricalUpdate(
  client: PlaidApi,
  accessToken: string,
  deadlineMs = HISTORICAL_READY_DEADLINE_MS,
): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  let last: TransactionsUpdateStatus | undefined;
  for (;;) {
    last = (await client.transactionsSync({ access_token: accessToken, count: 1 })).data.transactions_update_status;
    if (last === TransactionsUpdateStatus.HistoricalUpdateComplete) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `Plaid Sandbox Item not ready after ${deadlineMs}ms: transactions_update_status = ${last}, expected ${TransactionsUpdateStatus.HistoricalUpdateComplete}`,
      );
    }
    await new Promise((r) => setTimeout(r, 1000)); // pacing between status reads, not a wait for data
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
