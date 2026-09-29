/** The public origin of this deployment (`NEXT_PUBLIC_SITE_URL`, else budgts.com), without a trailing slash: the base
 *  of the homepage's canonical and share URLs, robots.txt and the sitemap. */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.NEXT_PUBLIC_SITE_URL?.trim() || "https://budgts.com").replace(/\/+$/, "");
}
