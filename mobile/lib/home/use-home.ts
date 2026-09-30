import { authFetch } from "../auth/api";
import { useVersion } from "../api/invalidate";
import { loadResource } from "../api/load";
import { useResource } from "../api/use-resource";
import { parseMobileHome } from "./contract";

/** `GET /api/mobile/home`, for a browsed month (`YYYY-MM`) or, without one, the user's own current month. */
export const homePath = (month: string | null) => (month ? `/api/mobile/home?month=${month}` : "/api/mobile/home");

/**
 * Home's data: every figure computed by the server (`loadHome`, the web Home's own reads and math), validated against the
 * contract. A new month loads afresh (the skeleton, as the web's loading page); a save or a bank sync (`invalidate("home")`)
 * reloads in place (`useResource`'s version): the numbers stay until the new ones land; only the user's own pull shows the pull indicator, and a pull that fails keeps the numbers with
 * a `notice`.
 */
export function useHome(month: string | null) {
  const version = useVersion("home");
  const { state, notice, reload, refresh, refreshing } = useResource(
    `home:${month ?? "current"}`,
    (session) => loadResource(() => authFetch(homePath(month), session), parseMobileHome),
    { version },
  );
  return { state, notice, reload, pulling: refreshing, pull: refresh };
}
