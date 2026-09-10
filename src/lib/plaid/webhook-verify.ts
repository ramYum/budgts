/**
 * Verifies the authenticity of an inbound Plaid webhook (design §20).
 *
 * Plaid signs every webhook with a JWT in the `Plaid-Verification` header
 * (alg ES256). To trust the request we:
 *   1. read the JWT header's `kid`,
 *   2. fetch the matching JWK from `/webhook_verification_key/get` (injected +
 *      cached by the caller),
 *   3. verify the JWT signature with that key,
 *   4. check the JWT's `request_body_sha256` against a SHA-256 of the *raw*
 *      request body,
 *   5. reject stale tokens (`iat` older than `maxAgeSeconds`).
 *
 * Pure given the key-fetcher and a clock; no network or framework here.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { decodeProtectedHeader, importJWK, type JWK, jwtVerify } from "jose";

export type WebhookVerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

export interface VerifyDeps {
  /** Raw, unparsed request body exactly as received. */
  rawBody: string;
  /** Value of the `Plaid-Verification` header. */
  jwt: string | null | undefined;
  /** Fetch (and ideally cache) the JWK for a given `kid`. */
  getKey: (kid: string) => Promise<JWK | null>;
  /** Max accepted age of the JWT, in seconds. Default 300 (5 min). */
  maxAgeSeconds?: number;
  /** Injectable clock (ms since epoch) for tests. */
  now?: () => number;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Constant-time compare of two equal-length lowercase hex strings. */
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export async function verifyPlaidWebhook(deps: VerifyDeps): Promise<WebhookVerifyResult> {
  const { rawBody, jwt, getKey, maxAgeSeconds = 300, now = Date.now } = deps;

  if (!jwt) return { ok: false, reason: "missing Plaid-Verification header" };

  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(jwt);
  } catch {
    return { ok: false, reason: "malformed JWT" };
  }
  if (header.alg !== "ES256") return { ok: false, reason: `unexpected alg ${String(header.alg)}` };
  if (!header.kid) return { ok: false, reason: "JWT header has no kid" };

  const jwk = await getKey(header.kid);
  if (!jwk) return { ok: false, reason: `no verification key for kid ${header.kid}` };

  let payload: Record<string, unknown>;
  try {
    const key = await importJWK(jwk, "ES256");
    ({ payload } = await jwtVerify(jwt, key, { algorithms: ["ES256"] }));
  } catch (e) {
    return { ok: false, reason: `signature verification failed: ${(e as Error).message}` };
  }

  const iat = payload.iat;
  if (typeof iat !== "number") return { ok: false, reason: "JWT has no numeric iat" };
  const ageSeconds = now() / 1000 - iat;
  if (ageSeconds > maxAgeSeconds) return { ok: false, reason: "JWT is too old (possible replay)" };
  if (ageSeconds < -60) return { ok: false, reason: "JWT iat is in the future" };

  const claimed = payload.request_body_sha256;
  if (typeof claimed !== "string") return { ok: false, reason: "JWT has no request_body_sha256" };
  if (!hexEqual(claimed.toLowerCase(), sha256Hex(rawBody))) {
    return { ok: false, reason: "request body hash mismatch" };
  }

  return { ok: true };
}
