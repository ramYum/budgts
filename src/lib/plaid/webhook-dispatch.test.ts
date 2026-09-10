import { describe, expect, it } from "vitest";
import { classifyWebhook } from "./webhook-dispatch";

const ev = (over: Partial<Parameters<typeof classifyWebhook>[0]> = {}) => ({
  webhook_type: "TRANSACTIONS",
  webhook_code: "SYNC_UPDATES_AVAILABLE",
  item_id: "item-1",
  ...over,
});

describe("classifyWebhook", () => {
  it.each(["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE", "HISTORICAL_UPDATE", "TRANSACTIONS_REMOVED"])(
    "TRANSACTIONS/%s → needs_sync",
    (code) => {
      expect(classifyWebhook(ev({ webhook_code: code }))).toEqual({ kind: "needs_sync" });
    },
  );

  it("an unknown TRANSACTIONS code → noop", () => {
    expect(classifyWebhook(ev({ webhook_code: "SOMETHING_NEW" }))).toMatchObject({ kind: "noop" });
  });

  it("ITEM/ERROR → login_required with the Plaid error_code", () => {
    expect(
      classifyWebhook(ev({ webhook_type: "ITEM", webhook_code: "ERROR", error: { error_code: "ITEM_LOGIN_REQUIRED" } })),
    ).toEqual({ kind: "set_status", status: "login_required", errorCode: "ITEM_LOGIN_REQUIRED" });
  });

  it("ITEM/LOGIN_REPAIRED → back to active", () => {
    expect(classifyWebhook(ev({ webhook_type: "ITEM", webhook_code: "LOGIN_REPAIRED" }))).toEqual({
      kind: "set_status",
      status: "active",
      errorCode: null,
    });
  });

  it.each(["PENDING_EXPIRATION", "PENDING_DISCONNECT"])("ITEM/%s → pending_expiration", (code) => {
    expect(classifyWebhook(ev({ webhook_type: "ITEM", webhook_code: code }))).toMatchObject({
      kind: "set_status",
      status: "pending_expiration",
    });
  });

  it.each(["USER_PERMISSION_REVOKED", "USER_ACCOUNT_REVOKED"])("ITEM/%s → revoked", (code) => {
    expect(classifyWebhook(ev({ webhook_type: "ITEM", webhook_code: code }))).toMatchObject({
      kind: "set_status",
      status: "revoked",
    });
  });

  it.each(["NEW_ACCOUNTS_AVAILABLE", "WEBHOOK_UPDATE_ACKNOWLEDGED"])("ITEM/%s → noop", (code) => {
    expect(classifyWebhook(ev({ webhook_type: "ITEM", webhook_code: code }))).toMatchObject({ kind: "noop" });
  });

  it("unrelated webhook types → noop", () => {
    expect(classifyWebhook(ev({ webhook_type: "AUTH", webhook_code: "AUTOMATICALLY_VERIFIED" }))).toMatchObject({
      kind: "noop",
    });
  });
});
