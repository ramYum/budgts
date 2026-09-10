/**
 * Symmetric encryption for the Plaid `access_token` at rest.
 *
 * The token is a long-lived bearer credential for a user's bank connection. It
 * is encrypted before it touches Postgres and only ever decrypted server-side
 * in the sync / reconnect / disconnect paths (design §9, §22).
 *
 * Scheme: AES-256-GCM. The stored blob is base64 of:
 *
 *     keyVersion (1 byte) | iv (12 bytes) | authTag (16 bytes) | ciphertext
 *
 * `keyVersion` lets a future key rotation decrypt old blobs while writing new
 * ones under a new key. These functions take the key explicitly so they stay
 * pure and unit-testable; callers pass `loadPlaidConfig().tokenEncKey`.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;
const ALGO = "aes-256-gcm";

function assertKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new TypeError(`encryption key must be a 32-byte Buffer (got ${Buffer.isBuffer(key) ? key.length : typeof key})`);
  }
}

/** Encrypt a UTF-8 string. Returns the base64 blob described above. */
export function encryptToken(plaintext: string, key: Buffer): string {
  assertKey(key);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([KEY_VERSION]), iv, tag, ciphertext]).toString("base64");
}

/** Decrypt a blob produced by {@link encryptToken}. Throws if tampered or wrong key. */
export function decryptToken(blob: string, key: Buffer): string {
  assertKey(key);
  const buf = Buffer.from(blob, "base64");
  if (buf.length < 1 + IV_LEN + TAG_LEN) {
    throw new Error("encrypted token blob is too short / malformed");
  }
  const version = buf[0];
  if (version !== KEY_VERSION) {
    throw new Error(`unknown encryption key version ${version} (expected ${KEY_VERSION})`);
  }
  const iv = buf.subarray(1, 1 + IV_LEN);
  const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** The key version new blobs are written under. Exposed for tests / diagnostics. */
export const currentKeyVersion = KEY_VERSION;
