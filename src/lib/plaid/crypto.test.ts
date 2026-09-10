import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { currentKeyVersion, decryptToken, encryptToken } from "./crypto";

const key = () => randomBytes(32);
const SAMPLE = "access-sandbox-1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d";

describe("encryptToken / decryptToken", () => {
  it("round-trips a token", () => {
    const k = key();
    expect(decryptToken(encryptToken(SAMPLE, k), k)).toBe(SAMPLE);
  });

  it("round-trips empty and unicode strings", () => {
    const k = key();
    expect(decryptToken(encryptToken("", k), k)).toBe("");
    expect(decryptToken(encryptToken("café ☕ 世界", k), k)).toBe("café ☕ 世界");
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const k = key();
    expect(encryptToken(SAMPLE, k)).not.toBe(encryptToken(SAMPLE, k));
  });

  it("emits the current key-version byte as the first byte", () => {
    const buf = Buffer.from(encryptToken(SAMPLE, key()), "base64");
    expect(buf[0]).toBe(currentKeyVersion);
  });

  it("fails to decrypt with the wrong key", () => {
    const blob = encryptToken(SAMPLE, key());
    expect(() => decryptToken(blob, key())).toThrow();
  });

  it("fails the auth tag when the ciphertext is tampered", () => {
    const k = key();
    const buf = Buffer.from(encryptToken(SAMPLE, k), "base64");
    buf[buf.length - 1] ^= 0x01; // flip a bit in the ciphertext
    expect(() => decryptToken(buf.toString("base64"), k)).toThrow();
  });

  it("fails the auth tag when the IV is tampered", () => {
    const k = key();
    const buf = Buffer.from(encryptToken(SAMPLE, k), "base64");
    buf[2] ^= 0x01; // flip a bit inside the IV
    expect(() => decryptToken(buf.toString("base64"), k)).toThrow();
  });

  it("rejects a blob with an unknown version byte", () => {
    const k = key();
    const buf = Buffer.from(encryptToken(SAMPLE, k), "base64");
    buf[0] = 9;
    expect(() => decryptToken(buf.toString("base64"), k)).toThrow(/key version/);
  });

  it("rejects a truncated blob", () => {
    expect(() => decryptToken(Buffer.alloc(5).toString("base64"), key())).toThrow(/too short/);
  });

  it("rejects a non-32-byte key on both sides", () => {
    expect(() => encryptToken(SAMPLE, Buffer.alloc(16))).toThrow(/32-byte/);
    expect(() => decryptToken(encryptToken(SAMPLE, key()), Buffer.alloc(16))).toThrow(/32-byte/);
  });
});
