import { apiRequest, type ApiFailure } from "../api/request";

/**
 * The response contract of `GET /api/mobile/profile` (server source of truth: `src/app/api/mobile/profile/route.ts`).
 * Mirrored and validated at runtime because `mobile/` cannot import server code. `supportedCurrencies` comes from the
 * server, so the picker can never offer a currency the server would reject.
 */
export type MobileProfile = {
  email: string | null;
  currency: string;
  onboarded: boolean;
  supportedCurrencies: string[];
};

export function parseProfile(body: unknown): MobileProfile {
  if (!body || typeof body !== "object") throw new Error("profile: not an object");
  const b = body as Record<string, unknown>;
  if (b.email !== null && typeof b.email !== "string") throw new Error("profile: email");
  if (typeof b.currency !== "string" || !b.currency) throw new Error("profile: currency");
  if (typeof b.onboarded !== "boolean") throw new Error("profile: onboarded");
  const list = b.supportedCurrencies;
  if (!Array.isArray(list) || list.length === 0 || !list.every((c) => typeof c === "string")) {
    throw new Error("profile: supportedCurrencies");
  }
  return { email: b.email as string | null, currency: b.currency, onboarded: b.onboarded, supportedCurrencies: list as string[] };
}

export type ProfileErrorKind = "auth" | "network" | "unavailable" | "contract" | "profile_missing";

const MESSAGES: Record<ProfileErrorKind, string> = {
  auth: "Your session has expired. Please sign in again.",
  network: "Couldn't reach Budgts. Check your connection and try again.",
  unavailable: "Budgts couldn't load your account right now. Please try again.",
  contract: "Budgts sent something this version of the app doesn't understand. Please update the app.",
  profile_missing: "We couldn't find your profile. Sign out, sign back in, and try again.",
};

export type ProfileState =
  | { status: "loading" }
  | { status: "ready"; profile: MobileProfile }
  | { status: "error"; kind: ProfileErrorKind; message: string };

const errorState = (kind: ProfileErrorKind): Extract<ProfileState, { status: "error" }> => ({
  status: "error",
  kind,
  message: MESSAGES[kind],
});

function kindOf(f: ApiFailure): ProfileErrorKind {
  if (f.kind === "rejected") return f.code === "profile_missing" ? "profile_missing" : "unavailable";
  return f.kind;
}

export async function loadProfile(fetcher: () => Promise<Response>): Promise<Exclude<ProfileState, { status: "loading" }>> {
  const r = await apiRequest(fetcher, parseProfile);
  return r.ok ? { status: "ready", profile: r.data } : errorState(kindOf(r));
}

export type SaveCurrencyResult =
  | { status: "saved" }
  /** Another device finished onboarding first — not a failure; the app reloads the profile. */
  | { status: "already_onboarded" }
  | { status: "error"; kind: ProfileErrorKind; message: string };

export async function saveCurrency(fetcher: () => Promise<Response>): Promise<SaveCurrencyResult> {
  const r = await apiRequest(fetcher, (b) => {
    if (!b || typeof b !== "object" || (b as { onboarded?: unknown }).onboarded !== true) throw new Error("onboarding: shape");
    return true;
  });
  if (r.ok) return { status: "saved" };
  if (r.kind === "rejected" && r.code === "already_onboarded") return { status: "already_onboarded" };
  const kind = kindOf(r);
  return { status: "error", kind, message: MESSAGES[kind] };
}
