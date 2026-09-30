import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "../auth/api";
import { useVersion } from "../api/invalidate";
import { loadResource } from "../api/load";
import { useResource } from "../api/use-resource";
import { parseMobileHome } from "./contract";

/** `GET /api/mobile/home`, for a browsed month (`YYYY-MM`) or, without one, the user's own current month. */
export const homePath = (month: string | null) => (month ? `/api/mobile/home?month=${month}` : "/api/mobile/home");

/**
 * Home's data: every figure computed by the server (`loadHome`, the web Home's own reads and math), validated against the
 * contract. A new month loads afresh (the skeleton, as the web's navigation shows its loading screen). A save or a bank
 * sync (`invalidate("home")`) reloads in place, the numbers staying on screen until the new ones land, as the web's
 * `router.refresh()` does; only the user's own pull shows the pull indicator.
 */
export function useHome(month: string | null) {
  const resource = useResource(`home:${month ?? "current"}`, (session) =>
    loadResource(() => authFetch(homePath(month), session), parseMobileHome),
  );
  const { refresh } = resource;

  const version = useVersion("home");
  const seen = useRef(version);
  useEffect(() => {
    if (version === seen.current) return;
    seen.current = version;
    void refresh();
  }, [version, refresh]);

  const [pulling, setPulling] = useState(false);
  const pull = useCallback(async () => {
    setPulling(true);
    try {
      await refresh();
    } finally {
      setPulling(false);
    }
  }, [refresh]);

  return { state: resource.state, notice: resource.notice, reload: resource.reload, pulling, pull };
}
