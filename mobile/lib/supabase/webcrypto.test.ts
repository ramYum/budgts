import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// auth-js has no exports map: its own PKCE helper, the code supabase-js runs to build a challenge
import { getCodeChallengeAndMethod } from "@supabase/auth-js/dist/main/lib/helpers.js";
import { installWebCrypto } from "./webcrypto";

type Impl = Parameters<typeof installWebCrypto>[1];

const impl = () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" } as never,
  getRandomValues: vi.fn(<T,>(a: T) => a),
  digest: vi.fn(async () => new ArrayBuffer(32)),
});

/** expo-crypto's two functions, played by Node's own Web Crypto. */
const nodeAsExpoCrypto = {
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  getRandomValues: <T extends ArrayBufferView | null>(a: T) => webcrypto.getRandomValues(a as never) as T,
  digest: (_alg: unknown, data: BufferSource) => webcrypto.subtle.digest("SHA-256", data as never),
} as unknown as Impl;

describe("Web Crypto for supabase-js's PKCE on Hermes", () => {
  it("adds a secure random source and SHA-256 where the engine has neither", async () => {
    const target: { crypto?: unknown } = {};
    const i = impl();
    installWebCrypto(target, i as unknown as Impl);
    const c = target.crypto as {
      getRandomValues: (a: Uint32Array) => Uint32Array;
      subtle: { digest: (a: string, d: Uint8Array) => Promise<ArrayBuffer> };
    };
    const arr = new Uint32Array(56);
    expect(c.getRandomValues(arr)).toBe(arr);
    expect(i.getRandomValues).toHaveBeenCalledWith(arr);
    const data = new Uint8Array([1, 2, 3]);
    expect((await c.subtle.digest("SHA-256", data)).byteLength).toBe(32);
    expect(i.digest).toHaveBeenCalledWith("SHA-256", data);
    await expect(c.subtle.digest("SHA-1", data)).rejects.toThrow(/only SHA-256/);
  });

  it("keeps an engine's own Web Crypto", () => {
    const ownRandom = vi.fn();
    const ownDigest = vi.fn();
    const own = { getRandomValues: ownRandom, subtle: { digest: ownDigest } };
    const target: { crypto?: unknown } = { crypto: own };
    const i = impl();
    installWebCrypto(target, i as unknown as Impl);
    expect(target.crypto).toBe(own);
    expect(own.getRandomValues).toBe(ownRandom);
    expect(own.subtle.digest).toBe(ownDigest);
    expect(i.getRandomValues).not.toHaveBeenCalled();
    expect(i.digest).not.toHaveBeenCalled();
  });

  it("never stops the app starting when the crypto global is read-only, and says so once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const target = {} as { crypto?: unknown };
    Object.defineProperty(target, "crypto", { value: undefined, writable: false, configurable: false });
    expect(() => installWebCrypto(target, impl() as unknown as Impl)).not.toThrow();
    expect(() => installWebCrypto(target, impl() as unknown as Impl)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/read-only/);
    warn.mockRestore();
  });

  it("is installed before supabase-js loads, so it never falls back to a plain challenge", () => {
    const client = readFileSync(join(__dirname, "client.ts"), "utf8");
    const installAt = client.indexOf('import "./install-webcrypto"');
    expect(installAt).toBeGreaterThan(-1);
    expect(installAt).toBeLessThan(client.indexOf('from "@supabase/supabase-js"'));
  });
});

/**
 * End to end through supabase-js's own PKCE code: on an engine without Web
 * Crypto (Hermes), auth-js sends a "plain" challenge (the verifier itself);
 * with the shim it sends S256. Node's global crypto is hidden to play Hermes.
 */
describe("auth-js's PKCE challenge on an engine without Web Crypto", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const memory = () => {
    const items = new Map<string, string>();
    return {
      items,
      getItem: async (k: string) => items.get(k) ?? null,
      setItem: async (k: string, v: string) => void items.set(k, v),
      removeItem: async (k: string) => void items.delete(k),
    };
  };

  beforeEach(() => {
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "crypto", original);
  });

  it("falls back to plain without the shim (the bug the shim fixes)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const [challenge, method] = await getCodeChallengeAndMethod(memory(), "sb-test");
    expect(method).toBe("plain");
    expect(challenge).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    warn.mockRestore();
  });

  it("sends an S256 challenge of a secure-random verifier with the shim", async () => {
    installWebCrypto(globalThis as { crypto?: unknown }, nodeAsExpoCrypto);
    const storage = memory();
    const [challenge, method] = await getCodeChallengeAndMethod(storage, "sb-test");
    expect(method).toBe("s256");
    // auth-js stores it JSON-encoded under <key>-code-verifier
    const verifier = JSON.parse(storage.items.get("sb-test-code-verifier") ?? "null") as string | null;
    expect(verifier).toMatch(/^[0-9a-f]{112}$/);
    expect(challenge).not.toBe(verifier);
    expect(challenge).toBe(createHash("sha256").update(verifier!).digest("base64url"));
  });
});
