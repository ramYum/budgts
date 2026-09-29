import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Crawlers may read everything public. /company is not blocked: it is the homepage's own address, and a crawler must
 *  be able to read it to see its canonical (/). Signed-in pages need no rule: signed out they redirect to sign-in. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
