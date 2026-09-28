import { notFound } from "next/navigation";
import { effectiveDateLabel, legalFacts, type LegalFacts } from "@/lib/legal/config";

/** The owner facts, or a 404 while any is missing: a legal page is never published with a gap in it. */
export function requireLegalFacts(): LegalFacts {
  const facts = legalFacts();
  if (!facts) notFound();
  return facts;
}

/** "Effective October 1, 2026" */
export function effectiveLine(facts: LegalFacts): string {
  return `Effective ${effectiveDateLabel(facts.effectiveDate)}`;
}
