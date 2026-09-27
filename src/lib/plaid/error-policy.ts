/**
 * Pure classification of a Plaid API failure during a sync, into what the
 * poller should do with the Item. Design §21.
 */
import type { PlaidItemStatus } from "./item-store";
import { MUTATION_DURING_PAGINATION_CODE } from "./sync-engine";

export interface PlaidErrorShape {
  error_type?: string | null;
  error_code?: string | null;
  request_id?: string | null;
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

export interface ErrorLogFields {
  message: string;
  stack?: string;
  errorCode?: string;
  errorType?: string;
  requestId?: string;
}

/**
 * The one safe way to log an error on a Plaid path: its message and stack,
 * plus Plaid's own error_code / error_type / request_id when present. Never
 * the error object itself: a Plaid SDK (axios) error carries the whole
 * request (the PLAID-CLIENT-ID / PLAID-SECRET headers, and the access or
 * public token in its body), its `.response.data` can carry account detail,
 * and a DB error can carry its query's parameters. `Error#message` / `#stack`
 * hold none of those, and an unknown thrown value is never dumped verbatim.
 */
export function describePlaidError(e: unknown): ErrorLogFields {
  const plaid = readPlaidError(e);
  const fields: ErrorLogFields =
    e instanceof Error
      ? { message: e.message, ...(e.stack ? { stack: e.stack } : {}) }
      : { message: "non-Error value thrown" };
  if (plaid?.error_code) fields.errorCode = plaid.error_code;
  if (plaid?.error_type) fields.errorType = plaid.error_type;
  if (plaid?.request_id) fields.requestId = plaid.request_id;
  return fields;
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
  if (code === MUTATION_DURING_PAGINATION_CODE) {
    // Reached only once sync-engine's bounded restart+backoff is exhausted
    // (see sync-engine.ts's SyncMutationDuringPagination / runSync). Plaid
    // documents this as a transient pagination race, correctly recovered by
    // restarting the whole loop from the original cursor — which the engine
    // already tried, repeatedly, before this propagated here. Decision is
    // deliberately identical to the generic fallback below (retryable,
    // counted, no forced status — same existing architecture, not a new
    // permanent state); the only difference is `errorCode` names the real,
    // known Plaid condition instead of collapsing into "UNKNOWN", so it's
    // visible in `plaid_items.error_code` for diagnosis.
    return { retry: true, countFailure: true, status: null, errorCode: code };
  }
  // API_ERROR and anything unrecognised: retry with backoff, count toward the
  // failure threshold so a persistently-broken item eventually flips to error.
  return { retry: true, countFailure: true, status: null, errorCode: code };
}
