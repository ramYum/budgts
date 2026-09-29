import { useEffect, useState } from "react";
import { fetchLegalLive, settingsLegalLinks, type LegalLink } from "./legal";

/** Whether the web says its legal pages are live (`GET /api/legal`, asked once per mount). See lib/legal.ts. */
export function useLegalLive(baseUrl: string | undefined): boolean {
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
  return live;
}

/** Settings' legal links: none until the pages are live, then the three links. */
export function useLegalLinks(baseUrl: string | undefined): LegalLink[] {
  return settingsLegalLinks(baseUrl, useLegalLive(baseUrl));
}
