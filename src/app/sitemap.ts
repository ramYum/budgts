import type { MetadataRoute } from "next";
import { LEGAL_PAGES, legalPagesLive } from "@/lib/legal/config";
import { siteUrl } from "@/lib/site";

/** The public pages: the homepage at / and, once they are live (src/lib/legal/config.ts), the four legal pages. While
 *  the owner facts are unset those pages are 404s, so they are left out rather than listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: `${base}/` },
    ...(legalPagesLive() ? LEGAL_PAGES.map(({ path }) => ({ url: `${base}${path}` })) : []),
  ];
}
