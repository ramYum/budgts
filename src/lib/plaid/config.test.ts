import { describe, expect, it } from "vitest";
import { decodeTokenEncKey, type EnvLike, loadPlaidConfig, PINNED_PLAID_VERSION } from "./config";

const KEY32 = Buffer.alloc(32, 7).toString("base64");

function env(over: EnvLike = {}): EnvLike {
  return {
    PLAID_CLIENT_ID: "cid",
    PLAID_SECRET: "sek",
    PLAID_ENV: "sandbox",
    PLAID_TOKEN_ENC_KEY: KEY32,
    ...over,
  };
}

describe("loadPlaidConfig", () => {
  it("builds a config from a complete sandbox env", () => {
    const c = loadPlaidConfig(env());
    expect(c.clientId).toBe("cid");
    expect(c.secret).toBe("sek");
    expect(c.env).toBe("sandbox");
    expect(c.basePath).toMatch(/sandbox\.plaid\.com/);
    expect(c.plaidVersion).toBe(PINNED_PLAID_VERSION);
    expect(c.products).toEqual(["transactions"]);
    expect(c.countryCodes).toEqual(["US"]);
    expect(c.tokenEncKey).toBeInstanceOf(Buffer);
    expect(c.tokenEncKey).toHaveLength(32);
    expect(c.cronSecret).toBeNull();
  });

  it("defaults PLAID_ENV to sandbox when unset", () => {
    expect(loadPlaidConfig(env({ PLAID_ENV: undefined })).env).toBe("sandbox");
  });

  it("accepts production and points at the production host", () => {
    const c = loadPlaidConfig(env({ PLAID_ENV: "production" }));
    expect(c.env).toBe("production");
    expect(c.basePath).toMatch(/production\.plaid\.com/);
  });

  it("passes CRON_SECRET through when present", () => {
    expect(loadPlaidConfig(env({ CRON_SECRET: "s3cr3t" })).cronSecret).toBe("s3cr3t");
  });

  it.each(["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_TOKEN_ENC_KEY"])(
    "throws a pointer-to-example error when %s is missing",
    (name) => {
      expect(() => loadPlaidConfig(env({ [name]: undefined }))).toThrow(
        new RegExp(`${name} is not set`),
      );
    },
  );

  it("throws on an empty required var", () => {
    expect(() => loadPlaidConfig(env({ PLAID_CLIENT_ID: "  " }))).toThrow(/PLAID_CLIENT_ID is not set/);
  });

  it("rejects an unknown PLAID_ENV", () => {
    expect(() => loadPlaidConfig(env({ PLAID_ENV: "development" }))).toThrow(/PLAID_ENV must be/);
  });
});

describe("decodeTokenEncKey", () => {
  it("returns a 32-byte Buffer for a valid key", () => {
    expect(decodeTokenEncKey(KEY32)).toHaveLength(32);
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => decodeTokenEncKey(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
    expect(() => decodeTokenEncKey(Buffer.alloc(64).toString("base64"))).toThrow(/32 bytes/);
  });
});

// design 2026-09-15: redirect_uri is OFF by default (only sent to Plaid once
// the owner has registered it in the Plaid dashboard's Allowed redirect URIs
// — an env var they set is the confirmation, since there's no API to check
// dashboard registration). Sending an unregistered redirect_uri makes EVERY
// link-token create fail, not just OAuth reconnects, so this must never be on
// by accident.
describe("loadPlaidConfig — oauthRedirectUri", () => {
  it("is null when PLAID_OAUTH_REDIRECT_URI is unset (feature off by default)", () => {
    expect(loadPlaidConfig(env()).oauthRedirectUri).toBeNull();
  });

  it("passes the URI through once set", () => {
    const c = loadPlaidConfig(env({ PLAID_OAUTH_REDIRECT_URI: "http://localhost:3000/plaid-oauth" }));
    expect(c.oauthRedirectUri).toBe("http://localhost:3000/plaid-oauth");
  });

  it("rejects a non-https redirect URI in production — Plaid requires https there", () => {
    expect(() =>
      loadPlaidConfig(
        env({ PLAID_ENV: "production", PLAID_OAUTH_REDIRECT_URI: "http://budgts.com/plaid-oauth" }),
      ),
    ).toThrow(/PLAID_OAUTH_REDIRECT_URI must be an https URL in production/);
  });

  it("accepts an https redirect URI in production", () => {
    const c = loadPlaidConfig(
      env({ PLAID_ENV: "production", PLAID_OAUTH_REDIRECT_URI: "https://budgts.com/plaid-oauth" }),
    );
    expect(c.oauthRedirectUri).toBe("https://budgts.com/plaid-oauth");
  });
});
