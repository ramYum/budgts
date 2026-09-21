/**
 * Hosted legal / support pages the app links to (store requirement: privacy policy, terms, support and an account-deletion
 * path). They live on the Budgts web/server layer, which is kept after the web UI retires
 * (docs/specs/2026-09-21-mobile-only-transition-design.md §5); the paths must match `src/app/(legal)/`.
 */
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
