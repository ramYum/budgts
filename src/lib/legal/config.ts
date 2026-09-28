/**
 * The owner facts behind the public Privacy, Terms, Support and Delete-your-account pages, and the one switch that
 * turns those pages (and every link to them, on the web and in the apps) on.
 *
 * The pages state things only the owner can answer: who the seller is, where it is, how to reach it, how long billing
 * records are kept after an account is deleted, which law governs the terms, and the date the owner approved the
 * wording. Until EVERY fact is set and valid, the pages answer 404 and nothing links to them, so no visitor ever sees a
 * placeholder. Turning them on is configuration, not a code change: set the six variables below in the deployment
 * (Vercel project settings, per environment), then redeploy. The pages are prerendered at build time.
 *
 * Plain server configuration (none of it secret, all of it shown publicly once set), read only on the server.
 * Recorded in docs/deploy.md ("Legal pages") and .env.local.example.
 */

/** Where each fact comes from. `SUPPORT_EMAIL` is shared with the Support page's contact line. */
export const LEGAL_ENV = {
  entityName: "LEGAL_ENTITY_NAME",
  address: "LEGAL_ENTITY_ADDRESS",
  contactEmail: "SUPPORT_EMAIL",
  retentionYears: "LEGAL_RECORD_RETENTION_YEARS",
  governingLaw: "LEGAL_GOVERNING_LAW",
  effectiveDate: "LEGAL_EFFECTIVE_DATE",
} as const;

export type LegalFacts = {
  /** The seller's legal name, e.g. "Example Labs LLC". */
  entityName: string;
  /** Its postal address, one line. */
  address: string;
  /** Where privacy, support and deletion requests go. */
  contactEmail: string;
  /** Whole years that retained billing records are kept after an account is deleted (spec §12.4). */
  retentionYears: number;
  /** The jurisdiction whose law governs the Terms, e.g. "the State of Delaware, United States". */
  governingLaw: string;
  /** The day the owner approved the wording (YYYY-MM-DD): shown as "Effective". */
  effectiveDate: string;
};

type Env = Record<string, string | undefined>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(value: string): boolean {
  const m = DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

type Parsed = { [K in keyof LegalFacts]: LegalFacts[K] | null };

function parse(env: Env): Parsed {
  const text = (name: string) => {
    const v = env[name]?.trim();
    return v ? v : null;
  };
  const email = text(LEGAL_ENV.contactEmail);
  const years = text(LEGAL_ENV.retentionYears);
  const date = text(LEGAL_ENV.effectiveDate);
  return {
    entityName: text(LEGAL_ENV.entityName),
    address: text(LEGAL_ENV.address),
    contactEmail: email && EMAIL.test(email) ? email : null,
    retentionYears: years && /^\d{1,2}$/.test(years) && Number(years) >= 1 ? Number(years) : null,
    governingLaw: text(LEGAL_ENV.governingLaw),
    effectiveDate: date && isRealDate(date) ? date : null,
  };
}

/** The variable names still missing or invalid: empty once the pages can go live. */
export function missingLegalFacts(env: Env = process.env): string[] {
  const parsed = parse(env);
  return (Object.keys(LEGAL_ENV) as (keyof LegalFacts)[]).filter((k) => parsed[k] === null).map((k) => LEGAL_ENV[k]);
}

/** Every fact, or null while any is missing or invalid (the pages stay off). */
export function legalFacts(env: Env = process.env): LegalFacts | null {
  const parsed = parse(env);
  return Object.values(parsed).every((v) => v !== null) ? (parsed as LegalFacts) : null;
}

/** The switch: true only once every owner fact is set. */
export function legalPagesLive(env: Env = process.env): boolean {
  return legalFacts(env) !== null;
}

/** The public pages, one list for the web links, the proxy and the app. */
export const LEGAL_PAGES = [
  { path: "/privacy", label: "Privacy" },
  { path: "/terms", label: "Terms" },
  { path: "/support", label: "Support" },
  { path: "/account-deletion", label: "Delete your account" },
] as const;

/** "1 year" / "7 years". */
export function yearsLabel(n: number): string {
  return `${n} ${n === 1 ? "year" : "years"}`;
}

/** "September 28, 2026" from "2026-09-28", fixed to UTC so the server's zone never shifts the day. */
export function effectiveDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}
