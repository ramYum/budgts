/**
 * Builds the server-side dependencies the routes hand to the billing/deletion handlers, from configuration. Kept out of
 * the route files so each route stays a few lines, and out of the handlers so they stay injectable in tests.
 */
import type { BillingCheck } from "@/lib/account/delete-account";
import { loadBillingConfig } from "./config";
import { getServerDb } from "./db";
import { createBillingCheck } from "./deletion-check";

/** The provider-aware check for account deletion. Undefined only if the server DB cannot even be opened. */
export async function billingCheckFor(): Promise<BillingCheck | undefined> {
  try {
    return createBillingCheck({ db: await getServerDb(), config: loadBillingConfig() });
  } catch {
    return undefined; // deletion must never fail because billing wiring could not start
  }
}
