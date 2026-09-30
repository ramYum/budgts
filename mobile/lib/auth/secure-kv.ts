import * as SecureStore from "expo-secure-store";
import type { KeyValueStore } from "./persisted";

/** The device's secure storage (Keychain / Keystore) as lib/auth/persisted.ts's store. */
export const secureKv: KeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
