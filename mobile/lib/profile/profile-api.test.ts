import { describe, expect, it } from "vitest";
import { NotAuthenticatedError } from "../auth/api";
import { loadProfile, parseProfile, saveCurrency } from "./profile-api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const PROFILE = { email: "a@example.test", currency: "USD", onboarded: false, supportedCurrencies: ["USD", "EUR"] };

describe("parseProfile", () => {
  it("accepts the server contract", () => {
    expect(parseProfile(PROFILE)).toEqual(PROFILE);
  });

  it("allows a null email (some providers hide it)", () => {
    expect(parseProfile({ ...PROFILE, email: null }).email).toBeNull();
  });

  it.each([
    ["missing currency", { ...PROFILE, currency: undefined }],
    ["non-boolean onboarded", { ...PROFILE, onboarded: "no" }],
    ["empty currency list", { ...PROFILE, supportedCurrencies: [] }],
    ["non-string currency in list", { ...PROFILE, supportedCurrencies: ["USD", 5] }],
    ["not an object", "x"],
  ])("rejects %s", (_name, body) => {
    expect(() => parseProfile(body)).toThrow();
  });
});

describe("loadProfile", () => {
  it("is ready with the parsed profile", async () => {
    expect(await loadProfile(async () => json(200, PROFILE))).toEqual({ status: "ready", profile: PROFILE });
  });

  it("maps an expired session to an auth error", async () => {
    const s = await loadProfile(async () => {
      throw new NotAuthenticatedError();
    });
    expect(s).toMatchObject({ status: "error", kind: "auth" });
  });

  it("maps a missing profile (404) to its own kind so the app can say what to do", async () => {
    expect(await loadProfile(async () => json(404, { error: "profile_missing" }))).toMatchObject({
      status: "error",
      kind: "profile_missing",
    });
  });

  it("maps a server failure to unavailable and a bad body to contract", async () => {
    expect(await loadProfile(async () => json(503, { error: "unavailable" }))).toMatchObject({ kind: "unavailable" });
    expect(await loadProfile(async () => json(200, { junk: true }))).toMatchObject({ kind: "contract" });
  });
});

describe("saveCurrency", () => {
  it("is saved when the server confirms onboarding", async () => {
    expect(await saveCurrency(async () => json(200, { onboarded: true, currency: "EUR" }))).toEqual({ status: "saved" });
  });

  it("treats already_onboarded as fine — another device finished it, the app just reloads", async () => {
    expect(await saveCurrency(async () => json(409, { error: "already_onboarded" }))).toEqual({ status: "already_onboarded" });
  });

  it("reports a retryable error otherwise, without raw text", async () => {
    const r = await saveCurrency(async () => json(503, { error: "update_failed" }));
    expect(r).toMatchObject({ status: "error", kind: "unavailable" });
    expect(JSON.stringify(r)).not.toContain("update_failed");
  });
});
