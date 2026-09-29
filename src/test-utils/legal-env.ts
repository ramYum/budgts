/** A complete, obviously fictional set of the legal owner facts (src/lib/legal/config.ts), for tests only. */
export const FULL_LEGAL_ENV = {
  LEGAL_ENTITY_NAME: "Example Labs LLC",
  LEGAL_ENTITY_ADDRESS: "1 Main Street, Springfield, DE 19901, United States",
  SUPPORT_EMAIL: "help@example.com",
  LEGAL_RECORD_RETENTION_YEARS: "7",
  LEGAL_GOVERNING_LAW: "the State of Delaware, United States",
  LEGAL_EFFECTIVE_DATE: "2026-10-01",
};

/** The owner's real facts (supplied 2026-09-28; privacy wording updated 2026-09-29): retention 0, so nothing outlives a deleted account. */
export const OWNER_LEGAL_ENV = {
  LEGAL_ENTITY_NAME: "Budgts, LLC",
  LEGAL_ENTITY_ADDRESS: "619 Springhouse Rd, Apt I, Allentown, PA 18104",
  SUPPORT_EMAIL: "support@budgts.com",
  LEGAL_RECORD_RETENTION_YEARS: "0",
  LEGAL_GOVERNING_LAW: "the Commonwealth of Pennsylvania",
  LEGAL_EFFECTIVE_DATE: "2026-09-29",
};
