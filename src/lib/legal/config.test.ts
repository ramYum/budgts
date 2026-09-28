import { describe, expect, it } from "vitest";
import { LEGAL_ENV, effectiveDateLabel, legalFacts, legalPagesLive, missingLegalFacts, yearsLabel } from "./config";
import { FULL_LEGAL_ENV } from "@/test-utils/legal-env";

describe("legal switch", () => {
  it("is off with nothing set, and names every missing fact", () => {
    expect(legalPagesLive({})).toBe(false);
    expect(legalFacts({})).toBeNull();
    expect(missingLegalFacts({})).toEqual(Object.values(LEGAL_ENV));
  });

  it("turns on only when every fact is set", () => {
    expect(legalPagesLive(FULL_LEGAL_ENV)).toBe(true);
    expect(missingLegalFacts(FULL_LEGAL_ENV)).toEqual([]);
    expect(legalFacts(FULL_LEGAL_ENV)).toEqual({
      entityName: "Example Labs LLC",
      address: "1 Main Street, Springfield, DE 19901, United States",
      contactEmail: "help@example.com",
      retentionYears: 7,
      governingLaw: "the State of Delaware, United States",
      effectiveDate: "2026-10-01",
    });
  });

  it.each(Object.keys(FULL_LEGAL_ENV))("stays off while %s is missing or blank", (name) => {
    expect(legalPagesLive({ ...FULL_LEGAL_ENV, [name]: undefined })).toBe(false);
    expect(legalPagesLive({ ...FULL_LEGAL_ENV, [name]: "   " })).toBe(false);
    expect(missingLegalFacts({ ...FULL_LEGAL_ENV, [name]: "" })).toEqual([name]);
  });

  it.each([
    ["SUPPORT_EMAIL", "not-an-email"],
    ["LEGAL_RECORD_RETENTION_YEARS", "0"],
    ["LEGAL_RECORD_RETENTION_YEARS", "seven"],
    ["LEGAL_RECORD_RETENTION_YEARS", "2.5"],
    ["LEGAL_EFFECTIVE_DATE", "2026-02-30"],
    ["LEGAL_EFFECTIVE_DATE", "October 1"],
  ])("treats %s=%s as not set", (name, value) => {
    expect(missingLegalFacts({ ...FULL_LEGAL_ENV, [name]: value })).toEqual([name]);
  });

  it("trims what it reads", () => {
    expect(legalFacts({ ...FULL_LEGAL_ENV, SUPPORT_EMAIL: "  help@example.com " })?.contactEmail).toBe("help@example.com");
  });
});

describe("labels", () => {
  it("says years in words", () => {
    expect(yearsLabel(1)).toBe("1 year");
    expect(yearsLabel(7)).toBe("7 years");
  });
  it("prints the effective date without a time-zone shift", () => {
    expect(effectiveDateLabel("2026-10-01")).toBe("October 1, 2026");
  });
});
