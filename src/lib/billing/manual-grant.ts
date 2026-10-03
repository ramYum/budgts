/**
 * The PERMANENT MANUAL GRANT: Premium given by hand, outside any store (launch spec §9: "The owner's existing accounts
 * are grandfathered by a manual entitlement grant, recorded as such"). The representation and why no provider can
 * change it are in entitlement.ts (`MANUAL_GRANT_PROVIDER`). Only the operator tool (tools/billing/grant.ts) calls this.
 *
 * Every write is one transaction holding the entitlement row lock, with its audit record (a `billing_events` row:
 * provider 'manual', who, when, why) committed alongside, so a grant never exists without its record. Re-granting a
 * granted user changes nothing and writes nothing.
 */
import type { Db } from "./db";
import {
  MANUAL_GRANT_ACCESS_UNTIL,
  MANUAL_GRANT_PROVIDER,
  emptyEntitlement,
  hasPremium,
  isManualGrant,
  type Entitlement,
  type EntitlementFields,
} from "./entitlement";
import { accountIsDeleting, entitlementFromRow, finishEvent, lockEntitlement, recordEvent, saveEntitlement } from "./store";

export type GrantPlan =
  | { kind: "grant"; next: EntitlementFields }
  | { kind: "already_granted" }
  | { kind: "refused"; reason: string };

export type RevokePlan = { kind: "revoke"; next: EntitlementFields } | { kind: "not_granted" };

/** What a grant would do to this entitlement (null: the user has no row). Pure. */
export function planGrant(current: EntitlementFields | null, now: Date): GrantPlan {
  if (current && isManualGrant(current) && hasPremium(current, now) && current.accessUntil?.getTime() === MANUAL_GRANT_ACCESS_UNTIL.getTime()) {
    return { kind: "already_granted" };
  }
  // A live store subscription is the store's: overwriting it would hide a real, renewing purchase.
  if (current && !isManualGrant(current) && hasPremium(current, now)) {
    return { kind: "refused", reason: "has a live store subscription; a grant would overwrite it" };
  }
  return {
    kind: "grant",
    next: {
      ...(current ?? emptyEntitlement()),
      state: "active",
      provider: MANUAL_GRANT_PROVIDER,
      store: null,
      productId: null,
      providerCustomerId: null,
      willRenew: false,
      accessUntil: MANUAL_GRANT_ACCESS_UNTIL,
      renewalPriceAmount: null,
      renewalPriceCurrency: null,
    },
  };
}

/**
 * What revoking would do. Access ends now and the row is handed back to the providers (provider null), so a later
 * purchase applies normally. Being an ended entitlement, it is then subject to the lapse sweep like any other.
 */
export function planRevoke(current: EntitlementFields | null, now: Date): RevokePlan {
  if (!current || !isManualGrant(current)) return { kind: "not_granted" };
  return { kind: "revoke", next: { ...current, state: "expired", provider: null, willRenew: false, accessUntil: now } };
}

export interface GrantAudit {
  reason: string;
  /** Who ran the grant (the operator), recorded in the audit row. */
  grantedBy: string;
  /** The billing_events environment of the target database. */
  environment: "production" | "sandbox";
  now: Date;
}

export interface GrantTarget {
  email: string;
  /** Null when no account has this email. */
  userId: string | null;
  /** More than one account matched (never acted on). */
  ambiguous: boolean;
  deleting: boolean;
  current: Entitlement | null;
}

/** Resolves each email to its account and current entitlement. Read-only. */
export async function inspectGrantTargets(db: Db, emails: string[]): Promise<GrantTarget[]> {
  const out: GrantTarget[] = [];
  for (const email of emails) {
    const users = await db.query<{ id: string }>(`select id from auth.users where lower(email) = lower($1)`, [email]);
    if (users.length !== 1) {
      out.push({ email, userId: null, ambiguous: users.length > 1, deleting: false, current: null });
      continue;
    }
    const userId = users[0].id;
    const [row] = await db.query<Parameters<typeof entitlementFromRow>[0]>(`select * from entitlements where user_id = $1`, [userId]);
    out.push({ email, userId, ambiguous: false, deleting: await accountIsDeleting(db, userId), current: row ? entitlementFromRow(row) : null });
  }
  return out;
}

const strip = (e: Entitlement): EntitlementFields => {
  const { userId: _u, ...fields } = e;
  void _u;
  return fields;
};

async function audit(tx: Db, userId: string, a: GrantAudit, eventType: string, internalType: string, previous: EntitlementFields | null) {
  const rec = await recordEvent(tx, {
    provider: MANUAL_GRANT_PROVIDER,
    providerEventId: `${internalType}:${userId}:${a.now.toISOString()}`,
    eventType,
    userId,
    appUserId: null,
    environment: a.environment,
    occurredAt: a.now,
    payload: {
      reason: a.reason,
      granted_by: a.grantedBy,
      access_until: eventType === "MANUAL_GRANT" ? MANUAL_GRANT_ACCESS_UNTIL.toISOString() : a.now.toISOString(),
      previous: previous ? { state: previous.state, provider: previous.provider, access_until: previous.accessUntil?.toISOString() ?? null } : null,
    },
  });
  await finishEvent(tx, rec.id, { status: "processed", internalType });
}

/** A refusal found under the lock: thrown so the transaction rolls back (including an empty row it may have made). */
class GrantRefused extends Error {}

export type GrantOutcome = { outcome: "granted" } | { outcome: "already_granted" } | { outcome: "refused"; reason: string };

/** Grants permanent Premium to one user, under the row lock, with its audit row. Idempotent. */
export async function applyManualGrant(db: Db, userId: string, a: GrantAudit): Promise<GrantOutcome> {
  return db.transaction(async (tx): Promise<GrantOutcome> => {
    if (await accountIsDeleting(tx, userId)) return { outcome: "refused", reason: "account deletion has started" };
    const [existed] = await tx.query<{ e: boolean }>(`select exists (select 1 from entitlements where user_id = $1) as e`, [userId]);
    const current = strip(await lockEntitlement(tx, userId));
    const plan = planGrant(existed.e ? current : null, a.now);
    if (plan.kind === "already_granted") return { outcome: "already_granted" };
    if (plan.kind === "refused") throw new GrantRefused(plan.reason);
    await saveEntitlement(tx, userId, plan.next);
    await audit(tx, userId, a, "MANUAL_GRANT", "manual_grant", existed.e ? current : null);
    return { outcome: "granted" };
  }).catch((err: unknown): GrantOutcome => {
    if (err instanceof GrantRefused) return { outcome: "refused", reason: err.message };
    throw err;
  });
}

export type RevokeOutcome = { outcome: "revoked" } | { outcome: "not_granted" };

/** Ends one user's manual grant now, with its audit row. A user without a grant is left exactly as is. */
export async function revokeManualGrant(db: Db, userId: string, a: GrantAudit): Promise<RevokeOutcome> {
  return db.transaction(async (tx): Promise<RevokeOutcome> => {
    const [row] = await tx.query<Parameters<typeof entitlementFromRow>[0]>(`select * from entitlements where user_id = $1 for update`, [userId]);
    const current = row ? strip(entitlementFromRow(row)) : null;
    const plan = planRevoke(current, a.now);
    if (plan.kind === "not_granted") return { outcome: "not_granted" };
    await saveEntitlement(tx, userId, plan.next);
    await audit(tx, userId, a, "MANUAL_GRANT_REVOKED", "manual_grant_revoked", current);
    return { outcome: "revoked" };
  });
}
