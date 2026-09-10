/**
 * Pure classification of a Plaid API failure during a sync, into what the
 * poller should do with the Item. Design §21.
 */
import type { PlaidItemStatus } from "./item-store";

export interface PlaidErrorShape {
  error_type?: string | null;
  error_code?: string | null;
}

export interface ErrorDecision {
  /** Retry on the next poll tick? */
  retry: boolean;
  /** Bump `sync_failures` (drives the eventual flip to `error`)? */
  countFailure: boolean;
  /** Force this item status now (user action needed), if any. */
  status: PlaidItemStatus | null;
  errorCode: string;
}

const USER_ACTION_CODES: Record<string, PlaidItemStatus> = {
  ITEM_LOGIN_REQUIRED: "login_required",
  PENDING_EXPIRATION: "pending_expiration",
  PENDING_DISCONNECT: "pending_expiration",
  USER_PERMISSION_REVOKED: "revoked",
  USER_ACCOUNT_REVOKED: "revoked",
};

/** Read a Plaid error out of an unknown thrown value (SDK wraps it on `.response.data`). */
export function readPlaidError(e: unknown): PlaidErrorShape | null {
  if (typeof e !== "object" || e === null) return null;
  const data = (e as { response?: { data?: unknown } }).response?.data;
  if (data && typeof data === "object" && "error_code" in data) return data as PlaidErrorShape;
  if ("error_code" in (e as object)) return e as PlaidErrorShape;
  return null;
}

export function classifyPlaidError(e: unknown): ErrorDecision {
  const p = readPlaidError(e);
  const code = p?.error_code ?? "UNKNOWN";
  const type = p?.error_type ?? "";

  if (code in USER_ACTION_CODES) {
    return { retry: false, countFailure: false, status: USER_ACTION_CODES[code], errorCode: code };
  }
  if (type === "RATE_LIMIT_EXCEEDED" || code === "RATE_LIMIT_EXCEEDED") {
    return { retry: true, countFailure: false, status: null, errorCode: code };
  }
  if (type === "INSTITUTION_ERROR") {
    return { retry: true, countFailure: false, status: null, errorCode: code };
  }
  if (type === "INVALID_REQUEST" || type === "INVALID_INPUT") {
    // our bug — stop hammering, surface as error
    return { retry: false, countFailure: true, status: "error", errorCode: code };
  }
  // API_ERROR and anything unrecognised: retry with backoff, count toward the
  // failure threshold so a persistently-broken item eventually flips to error.
  return { retry: true, countFailure: true, status: null, errorCode: code };
}
