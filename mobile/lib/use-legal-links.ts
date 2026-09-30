import { useEffect, useState } from "react";
import { fetchLegalLive, legalLinks, type LegalLink } from "./legal";

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

/** About's legal rows: none until the pages are live, then the three links. */
export function useLegalLinks(baseUrl: string | undefined): LegalLink[] {
  return legalLinks(baseUrl, useLegalLive(baseUrl));
}
