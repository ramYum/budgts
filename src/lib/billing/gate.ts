/**
 * The server-authoritative PREMIUM GATE. A feature that must be Premium-only asks one question of one place:
 *
 *   const denied = await requirePremium(request);   // Response | null
 *   if (denied) return denied;
 *
 * The answer is derived from the authenticated user's entitlement row (via `hasPremium`), never from React state,
 * AsyncStorage, a purchase-success screen, or a client-supplied flag or user id. No feature imports anything
 * RevenueCat-, Apple- or Google-specific: they see only "premium or not".
 *
 * Bank connect and refresh are the first Premium-gated feature (owner decision 2026-10-02): see
 * `requireBankSyncAccess` below, the one gate every bank-connect and refresh entry point calls.
 */
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/get-request-user";
import { billingProviderConfigured, loadBillingConfig, type BillingConfig } from "./config";
import type { Db } from "./db";
import { hasPremium, toEntitlementView, type EntitlementView } from "./entitlement";
import { loadEntitlement } from "./store";

export interface PremiumDecision {
  hasPremium: boolean;
  view: EntitlementView;
}

/** Does THIS user (already authenticated by the caller) currently have Premium? */
export async function getPremiumDecision(db: Db, userId: string, now: Date = new Date()): Promise<PremiumDecision> {
  const e = await loadEntitlement(db, userId);
  return { hasPremium: hasPremium(e, now), view: toEntitlementView(e, now) };
}

/**
 * Route-level guard. Returns a Response to send when access must be refused, or null when the caller has Premium.
 * 401 = not signed in; 402 = signed in but no active entitlement (the body carries the view-model so the client can
 * show the right offer).
 */
export async function requirePremium(request: Request, opts: { db?: Db; now?: Date } = {}): Promise<Response | null> {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return premiumRefusal(user.id, opts);
}

/** The 402 for a user the caller has already authenticated, or null when they have Premium. */
async function premiumRefusal(userId: string, opts: { db?: Db; now?: Date }): Promise<Response | null> {
  const db = opts.db ?? (await (await import("./db")).getServerDb());
  const decision = await getPremiumDecision(db, userId, opts.now);
  if (decision.hasPremium) return null;
  return NextResponse.json(
    { error: "premium_required", entitlement: decision.view },
    { status: 402, headers: { "Cache-Control": "private, no-store" } },
  );
}

/**
 * THE BANK-SYNC GATE (owner decision 2026-10-02): connecting a bank (a new Link token or the exchange), reconnecting
 * one (an update-mode Link token) and the native pull's Transactions Refresh need Premium. Otherwise a lapsed user
 * could reconnect for free, the lapse sweep would remove the bank again a week later, and every cycle would cost a
 * Plaid charge.
 *
 * Switched by the SAME configuration as the lapse sweep (`billingProviderConfigured`): until billing is configured
 * nobody can subscribe, so a gate would only lock everyone out, and this answers null without touching the database.
 * Once it is, a user without Premium gets 402 `premium_required` with the entitlement view. Existing syncs and the
 * Plaid webhooks are NOT gated here.
 *
 * `userId` must come from the caller's verified session or Bearer token, never from the request body.
 */
export async function requireBankSyncAccess(
  userId: string,
  opts: { config?: BillingConfig; db?: Db; now?: Date } = {},
): Promise<Response | null> {
  if (!billingProviderConfigured(opts.config ?? loadBillingConfig())) return null;
  return premiumRefusal(userId, opts);
}
