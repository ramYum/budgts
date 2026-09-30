/**
 * Hosted legal / support pages the app links to (store requirement: privacy policy, terms, support and an account-deletion
 * path). They live on budgts.com, beside the web app (docs/specs/2026-09-17-mobile-app-launch-design.md).
 *
 * The web decides whether they exist: each page is a 404 until the owner facts behind it are set
 * (src/lib/legal/config.ts), and `GET /api/legal` says whether they are live. The app asks once and shows the links only
 * on a `live: true` answer, so the web's switch is the one switch: filling in the facts turns the app's links on too,
 * without an app release, and the app never links to a page that isn't there.
 */

export const LEGAL_PATHS = {
  privacy: "/privacy",
  terms: "/terms",
  support: "/support",
  accountDeletion: "/account-deletion",
} as const;

export type LegalPage = keyof typeof LEGAL_PATHS;

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** The page's absolute URL, or null when the backend base URL is not configured — never a broken link. */
export function legalUrl(baseUrl: string | undefined, page: LegalPage): string | null {
  if (!baseUrl) return null;
  return `${trimBase(baseUrl)}${LEGAL_PATHS[page]}`;
}

/**
 * Whether the web's legal pages are live. Only an explicit `live: true` counts: no base URL, a network failure or any
 * other answer means no links (a tap must never land on a 404).
 */
export async function fetchLegalLive(
  baseUrl: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!baseUrl) return false;
  try {
    const res = await fetchImpl(`${trimBase(baseUrl)}/api/legal`);
    if (!res.ok) return false;
    const body = (await res.json()) as { live?: unknown };
    return body.live === true;
  } catch {
    return false;
  }
}

export type LegalLink = { page: LegalPage; label: string; icon: "document" | "mail"; testID: string; url: string };

/** About's Legal rows, as the web's About page lists them (src/app/(app)/(dashboard)/about/page.tsx). */
const ABOUT_LINKS: Omit<LegalLink, "url">[] = [
  { page: "privacy", label: "Privacy policy", icon: "document", testID: "hub-privacy" },
  { page: "terms", label: "Terms of service", icon: "document", testID: "hub-terms" },
  { page: "support", label: "Support", icon: "mail", testID: "hub-support" },
];

/** The legal rows About shows: none until the pages are live, and never one without a configured base URL. */
export function legalLinks(baseUrl: string | undefined, live: boolean): LegalLink[] {
  if (!live) return [];
  return ABOUT_LINKS.flatMap((l) => {
    const url = legalUrl(baseUrl, l.page);
    return url ? [{ ...l, url }] : [];
  });
}
