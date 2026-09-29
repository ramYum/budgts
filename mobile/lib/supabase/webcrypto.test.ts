import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { installWebCrypto } from "./webcrypto";

const impl = () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" } as never,
  getRandomValues: vi.fn(<T,>(a: T) => a),
  digest: vi.fn(async () => new ArrayBuffer(32)),
});

describe("Web Crypto for supabase-js's PKCE on Hermes", () => {
  it("adds a secure random source and SHA-256 where the engine has neither", async () => {
    const target: { crypto?: unknown } = {};
    const i = impl();
    installWebCrypto(target, i as unknown as Parameters<typeof installWebCrypto>[1]);
    const c = target.crypto as { getRandomValues: (a: Uint32Array) => Uint32Array; subtle: { digest: (a: string, d: Uint8Array) => Promise<ArrayBuffer> } };
    const arr = new Uint32Array(56);
    expect(c.getRandomValues(arr)).toBe(arr);
    expect(i.getRandomValues).toHaveBeenCalledWith(arr);
    const data = new Uint8Array([1, 2, 3]);
    expect((await c.subtle.digest("SHA-256", data)).byteLength).toBe(32);
    expect(i.digest).toHaveBeenCalledWith("SHA-256", data);
    await expect(c.subtle.digest("SHA-1", data)).rejects.toThrow(/only SHA-256/);
  });

  it("keeps an engine's own Web Crypto", () => {
    const own = { getRandomValues: vi.fn(), subtle: { digest: vi.fn() } };
    const target: { crypto?: unknown } = { crypto: own };
    const i = impl();
    installWebCrypto(target, i as unknown as Parameters<typeof installWebCrypto>[1]);
    expect(target.crypto).toBe(own);
    expect(own.getRandomValues).toBe(own.getRandomValues);
    (target.crypto as typeof own).subtle.digest();
    expect(own.subtle.digest).toHaveBeenCalled();
    expect(i.digest).not.toHaveBeenCalled();
  });

  it("is installed before supabase-js loads, so it never falls back to a plain challenge", () => {
    const client = readFileSync(join(__dirname, "client.ts"), "utf8");
    const installAt = client.indexOf('import "./install-webcrypto"');
    expect(installAt).toBeGreaterThan(-1);
    expect(installAt).toBeLessThan(client.indexOf('from "@supabase/supabase-js"'));
  });
});
