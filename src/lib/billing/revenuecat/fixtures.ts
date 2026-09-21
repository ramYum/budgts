/**
 * Test support: RevenueCat webhook bodies shaped exactly like RevenueCat's documented event object
 * ("Event types and fields"), and a helper that runs one through the real mapper. Synthetic data only.
 * Not imported by production code.
 */
import { mapRevenueCatEvent, type MappedRevenueCatEvent } from "./map";

export const T0 = Date.parse("2026-10-01T12:00:00Z");
export const DAY = 86_400_000;

/** A monthly App Store subscription's INITIAL_PURCHASE (a real $9.99 charge), with any field overridden. */
export function rcBody(userId: string, event: Record<string, unknown> = {}) {
  return {
    api_version: "1.0",
    event: {
      id: `evt-${crypto.randomUUID()}`,
      type: "INITIAL_PURCHASE",
      app_user_id: userId,
      original_app_user_id: "$RCAnonymousID:synthetic",
      aliases: ["$RCAnonymousID:synthetic", userId],
      app_id: "app_synthetic",
      environment: "PRODUCTION",
      event_timestamp_ms: T0,
      store: "APP_STORE",
      product_id: "budgts_monthly",
      period_type: "NORMAL",
      purchased_at_ms: T0,
      expiration_at_ms: T0 + 30 * DAY,
      price: 9.99,
      price_in_purchased_currency: 9.99,
      currency: "USD",
      transaction_id: `tx-${crypto.randomUUID()}`,
      original_transaction_id: "otx-synthetic-1",
      country_code: "US",
      subscriber_attributes: { $email: { value: "synthetic@example.com", updated_at_ms: T0 } },
      ...event,
    },
  };
}

/** Runs a fixture through the real mapper (throws if the payload is rejected). */
export function mapped(userId: string, event: Record<string, unknown> = {}): MappedRevenueCatEvent {
  const r = mapRevenueCatEvent(rcBody(userId, event));
  if (!r.ok) throw new Error(r.reason);
  return r.event;
}

/** A free-trial start: access with NO charge. */
export const trialEvent = (userId: string, at = T0, extra: Record<string, unknown> = {}) =>
  mapped(userId, { period_type: "TRIAL", price: 0, price_in_purchased_currency: 0, event_timestamp_ms: at, purchased_at_ms: at, expiration_at_ms: at + 14 * DAY, ...extra });

/** The trial's automatic conversion: a real charge. */
export const conversionEvent = (userId: string, at = T0 + 14 * DAY, extra: Record<string, unknown> = {}) =>
  mapped(userId, { type: "RENEWAL", is_trial_conversion: true, event_timestamp_ms: at, purchased_at_ms: at, expiration_at_ms: at + 30 * DAY, ...extra });
