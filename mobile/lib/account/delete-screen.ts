import type { DeleteOutcome } from "./delete-account";
import { emailLinkRedirect } from "../auth/sign-in-options";

/**
 * The Delete account screen's side of the web flow (src/components/account/delete-account-flow.tsx): its first state
 * from `GET /api/mobile/account/delete` (the web page's own `deletionScreenState`), the stage each deletion answer leads
 * to, the fresh sign-in, and the web's words. The endpoint (`POST /api/account/delete`, lib/account/delete-account.ts)
 * decides everything; this never deletes anything itself.
 *
 * The constants mirror src/lib/account/screen.ts and src/lib/billing/manage.ts, which Metro can't serve to the app (it
 * watches only the brand folders); delete-screen.test.ts pins them to the web's values, so they can't drift.
 */
export const CONFIRM_WORD = "DELETE";
export const REAUTH_WINDOW_MINUTES = 10;
export const APPLE_MANAGE_URL = "https://apps.apple.com/account/subscriptions";
export const GOOGLE_MANAGE_URL = "https://play.google.com/store/account/subscriptions?package=com.budgts.app";
export const DELETION_SUBSCRIPTION_NOTICE =
  "Deleting your Budgts account does not automatically cancel your App Store or Google Play subscription.";

/** The screen, as on the web: `/settings/delete-account`, and `?step=confirm` when a fresh sign-in returns to it. */
export const DELETE_ACCOUNT_PATH = "/settings/delete-account";
export const DELETE_ACCOUNT_CONFIRM_PATH = `${DELETE_ACCOUNT_PATH}?step=confirm`;

/** Compared case-insensitively, surrounding spaces ignored (web `confirmWordMatches`). */
export function confirmWordMatches(typed: string): boolean {
  return typed.trim().toUpperCase() === CONFIRM_WORD;
}

export type DeleteScreen = {
  email: string;
  /** signed in within the step-up window: confirm without a fresh sign-in */
  recent: boolean;
  /** Google is linked: offer it as a fresh sign-in too */
  google: boolean;
  /** a deletion already took the lock: the account is read-only until one finishes it */
  inProgress: boolean;
  /** shown on the errors only while the legal pages are live */
  supportEmail: string | null;
  /** this deployment sells subscriptions: say deleting doesn't cancel one */
  billing: boolean;
  /** a record outlives the account (billing records) */
  keepsRecords: boolean;
};

export function parseDeleteScreen(body: unknown): DeleteScreen {
  if (!body || typeof body !== "object") throw new Error("delete screen: not an object");
  const b = body as Record<string, unknown>;
  if (b.version !== 1) throw new Error("delete screen: version");
  const flag = (key: string): boolean => {
    if (typeof b[key] !== "boolean") throw new Error(`delete screen: ${key}`);
    return b[key] as boolean;
  };
  if (typeof b.email !== "string") throw new Error("delete screen: email");
  if (b.supportEmail !== null && typeof b.supportEmail !== "string") throw new Error("delete screen: supportEmail");
  return {
    email: b.email,
    recent: flag("recent"),
    google: flag("google"),
    inProgress: flag("inProgress"),
    supportEmail: (b.supportEmail as string | null) || null,
    billing: flag("billing"),
    keepsRecords: flag("keepsRecords"),
  };
}

export type FlowStage = "intro" | "reauth" | "confirm" | "deleting" | "error" | "signed_out";
export type ErrorKind = "incomplete" | "plaid" | "unavailable" | "uncertain" | "network" | "failed";

/** The first stage: the explanation, or, returning from a fresh sign-in, the confirm step (a fresh sign-in if stale). */
export function firstStage(step: "intro" | "confirm", recent: boolean): FlowStage {
  return step === "confirm" ? (recent ? "confirm" : "reauth") : "intro";
}

/** Where a deletion answer that isn't "deleted" leads, each with its way out. */
export function stageAfter(outcome: Exclude<DeleteOutcome, { status: "deleted" }>): { stage: FlowStage; error?: ErrorKind; stale?: true } {
  switch (outcome.status) {
    case "reauth_required":
      return { stage: "reauth", stale: true };
    case "auth":
      return { stage: "signed_out" };
    default:
      return { stage: "error", error: outcome.status };
  }
}

/** Where a completed deletion lands, signed out: `?store=1` when a store subscription may still be running. */
export function deletedDestination(storeSubscriptionMayBeActive: boolean): string {
  return storeSubscriptionMayBeActive ? "/account-deleted?store=1" : "/account-deleted";
}

export const STAGE_TITLE: Record<Exclude<FlowStage, "error">, string> = {
  intro: "Before you go",
  reauth: "Confirm it's you",
  confirm: "Last step",
  deleting: "Deleting your account",
  signed_out: "You've been signed out",
};

export const ERROR_COPY: Record<ErrorKind, { title: string; body: string }> = {
  incomplete: {
    title: "Deletion didn't finish",
    body: "We started deleting your account but couldn't finish. It's read-only until it does. Try again to finish it.",
  },
  plaid: {
    title: "A bank wouldn't disconnect",
    body: "We couldn't disconnect one of your banks, so your account wasn't deleted. Disconnect it in Connected banks, then try again.",
  },
  unavailable: {
    title: "Deletion is unavailable",
    body: "Account deletion is temporarily unavailable, and nothing was changed. Try again in a few minutes.",
  },
  uncertain: {
    title: "We couldn't confirm it",
    body: "We didn't get a clear answer from Budgts, so your account may or may not be deleted. Try again: if deletion had already started, trying again finishes it.",
  },
  network: {
    title: "Couldn't reach Budgts",
    body: "Check your connection and try again. If deletion had already started, trying again finishes it.",
  },
  failed: {
    title: "Something went wrong",
    body: "Your account wasn't deleted. Try again.",
  },
};

export type ReauthLinkResult = { sent: true } | { sent: false; error: string };

type OtpArgs = { email: string; options: { shouldCreateUser: false; emailRedirectTo: string } };

/**
 * The fresh sign-in by email (web `requestReauthLink`): a sign-in link to the account's own address, never creating a
 * user, landing on the app's email hand-off page. The web's two messages.
 */
export async function requestReauthLink(
  email: string,
  deps: { apiBaseUrl: string | undefined; signInWithOtp(args: OtpArgs): Promise<{ error: { status?: number } | null }> },
): Promise<ReauthLinkResult> {
  const failed: ReauthLinkResult = { sent: false, error: "We couldn't send the link. Try again in a moment." };
  if (!email) return { sent: false, error: "You're signed out. Sign in again to continue." };
  try {
    const { error } = await deps.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: emailLinkRedirect(deps.apiBaseUrl) },
    });
    if (!error) return { sent: true };
    return error.status === 429 ? { sent: false, error: "A link was sent a moment ago. Wait a minute, then try again." } : failed;
  } catch {
    return failed;
  }
}

/**
 * Where the app goes once a sign-in link's sign-in completes (app/auth/callback.tsx): back to the deletion screen, as
 * the web's link does with `next`. The app's hand-off page passes on only the link's code, so the intent waits here, on
 * this device, for the hour a sign-in link lasts. It is taken once, and only by the account that left it: anyone else
 * signing in on this phone lands on Home.
 */
const RETURN_TTL_MS = 60 * 60 * 1000;
let pendingReturn: { path: string; userId: string; at: number } | null = null;

export function returnAfterSignIn(path: string, userId: string, now: number = Date.now()): void {
  pendingReturn = { path, userId, at: now };
}

export function takeReturnAfterSignIn(userId: string, now: number = Date.now()): string | null {
  const p = pendingReturn;
  pendingReturn = null;
  return p && p.userId === userId && now - p.at <= RETURN_TTL_MS ? p.path : null;
}
