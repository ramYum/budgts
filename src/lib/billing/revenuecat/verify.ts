/**
 * RevenueCat webhook AUTHENTICATION (pure; no I/O). Verified against RevenueCat's documentation:
 *
 *  - Signature: header `X-RevenueCat-Webhook-Signature: t=<unix seconds>,v1=<hex>`, where v1 is
 *    HMAC-SHA256(signingSecret, "<t>.<raw request body bytes>"). It must be computed over the RAW body exactly as
 *    received (never over re-serialised JSON). `t` is recomputed by RevenueCat on every delivery attempt
 *    (retries included), so a short tolerance is correct — it covers clock skew and request latency only.
 *  - Authorization: an optional shared header value configured on the integration, sent with every request.
 *
 * FAIL CLOSED: if neither secret is configured the webhook is refused (never "accept everything"); if a secret IS
 * configured its check is mandatory. Comparisons are constant-time. Identity is never taken from the request — the
 * caller only learns whether the delivery genuinely came from RevenueCat.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-revenuecat-webhook-signature";
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type VerifyResult = { ok: true } | { ok: false; reason: "not_configured" | "bad_authorization" | "missing_signature" | "malformed_signature" | "bad_signature" | "stale_signature" };

export interface VerifyInput {
  rawBody: string;
  /** Value of the X-RevenueCat-Webhook-Signature header, or null. */
  signatureHeader: string | null;
  /** Value of the Authorization header, or null. */
  authorizationHeader: string | null;
  signingSecret: string | null;
  expectedAuthorization: string | null;
  now?: Date;
  toleranceSeconds?: number;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Computes the signature RevenueCat would send. Exported for tests and for building fixtures. */
export function signRevenueCatBody(rawBody: string, secret: string, timestampSeconds: number): string {
  const v1 = createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`).digest("hex");
  return `t=${timestampSeconds},v1=${v1}`;
}

export function verifyRevenueCatWebhook(input: VerifyInput): VerifyResult {
  const { signingSecret, expectedAuthorization } = input;
  if (!signingSecret && !expectedAuthorization) return { ok: false, reason: "not_configured" };

  if (expectedAuthorization) {
    // Accept the value verbatim or as "Bearer <value>" — both are how an operator may have entered it.
    const presented = input.authorizationHeader ?? "";
    const bare = presented.startsWith("Bearer ") ? presented.slice(7) : presented;
    if (!safeEqual(presented, expectedAuthorization) && !safeEqual(bare, expectedAuthorization)) {
      return { ok: false, reason: "bad_authorization" };
    }
  }

  if (signingSecret) {
    if (!input.signatureHeader) return { ok: false, reason: "missing_signature" };
    const parts = new Map<string, string>();
    for (const piece of input.signatureHeader.split(",")) {
      const i = piece.indexOf("=");
      if (i > 0) parts.set(piece.slice(0, i).trim(), piece.slice(i + 1).trim());
    }
    const t = parts.get("t");
    const v1 = parts.get("v1");
    if (!t || !v1 || !/^\d+$/.test(t) || !/^[0-9a-f]{64}$/i.test(v1)) return { ok: false, reason: "malformed_signature" };
    const expected = createHmac("sha256", signingSecret).update(`${t}.${input.rawBody}`).digest("hex");
    if (!safeEqual(expected, v1.toLowerCase())) return { ok: false, reason: "bad_signature" };
    const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
    if (Math.abs(nowSeconds - Number(t)) > (input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS)) return { ok: false, reason: "stale_signature" };
  }

  return { ok: true };
}
