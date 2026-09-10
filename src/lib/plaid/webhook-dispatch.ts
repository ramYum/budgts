/**
 * Pure classification of an inbound Plaid webhook into the action the handler
 * should take on `plaid_items`. Keeps the route thin and testable. Design §20.
 */
import type { PlaidItemStatus } from "./item-store";

export interface PlaidWebhookEvent {
  webhook_type: string;
  webhook_code: string;
  item_id?: string | null;
  error?: { error_code?: string | null } | null;
}

export type WebhookAction =
  | { kind: "needs_sync" }
  | { kind: "set_status"; status: PlaidItemStatus; errorCode: string | null }
  | { kind: "noop"; reason: string };

const SYNC_CODES = new Set([
  "SYNC_UPDATES_AVAILABLE",
  "DEFAULT_UPDATE",
  "INITIAL_UPDATE",
  "HISTORICAL_UPDATE",
  "TRANSACTIONS_REMOVED",
]);

export function classifyWebhook(e: PlaidWebhookEvent): WebhookAction {
  const { webhook_type: type, webhook_code: code } = e;

  if (type === "TRANSACTIONS") {
    return SYNC_CODES.has(code) ? { kind: "needs_sync" } : { kind: "noop", reason: `TRANSACTIONS/${code}` };
  }

  if (type === "ITEM") {
    switch (code) {
      case "ERROR": {
        const ec = e.error?.error_code ?? null;
        // ITEM_LOGIN_REQUIRED is the common recoverable one; other ITEM errors
        // still need the user, so surface them the same way.
        return { kind: "set_status", status: "login_required", errorCode: ec };
      }
      case "LOGIN_REPAIRED":
        return { kind: "set_status", status: "active", errorCode: null };
      case "PENDING_EXPIRATION":
      case "PENDING_DISCONNECT":
        return { kind: "set_status", status: "pending_expiration", errorCode: code };
      case "USER_PERMISSION_REVOKED":
      case "USER_ACCOUNT_REVOKED":
        return { kind: "set_status", status: "revoked", errorCode: code };
      case "NEW_ACCOUNTS_AVAILABLE":
      case "WEBHOOK_UPDATE_ACKNOWLEDGED":
      default:
        return { kind: "noop", reason: `ITEM/${code}` };
    }
  }

  return { kind: "noop", reason: `${type}/${code}` };
}
