import { describe, expect, it } from "vitest";
import { normalizeMerchantName } from "./merchant-name";

describe("normalizeMerchantName", () => {
  it("lowercases, trims and single-spaces", () => {
    expect(normalizeMerchantName("  Blue Bottle   Coffee ")).toBe("blue bottle coffee");
  });

  it("returns '' for null / undefined / blank", () => {
    expect(normalizeMerchantName(null)).toBe("");
    expect(normalizeMerchantName(undefined)).toBe("");
    expect(normalizeMerchantName("   ")).toBe("");
  });

  it("never collapses a two-word brand to one word", () => {
    expect(normalizeMerchantName("UBER   EATS")).toBe("uber eats");
    expect(normalizeMerchantName("uber eats")).toBe("uber eats");
  });

  it("strips leading processor prefixes", () => {
    expect(normalizeMerchantName("SQ *BLUE BOTTLE")).toBe("blue bottle");
    expect(normalizeMerchantName("TST* PANERA BREAD")).toBe("panera bread");
    expect(normalizeMerchantName("PP*NETFLIX")).toBe("netflix");
    expect(normalizeMerchantName("CHKCARD MCDONALDS")).toBe("mcdonalds");
  });

  it("treats * / \\ as separators, joins on apostrophes", () => {
    expect(normalizeMerchantName("Uber *Trip")).toBe("uber trip");
    expect(normalizeMerchantName("McDonald's")).toBe("mcdonalds");
    expect(normalizeMerchantName("Trader Joe's")).toBe("trader joes");
    expect(normalizeMerchantName("Chick-fil-A")).toBe("chick fil a");
  });

  it("reduces a bare hostname to its primary label", () => {
    expect(normalizeMerchantName("NETFLIX.COM")).toBe("netflix");
    expect(normalizeMerchantName("Spotify.com")).toBe("spotify");
  });

  it("drops an embedded support URL entirely", () => {
    expect(normalizeMerchantName("Uber *Trip help.uber.com")).toBe("uber trip");
    expect(normalizeMerchantName("PLANET FIT https://planetfitness.com")).toBe("planet fit");
  });

  it("reduces a standalone dotted hostname to its first label (documented, harmless)", () => {
    // A bare hostname as the whole merchant string keeps the FIRST label.
    // "help.uber.com" → "help": there is no "help" knowledge key, so this
    // falls through to the PFC layers rather than matching anything.
    expect(normalizeMerchantName("help.uber.com")).toBe("help");
    expect(normalizeMerchantName("www.spotify.com")).toBe("www");
  });

  it("strips store / location numbers", () => {
    expect(normalizeMerchantName("McDonald's #1234")).toBe("mcdonalds");
    expect(normalizeMerchantName("SHELL OIL 12345678")).toBe("shell oil");
    expect(normalizeMerchantName("SAFEWAY STORE 2891")).toBe("safeway");
  });

  it("strips trailing corp suffixes but keeps a leading article verbatim", () => {
    expect(normalizeMerchantName("The Home Depot")).toBe("the home depot"); // NOT "home depot" — leading-article stripping is not an approved rule
    expect(normalizeMerchantName("Comcast Corp")).toBe("comcast");
    expect(normalizeMerchantName("Acme Widgets Inc")).toBe("acme widgets");
  });

  it("does NOT strip a suffix that is part of a word", () => {
    expect(normalizeMerchantName("Costco")).toBe("costco");
    expect(normalizeMerchantName("Wells Fargo")).toBe("wells fargo");
  });

  it("keeps similar-but-distinct merchants distinct", () => {
    expect(normalizeMerchantName("Delta Air Lines")).toBe("delta air lines");
    expect(normalizeMerchantName("Delta Dental")).toBe("delta dental");
    expect(normalizeMerchantName("Delta Air Lines")).not.toBe(normalizeMerchantName("Delta Dental"));
  });

  it("is idempotent", () => {
    for (const s of ["SQ *BLUE BOTTLE #1234 OAKLAND CA", "UBER *EATS", "NETFLIX.COM", "McDonald's #9"]) {
      const once = normalizeMerchantName(s);
      expect(normalizeMerchantName(once)).toBe(once);
    }
  });

  it("output is only [a-z0-9 ]", () => {
    for (const s of ["SQ *BLUE BOTTLE #1234", "AT&T*BILL", "Chick-fil-A #01", "help.uber.com"]) {
      expect(normalizeMerchantName(s)).toMatch(/^[a-z0-9 ]*$/);
    }
  });
});
