import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { supabase } from "../supabase/client";
import { signInWithApple, type AppleSignInResult } from "./apple-sign-in";

/**
 * The device wiring for `signInWithApple`: `expo-apple-authentication` for Apple's sheet, `expo-crypto` for the nonce, and the
 * app's Supabase client. Everything decision-worthy is in `apple-sign-in.ts` (unit-tested); this file only connects native
 * modules and so is verified on a device / iOS build. iOS only — `isAvailableAsync()` is false elsewhere.
 */
export const isAppleSignInAvailable = () => AppleAuthentication.isAvailableAsync();

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function signInWithAppleNative(): Promise<AppleSignInResult> {
  return signInWithApple({
    isAvailable: () => AppleAuthentication.isAvailableAsync(),
    randomNonce: async () => toHex(await Crypto.getRandomBytesAsync(32)),
    sha256Hex: (input) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input),
    requestCredential: async (nonce) => {
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
          nonce,
        });
        return { identityToken: credential.identityToken };
      } catch (err) {
        if ((err as { code?: string }).code === "ERR_REQUEST_CANCELED") return { cancelled: true };
        throw err;
      }
    },
    signInWithIdToken: async ({ token, nonce }) => {
      const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token, nonce });
      return { error: error ? { message: error.message } : null };
    },
  });
}
