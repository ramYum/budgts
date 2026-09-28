/**
 * Hosted legal / support pages the app links to (store requirement: privacy policy, terms, support and an account-deletion
 * path). They live on budgts.com, beside the web app (docs/specs/2026-09-17-mobile-app-launch-design.md); the paths must
 * match the web routes Phase 1 builds.
 *
 * Those pages do not exist yet, so the links are hidden: a tap would dead-end on a 404 or the sign-in page. Phase 1 builds
 * the pages (public in `src/proxy.ts`), then sets `LEGAL_PAGES_LIVE` to true. Recorded in mobile/README.md and
 * docs/superpowers/plans/2026-09-27-stage0-port.md.
 */
export const LEGAL_PAGES_LIVE = false;

export const LEGAL_PATHS = {
  privacy: "/privacy",
  terms: "/terms",
  support: "/support",
  accountDeletion: "/account-deletion",
} as const;

export type LegalPage = keyof typeof LEGAL_PATHS;

/** The page's absolute URL, or null when the backend base URL is not configured — never a broken link. */
export function legalUrl(baseUrl: string | undefined, page: LegalPage): string | null {
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, "")}${LEGAL_PATHS[page]}`;
}

export type LegalLink = { page: LegalPage; label: string; testID: string; url: string };

const SETTINGS_LINKS: { page: LegalPage; label: string; testID: string }[] = [
  { page: "privacy", label: "Privacy Policy", testID: "settings-privacy" },
  { page: "terms", label: "Terms of Service", testID: "settings-terms" },
  { page: "support", label: "Help & support", testID: "settings-support" },
];

/** The links Settings shows: none until the pages are live, and never one without a configured base URL. */
export function settingsLegalLinks(baseUrl: string | undefined, live: boolean = LEGAL_PAGES_LIVE): LegalLink[] {
  if (!live) return [];
  return SETTINGS_LINKS.flatMap((l) => {
    const url = legalUrl(baseUrl, l.page);
    return url ? [{ ...l, url }] : [];
  });
}
