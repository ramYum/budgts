/**
 * The response contract of the billing endpoints (server source of truth: `src/lib/billing/entitlement.ts` +
 * `src/lib/billing/http.ts`). Mobile is a separate npm root and cannot import server code, so the shape is mirrored
 * here and VALIDATED at runtime: a server change the app does not understand becomes a clear error state, never a
 * screen that guesses whether the user has Premium.
 *
 * The client makes NO access decision from anything but this server-provided view-model.
 */

export type EntitlementStatus = "none" | "trialing" | "active" | "grace" | "expired" | "revoked";
export type StoreName = "apple" | "google";

export type EntitlementView = {
  /** The only field an access decision may key off. */
  hasPremium: boolean;
  status: EntitlementStatus;
  isTrial: boolean;
  willRenew: boolean;
  trialEndsAt: string | null;
  accessUntil: string | null;
  productId: string | null;
  store: StoreName | null;
  /** The account has never had a trial or purchase: the "Start your 14-day free trial" offer applies. A hint; the store is the authority. */
  canStartTrial: boolean;
  renewal: { amount: number; currency: string } | null;
};

export type RefreshStatus =
  | "refreshed"
  | "throttled"
  | "no_provider_record"
  | "unavailable"
  | "environment_mismatch"
  | "provider_error"
  | "account_deleting";

export class ContractError extends Error {}

const STATUSES: readonly EntitlementStatus[] = ["none", "trialing", "active", "grace", "expired", "revoked"];
const REFRESH_STATUSES: readonly RefreshStatus[] = ["refreshed", "throttled", "no_provider_record", "unavailable", "environment_mismatch", "provider_error", "account_deleting"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nullableString = (v: unknown, name: string): string | null => {
  if (v === null) return null;
  if (typeof v === "string") return v;
  throw new ContractError(`${name} must be a string or null`);
};
const bool = (v: unknown, name: string): boolean => {
  if (typeof v === "boolean") return v;
  throw new ContractError(`${name} must be a boolean`);
};

export function parseEntitlementView(v: unknown): EntitlementView {
  if (!isObj(v)) throw new ContractError("entitlement must be an object");
  const status = v.status;
  if (typeof status !== "string" || !STATUSES.includes(status as EntitlementStatus)) throw new ContractError("unknown entitlement status");
  const store = v.store;
  if (store !== null && store !== "apple" && store !== "google") throw new ContractError("unknown store");
  let renewal: EntitlementView["renewal"] = null;
  if (v.renewal !== null) {
    if (!isObj(v.renewal) || typeof v.renewal.amount !== "number" || typeof v.renewal.currency !== "string") throw new ContractError("renewal is malformed");
    renewal = { amount: v.renewal.amount, currency: v.renewal.currency };
  }
  return {
    hasPremium: bool(v.hasPremium, "hasPremium"),
    status: status as EntitlementStatus,
    isTrial: bool(v.isTrial, "isTrial"),
    willRenew: bool(v.willRenew, "willRenew"),
    trialEndsAt: nullableString(v.trialEndsAt, "trialEndsAt"),
    accessUntil: nullableString(v.accessUntil, "accessUntil"),
    productId: nullableString(v.productId, "productId"),
    store: store as StoreName | null,
    canStartTrial: bool(v.canStartTrial, "canStartTrial"),
    renewal,
  };
}

/** `GET /api/billing/entitlement` -> `{ entitlement }` */
export function parseEntitlementResponse(body: unknown): EntitlementView {
  if (!isObj(body)) throw new ContractError("response must be an object");
  return parseEntitlementView(body.entitlement);
}

/** `POST /api/billing/entitlement/refresh` -> `{ status, entitlement }` */
export function parseRefreshResponse(body: unknown): { status: RefreshStatus; entitlement: EntitlementView } {
  if (!isObj(body)) throw new ContractError("response must be an object");
  const status = body.status;
  if (typeof status !== "string" || !REFRESH_STATUSES.includes(status as RefreshStatus)) throw new ContractError("unknown refresh status");
  return { status: status as RefreshStatus, entitlement: parseEntitlementView(body.entitlement) };
}
