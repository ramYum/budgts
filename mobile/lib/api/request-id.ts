import * as Crypto from "expo-crypto";

/**
 * A fresh idempotency key for one create attempt: a v4 UUID from the platform's crypto. The one generator every create
 * in the app uses (transactions, categories, goals, contributions; goals and categories accept only a UUID,
 * transactions' `[A-Za-z0-9-]{8,64}` takes it too). A sheet takes one when it opens and keeps it for every try, so a
 * retry after a lost answer lands once. Called where the sheet opens, never injected (test/request-id-guard.test.ts).
 */
export function newRequestId(): string {
  return Crypto.randomUUID();
}
