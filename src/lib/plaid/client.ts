/**
 * The Plaid API client — server-only. Constructed lazily from `loadPlaidConfig`
 * so a missing env var fails at first use with a clear message rather than at
 * module load. Every server module that talks to Plaid imports `plaidClient()`
 * from here; nothing else instantiates `PlaidApi`.
 *
 * `import "server-only"` guarantees this never ends up in a client bundle (it
 * also means this file has no unit test — it is exercised by the Sandbox
 * integration tests). Design §6, §7.
 */
import "server-only";
import { Configuration, PlaidApi } from "plaid";
import { loadPlaidConfig, type PlaidConfig } from "./config";

let cached: { client: PlaidApi; config: PlaidConfig } | null = null;

function build(): { client: PlaidApi; config: PlaidConfig } {
  const config = loadPlaidConfig();
  const client = new PlaidApi(
    new Configuration({
      basePath: config.basePath,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": config.clientId,
          "PLAID-SECRET": config.secret,
          "Plaid-Version": config.plaidVersion,
        },
      },
    }),
  );
  return { client, config };
}

/** The shared Plaid API client. */
export function plaidClient(): PlaidApi {
  cached ??= build();
  return cached.client;
}

/** The validated Plaid config (same instance the client was built from). */
export function plaidConfig(): PlaidConfig {
  cached ??= build();
  return cached.config;
}

/** Test/CLI hook: drop the memoised client so the next call re-reads the env. */
export function resetPlaidClient(): void {
  cached = null;
}
