import type { Session } from "@supabase/supabase-js";
import { authFetch } from "../auth/api";
import { bool, obj } from "../api/parse";
import { apiRequest, type ApiResult } from "../api/request";

/**
 * The pull to refresh's bank check: `POST /api/mobile/plaid/refresh` asks the server to have Plaid look for new
 * transactions at the user's banks now. It is the ONLY trigger for Plaid's billed Transactions Refresh (owner decision
 * 2026-10-02); the server answers at once, throttles it to once per 24 hours per bank, and anything new arrives later
 * through its own webhook -> sync path. `scheduled: false` means bank connections are switched off on the deployment.
 */
export function parseBankRefresh(body: unknown): { scheduled: boolean } {
  return { scheduled: bool(obj(body, "bank refresh").scheduled, "bank refresh.scheduled") };
}

export function requestBankRefresh(session: Session | null): Promise<ApiResult<{ scheduled: boolean }>> {
  return apiRequest(() => authFetch("/api/mobile/plaid/refresh", session, { method: "POST" }), parseBankRefresh);
}

/**
 * The user's pull: asks for the bank refresh and re-reads the screen's data side by side, so the spinner never waits on
 * the bank and a failed refresh never stops the re-read (the user still sees the server's current data). A failed
 * refresh request is logged (its kind, status and code; never a token or body), not shown: the pull's own re-read
 * carries the screen's notice when the server can't be reached.
 */
export function pullWithBankRefresh(session: Session | null, refetch: () => void): void {
  void requestBankRefresh(session).then((result) => {
    if (!result.ok) {
      console.warn("[budgts] bank refresh request failed", { kind: result.kind, status: result.status, code: result.code });
    }
  });
  refetch();
}
