import { useEffect, useState } from "react";
import { fetchLegalLive, settingsLegalLinks, type LegalLink } from "./legal";

/**
 * Settings' legal links: none until the web says its pages are live (`GET /api/legal`, asked once per mount), then the
 * three links. See lib/legal.ts.
 */
export function useLegalLinks(baseUrl: string | undefined): LegalLink[] {
  const [live, setLive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetchLegalLive(baseUrl).then((on) => {
      if (!cancelled) setLive(on);
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);
  return settingsLegalLinks(baseUrl, live);
}
