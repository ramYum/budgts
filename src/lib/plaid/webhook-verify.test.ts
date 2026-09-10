import { createHash } from "node:crypto";
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyPlaidWebhook } from "./webhook-verify";

const BODY = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "item-123" });
const bodyHash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

let privateKey: CryptoKey;
let publicJwk: JWK;
const KID = "kid-abc";
const NOW = 1_800_000_000_000; // fixed clock (ms)

async function makeJwt(over: { iat?: number; bodyHash?: string; alg?: string; kid?: string | null } = {}) {
  const iat = over.iat ?? Math.floor(NOW / 1000);
  const builder = new SignJWT({ request_body_sha256: over.bodyHash ?? bodyHash(BODY) })
    .setProtectedHeader({ alg: over.alg ?? "ES256", ...(over.kid === null ? {} : { kid: over.kid ?? KID }) })
    .setIssuedAt(iat);
  return builder.sign(privateKey);
}

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  privateKey = kp.privateKey;
  publicJwk = { ...(await exportJWK(kp.publicKey)), kid: KID, alg: "ES256", use: "sig" };
});

const getKey = async (kid: string): Promise<JWK | null> => (kid === KID ? publicJwk : null);
const verify = (jwt: string | null, over: Partial<Parameters<typeof verifyPlaidWebhook>[0]> = {}) =>
  verifyPlaidWebhook({ rawBody: BODY, jwt, getKey, now: () => NOW, ...over });

describe("verifyPlaidWebhook", () => {
  it("accepts a well-formed, fresh, correctly-signed webhook", async () => {
    expect(await verify(await makeJwt())).toEqual({ ok: true });
  });

  it("rejects a missing header", async () => {
    expect(await verify(null)).toMatchObject({ ok: false, reason: /missing/ });
  });

  it("rejects a malformed JWT", async () => {
    expect(await verify("not.a.jwt")).toMatchObject({ ok: false });
  });

  it("rejects a non-ES256 alg", async () => {
    // build an HS256 token by hand-ish: jose won't sign HS with an EC key, so
    // assert the header check via a token whose header says HS256.
    const t = await makeJwt();
    const [h, p, s] = t.split(".");
    const badHeader = Buffer.from(JSON.stringify({ alg: "HS256", kid: KID })).toString("base64url");
    expect(await verify(`${badHeader}.${p}.${s}`)).toMatchObject({ ok: false, reason: /alg/ });
    void h;
  });

  it("rejects when the kid is unknown", async () => {
    expect(await verify(await makeJwt({ kid: "other" }))).toMatchObject({ ok: false, reason: /verification key/ });
  });

  it("rejects when the header has no kid", async () => {
    expect(await verify(await makeJwt({ kid: null }))).toMatchObject({ ok: false, reason: /no kid/ });
  });

  it("rejects a bad signature (token signed by a different key)", async () => {
    const other = await generateKeyPair("ES256", { extractable: true });
    const t = await new SignJWT({ request_body_sha256: bodyHash(BODY) })
      .setProtectedHeader({ alg: "ES256", kid: KID })
      .setIssuedAt(Math.floor(NOW / 1000))
      .sign(other.privateKey);
    expect(await verify(t)).toMatchObject({ ok: false, reason: /signature/ });
  });

  it("rejects a stale token (iat older than maxAge)", async () => {
    const old = Math.floor(NOW / 1000) - 3600;
    expect(await verify(await makeJwt({ iat: old }))).toMatchObject({ ok: false, reason: /too old/ });
  });

  it("rejects a token issued in the future", async () => {
    const future = Math.floor(NOW / 1000) + 3600;
    expect(await verify(await makeJwt({ iat: future }))).toMatchObject({ ok: false, reason: /future/ });
  });

  it("rejects when the body hash in the JWT does not match the actual body", async () => {
    expect(await verify(await makeJwt({ bodyHash: bodyHash("tampered") }))).toMatchObject({
      ok: false,
      reason: /body hash mismatch/,
    });
  });

  it("rejects when the raw body has been altered after signing", async () => {
    const jwt = await makeJwt();
    expect(await verifyPlaidWebhook({ rawBody: BODY + " ", jwt, getKey, now: () => NOW })).toMatchObject({
      ok: false,
      reason: /body hash mismatch/,
    });
  });
});
