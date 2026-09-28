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
 * Nothing calls this yet — V1 defines no Premium-gated feature. It exists so the first one is a one-line guard.
 */
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/get-request-user";
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
  const db = opts.db ?? (await (await import("./db")).getServerDb());
  const decision = await getPremiumDecision(db, user.id, opts.now);
  if (decision.hasPremium) return null;
  return NextResponse.json({ error: "premium_required", entitlement: decision.view }, { status: 402 });
}
