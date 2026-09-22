import { beforeEach, describe, expect, it, vi } from "vitest";

const secureStoreData = new Map<string, string>();
const asyncStorageData = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStoreData.set(key, value);
  }),
  getItemAsync: vi.fn(async (key: string) => secureStoreData.get(key) ?? null),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStoreData.delete(key);
  }),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorageData.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageData.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageData.delete(key);
    }),
  },
}));

// The real module wraps ASKeyManager/Android Keystore + a native RNG. This
// test only exercises the AES round-trip and storage split, not the native
// implementations themselves — that half can't be verified without a device
// (see mobile/README.md).
vi.mock("expo-crypto", () => ({
  getRandomValues: (array: Uint8Array): Uint8Array => {
    globalThis.crypto.getRandomValues(array as unknown as Uint8Array<ArrayBuffer>);
    return array;
  },
}));

const { LargeSecureStore } = await import("./large-secure-store");

beforeEach(() => {
  secureStoreData.clear();
  asyncStorageData.clear();
});

describe("LargeSecureStore", () => {
  it("round-trips a value through encrypt/decrypt", async () => {
    const store = new LargeSecureStore();
    await store.setItem("session", "hello world");
    expect(await store.getItem("session")).toBe("hello world");
  });

  it("stores ciphertext in AsyncStorage, never the plaintext value", async () => {
    const store = new LargeSecureStore();
    await store.setItem("session", "super-secret-access-token");
    expect(asyncStorageData.get("session")).not.toContain("super-secret-access-token");
  });

  it("stores only the small AES key in SecureStore, not the value", async () => {
    const store = new LargeSecureStore();
    await store.setItem("session", "abc");
    const stored = secureStoreData.get("session");
    expect(stored).toMatch(/^[0-9a-f]+$/i);
    expect(stored).not.toContain("abc");
  });

  it("returns null for a key that was never set", async () => {
    const store = new LargeSecureStore();
    expect(await store.getItem("missing")).toBeNull();
  });

  it("removeItem clears both the ciphertext and the key", async () => {
    const store = new LargeSecureStore();
    await store.setItem("session", "abc");
    await store.removeItem("session");
    expect(await store.getItem("session")).toBeNull();
    expect(secureStoreData.has("session")).toBe(false);
    expect(asyncStorageData.has("session")).toBe(false);
  });

  it("round-trips a value far larger than SecureStore's ~2048-byte item cap", async () => {
    const store = new LargeSecureStore();
    const large = "x".repeat(4000);
    await store.setItem("session", large);
    expect(await store.getItem("session")).toBe(large);
  });
});
