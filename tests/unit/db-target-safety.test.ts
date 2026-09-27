import { describe, expect, it } from "vitest";
import {
  extractProjectRef,
  findKnownProject,
  identifyTarget,
  maskConnectionString,
  requireConfirmedRef,
} from "../../tools/db/target-safety";

const PROD_REF = "wsmhstqpvbbcqpqhiqyp";
const POOLER_URL = `postgresql://postgres.${PROD_REF}:supersecretpw@aws-0-us-east-2.pooler.supabase.com:5432/postgres`;
const DIRECT_URL = `postgresql://postgres:supersecretpw@db.${PROD_REF}.supabase.co:5432/postgres`;
const API_URL = `https://${PROD_REF}.supabase.co`;

describe("extractProjectRef", () => {
  it("extracts the ref from a pooler-style connection string", () => {
    expect(extractProjectRef(POOLER_URL)).toBe(PROD_REF);
  });

  it("extracts the ref from a raw direct-host connection string", () => {
    expect(extractProjectRef(DIRECT_URL)).toBe(PROD_REF);
  });

  it("extracts the ref from a Supabase API URL", () => {
    expect(extractProjectRef(API_URL)).toBe(PROD_REF);
  });

  it("returns null for an unrecognizable string", () => {
    expect(extractProjectRef("postgresql://localhost:5432/postgres")).toBeNull();
  });
});

describe("maskConnectionString", () => {
  it("redacts the password but keeps the rest visible", () => {
    const masked = maskConnectionString(POOLER_URL);
    expect(masked).not.toContain("supersecretpw");
    expect(masked).toContain(`postgres.${PROD_REF}`);
    expect(masked).toContain("***");
  });
});

describe("findKnownProject", () => {
  it("identifies the known production ref", () => {
    expect(findKnownProject(PROD_REF)?.danger).toBe("production");
  });

  it("returns null for an unregistered ref", () => {
    expect(findKnownProject("some0000000000000ref")).toBeNull();
  });
});

describe("identifyTarget", () => {
  it("flags a production connection string as known/production", () => {
    const identity = identifyTarget(POOLER_URL);
    expect(identity.ref).toBe(PROD_REF);
    expect(identity.known?.danger).toBe("production");
    expect(identity.maskedUrl).not.toContain("supersecretpw");
  });
});

describe("requireConfirmedRef", () => {
  it("passes when the confirmation matches the detected ref", () => {
    expect(() => requireConfirmedRef(POOLER_URL, PROD_REF)).not.toThrow();
  });

  it("throws when no confirmation is supplied", () => {
    expect(() => requireConfirmedRef(POOLER_URL, undefined)).toThrow(/no confirmation ref/i);
  });

  it("throws when the confirmation does not match the detected ref", () => {
    expect(() => requireConfirmedRef(POOLER_URL, "some0000000000000oops")).toThrow(/mismatch/i);
  });

  it("throws when the target ref cannot be identified at all", () => {
    expect(() => requireConfirmedRef("postgresql://localhost:5432/postgres", "anything")).toThrow(/could not identify/i);
  });
});
