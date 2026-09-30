import type { Session } from "@supabase/supabase-js";
import { authFetch } from "../auth/api";
import { apiRequest, jsonInit } from "../api/request";
import { parseUnmapped } from "./banks-api";
import type { ConnectDeps, ReconnectDeps } from "./link-flow";
import type { MapEntry } from "./mapping";

/**
 * The Connected banks commands, over the server's own Plaid commands (`/api/mobile/plaid/*`, `/api/plaid/*`): the
 * native side of the web's Plaid Server Actions (`src/server/plaid/actions.ts`). Nothing here decides anything about
 * money or sync; each call reports one of two outcomes a sheet or a row can show. A server `warning` is the web's own
 * text (the work succeeded, a sync did not finish); failures are fixed sentences, never server or network text.
 */
export type CommandOutcome = { status: "ok"; warning?: string } | { status: "error"; message: string };

const NETWORK = "Couldn't reach Budgts. Check your connection and try again.";
const SESSION = "Your session has expired. Please sign in again.";
const LOCKED = "Your account is being deleted, so changes are paused.";

type Messages = { failed: string; missing: string; conflict?: string };

function parseWarning(body: unknown): string | undefined {
  const w = body && typeof body === "object" ? (body as { warning?: unknown }).warning : undefined;
  return typeof w === "string" && w ? w : undefined;
}

export async function runCommand(fetcher: () => Promise<Response>, m: Messages): Promise<CommandOutcome> {
  const r = await apiRequest(fetcher, parseWarning);
  if (r.ok) return r.data ? { status: "ok", warning: r.data } : { status: "ok" };
  if (r.kind === "auth") return { status: "error", message: SESSION };
  if (r.kind === "network") return { status: "error", message: NETWORK };
  if (r.status === 423) return { status: "error", message: LOCKED };
  if (r.status === 404) return { status: "error", message: m.missing };
  if (r.status === 409 && m.conflict) return { status: "error", message: m.conflict };
  // an `invalid` reply carries the web's own sentence for it (mapAccounts: "Choose which Budgts account…")
  if (r.code === "invalid" && r.fieldErrors?.form) return { status: "error", message: r.fieldErrors.form };
  return { status: "error", message: m.failed };
}

export type BankCommands = ReturnType<typeof bankCommands>;

/** Every command the Connected banks screen, the mapping sheet and Connect a bank run, bound to the signed-in session. */
export function bankCommands(session: Session | null) {
  const send = (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => () =>
    authFetch(path, session, body === undefined ? { method } : jsonInit(method, body));

  return {
    /** "Import transactions" (web `mapAccounts`): saves the choices and runs the first sync. */
    mapAccounts: (plaidItemId: string, entries: MapEntry[]) =>
      runCommand(send("/api/mobile/plaid/accounts/map", "POST", { plaidItemId, entries }), {
        failed: "Could not save the account mapping. Try again.",
        missing: "That bank connection no longer exists. Try connecting again.",
      }),
    /** The import switch (web `setAccountImportingAction`): pause or resume one mapped account. */
    setImporting: (rowId: string, importing: boolean) =>
      runCommand(send(`/api/mobile/plaid/accounts/${rowId}/importing`, "PATCH", { importing }), {
        failed: "Could not update the import setting. Try again.",
        missing: "That account no longer exists.",
      }),
    /** "Exclude from totals" / "Include again" (web `setAccountCalculationExclusionAction`). */
    setExcluded: (rowId: string, excluded: boolean) =>
      runCommand(send(`/api/mobile/plaid/accounts/${rowId}/exclude`, "PATCH", { excluded }), {
        failed: "Something went wrong. Refresh and try again.",
        missing: "That account no longer exists.",
        conflict: "Only an account currently flagged for review can be excluded from totals.",
      }),
    /** "Mark reviewed" (web `clearAccountReview`). */
    clearReview: (rowId: string) =>
      runCommand(send(`/api/mobile/plaid/accounts/${rowId}/review`, "DELETE"), {
        failed: "Could not update the review status. Try again.",
        missing: "That account no longer exists.",
      }),
    /** "Sync now" (web `syncConnection`), by Plaid's item id. */
    sync: (itemId: string) =>
      runCommand(send("/api/mobile/plaid/sync", "POST", { itemId }), {
        failed: "The sync didn't finish. Try again in a moment.",
        missing: "That bank connection no longer exists.",
      }),
    /** Disconnect (web `disconnectBank`): stops syncing; `purge` also deletes the transactions it imported. */
    disconnect: (itemId: string, purge: boolean) =>
      runCommand(send("/api/plaid/item", "DELETE", { itemId, purge }), {
        failed: "Couldn't disconnect this bank. Try again.",
        missing: "That bank is already disconnected.",
      }),
  };
}

type LinkPorts = Pick<ConnectDeps, "fetchLinkToken" | "exchange"> & Pick<ReconnectDeps, "sync">;

/** The server half of native Plaid Link (`link-flow.ts`): mint a token, exchange the public token, sync after a reconnect. */
export function linkPorts(session: Session | null): LinkPorts {
  const commands = bankCommands(session);
  return {
    fetchLinkToken: async (body) => {
      const r = await apiRequest(
        () => authFetch("/api/plaid/link-token", session, jsonInit("POST", body)),
        (b) => {
          const token = b && typeof b === "object" ? (b as { link_token?: unknown }).link_token : undefined;
          if (typeof token !== "string" || !token) throw new Error("link_token");
          return token;
        },
      );
      return r.ok
        ? { status: "ok", linkToken: r.data }
        : { status: "error", message: body.itemId ? "Couldn't start the reconnect. Try again." : "Couldn't start the bank connection. Try again." };
    },
    exchange: async (publicToken, institution) => {
      const r = await apiRequest(
        () =>
          authFetch(
            "/api/plaid/exchange",
            session,
            jsonInit("POST", {
              public_token: publicToken,
              ...(institution ? { institution: { institution_id: institution.id, name: institution.name } } : {}),
            }),
          ),
        (b) => {
          const o = b as { plaidItemId?: unknown; accounts?: unknown };
          if (typeof o?.plaidItemId !== "string" || !Array.isArray(o.accounts)) throw new Error("exchange");
          return { plaidItemId: o.plaidItemId, accounts: o.accounts.map(parseUnmapped) };
        },
      );
      if (r.ok) return { status: "ok", ...r.data };
      if (r.status === 409 && r.code === "already-linked") return { status: "already_linked" };
      return { status: "error", message: "Couldn't finish connecting the bank. Try again." };
    },
    sync: async (itemId) => {
      const out = await commands.sync(itemId);
      return out.status === "ok" ? { status: "ok" } : { status: "error", message: out.message };
    },
  };
}
