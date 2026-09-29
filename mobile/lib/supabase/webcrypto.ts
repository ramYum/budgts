import type * as ExpoCrypto from "expo-crypto";

/**
 * The Web Crypto pieces supabase-js needs for PKCE, on Hermes, which has
 * neither `crypto.getRandomValues` nor `crypto.subtle`.
 *
 * Without them supabase-js falls back silently (bar a console warning, seen on
 * the Android emulator 2026-09-29): the code verifier comes from Math.random
 * and the challenge is sent "plain", i.e. the verifier itself. Then the
 * verifier is in the Google authorize URL, and the rule that a sign-in code is
 * useless without this phone's secret no longer holds. With these, the
 * verifier is drawn from the OS's secure random source and the challenge is
 * its SHA-256 (S256), both through expo-crypto.
 *
 * Only what is missing is added; an engine that ships Web Crypto keeps its own.
 * Installed by install-webcrypto.ts, the first import of client.ts.
 */

type Impl = Pick<typeof ExpoCrypto, "getRandomValues" | "digest" | "CryptoDigestAlgorithm">;
type CryptoLike = {
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
  subtle?: { digest?: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer> };
};

export function installWebCrypto(target: { crypto?: unknown }, impl: Impl): void {
  const crypto = (target.crypto ?? {}) as CryptoLike;
  if (typeof crypto.getRandomValues !== "function") {
    crypto.getRandomValues = ((array: Parameters<Impl["getRandomValues"]>[0]) => impl.getRandomValues(array)) as CryptoLike["getRandomValues"];
  }
  if (typeof crypto.subtle?.digest !== "function") {
    crypto.subtle = {
      ...crypto.subtle,
      digest: async (algorithm, data) => {
        const name = typeof algorithm === "string" ? algorithm : algorithm.name;
        if (name.toUpperCase() !== "SHA-256") throw new Error(`digest: only SHA-256 is provided, not ${name}`);
        return impl.digest(impl.CryptoDigestAlgorithm.SHA256, data);
      },
    };
  }
  if (target.crypto !== crypto) {
    // An engine whose `crypto` global is read-only must not stop the app
    // starting: supabase-js then falls back as before, and this says why, once.
    try {
      target.crypto = crypto;
    } catch {
      warnOnce("Web Crypto could not be installed: this engine's crypto global is read-only.");
    }
  }
}

let warned = false;
function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(message);
}

