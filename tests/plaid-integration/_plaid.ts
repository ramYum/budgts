/**
 * Plaid-integration harness: a real Sandbox client + a helper to stand up a
 * Sandbox Item that already has transactions. Reuses the staging-DB harness.
 */
import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from "plaid";
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

/** Create a Sandbox Item and poll `/transactions/sync` until transactions exist. */
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

  for (let i = 0; i < 15; i++) {
    const s = await client.transactionsSync({ access_token: accessToken, count: 1 });
    if (s.data.added.length > 0 || s.data.has_more) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  const accounts = (await client.accountsGet({ access_token: accessToken })).data.accounts.map((a) => ({
    account_id: a.account_id,
    name: a.name ?? "",
    type: String(a.type),
  }));
  return { accessToken, itemId: ex.data.item_id, accounts };
}

export const COUNTRY = CountryCode.Us;
