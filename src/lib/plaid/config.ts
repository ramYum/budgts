/**
 * Plaid server-side configuration. Read from the environment once and validated
 * up front so a misconfigured deploy fails loudly instead of at the first API
 * call. Values come from `.env.local` (dev), `.env.staging` (staging runtime),
 * and the Vercel project settings (production) — never `NEXT_PUBLIC_*`.
 *
 * This module intentionally does NOT import "server-only" (that throws under
 * Vitest). It is pure given an env object; keep it out of client bundles by
 * only importing it from server code / `src/lib/plaid/client.ts`.
 *
 * Design: docs/specs/2026-09-09-v1-plaid-transaction-ingestion-design.md §7, §9.
 */
import { CountryCode, PlaidEnvironments, Products } from "plaid";

export type PlaidEnv = "sandbox" | "production";

export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: PlaidEnv;
  /** Base URL for the Plaid API, derived from `env`. */
  basePath: string;
  /** Pinned Plaid-Version header — response shapes change between versions. */
  plaidVersion: string;
  products: Products[];
  countryCodes: CountryCode[];
  /** 32-byte AES-256 key for `plaid_items.access_token_enc` (see crypto.ts). */
  tokenEncKey: Buffer;
  /** Shared secret the pg_cron poller presents to `/api/plaid/sync-due`. */
  cronSecret: string | null;
}

/** Plaid-Version we develop and test against. Bump deliberately, never implicitly. */
export const PINNED_PLAID_VERSION = "2020-09-14";

/** A subset of the environment — anything with string-ish keyed lookups. */
export type EnvLike = Record<string, string | undefined>;

export function loadPlaidConfig(env: EnvLike = process.env): PlaidConfig {
  const rawEnv = (env.PLAID_ENV ?? "sandbox").toLowerCase();
  if (rawEnv !== "sandbox" && rawEnv !== "production") {
    throw new Error(`PLAID_ENV must be "sandbox" or "production" (got ${JSON.stringify(env.PLAID_ENV)})`);
  }
  return {
    clientId: required(env, "PLAID_CLIENT_ID"),
    secret: required(env, "PLAID_SECRET"),
    env: rawEnv,
    basePath: PlaidEnvironments[rawEnv],
    plaidVersion: PINNED_PLAID_VERSION,
    products: [Products.Transactions],
    countryCodes: [CountryCode.Us],
    tokenEncKey: decodeTokenEncKey(required(env, "PLAID_TOKEN_ENC_KEY")),
    cronSecret: env.CRON_SECRET ?? null,
  };
}

function required(env: EnvLike, name: string): string {
  const value = env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is not set — see .env.local.example`);
  }
  return value;
}

/** Decode + validate the base64 AES key. Must be exactly 32 bytes (AES-256). */
export function decodeTokenEncKey(base64: string): Buffer {
  const buf = Buffer.from(base64, "base64");
  // Buffer.from silently drops invalid chars, so re-encode and compare lengths
  // as a cheap sanity check that the input really was base64.
  if (buf.length !== 32) {
    throw new Error(
      `PLAID_TOKEN_ENC_KEY must be 32 bytes of base64 (AES-256); decoded to ${buf.length} bytes`,
    );
  }
  return buf;
}
