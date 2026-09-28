import { notFound } from "next/navigation";
import { effectiveDateLabel, legalFacts, type LegalFacts } from "@/lib/legal/config";

/** The owner facts, or a 404 while any is missing: a legal page is never published with a gap in it. */
export function requireLegalFacts(): LegalFacts {
  const facts = legalFacts();
  if (!facts) notFound();
  return facts;
}

/** "Last updated October 1, 2026": the date the owner approved this wording. */
export function lastUpdatedLine(facts: LegalFacts): string {
  return `Last updated ${effectiveDateLabel(facts.effectiveDate)}`;
}
