import { NotAuthenticatedError } from "../auth/api";
import { parseEntitlementResponse, parseRefreshResponse, type EntitlementView, type RefreshStatus } from "./contract";

export type EntitlementErrorKind = "auth" | "unavailable" | "network" | "contract";

export type EntitlementLoad =
  | { status: "ready"; entitlement: EntitlementView }
  | { status: "error"; kind: EntitlementErrorKind; message: string };

export type RefreshResult =
  | { status: "ok"; refresh: RefreshStatus; entitlement: EntitlementView }
  | { status: "error"; kind: EntitlementErrorKind; message: string };

const MESSAGES: Record<EntitlementErrorKind, string> = {
  auth: "Your session has expired. Please sign in again.",
  unavailable: "Budgts couldn't check your subscription right now. Please try again.",
  network: "Couldn't reach Budgts. Check your connection and try again.",
  contract: "Budgts sent something this version of the app doesn't understand. Please update the app.",
};

const fail = (kind: EntitlementErrorKind): { status: "error"; kind: EntitlementErrorKind; message: string } => ({ status: "error", kind, message: MESSAGES[kind] });

/** Runs a request and maps every outcome to a state the UI can render. Never throws; never exposes raw error text. */
async function run<T>(fetcher: () => Promise<Response>, parse: (body: unknown) => T): Promise<{ ok: true; value: T } | ReturnType<typeof fail>> {
  let response: Response;
  try {
    response = await fetcher();
  } catch (err) {
    return err instanceof NotAuthenticatedError ? fail("auth") : fail("network");
  }
  if (response.status === 401) return fail("auth");
  if (!response.ok) return fail("unavailable");
  try {
    return { ok: true, value: parse(await response.json()) };
  } catch {
    return fail("contract");
  }
}

/** `GET /api/billing/entitlement`. */
export async function loadEntitlement(fetcher: () => Promise<Response>): Promise<EntitlementLoad> {
  const r = await run(fetcher, parseEntitlementResponse);
  return "ok" in r ? { status: "ready", entitlement: r.value } : r;
}

/** `POST /api/billing/entitlement/refresh`: ask the SERVER to reconcile with the billing provider and return its verdict. */
export async function refreshEntitlement(fetcher: () => Promise<Response>): Promise<RefreshResult> {
  const r = await run(fetcher, parseRefreshResponse);
  return "ok" in r ? { status: "ok", refresh: r.value.status, entitlement: r.value.entitlement } : r;
}
