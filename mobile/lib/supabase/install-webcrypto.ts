import * as ExpoCrypto from "expo-crypto";
import { installWebCrypto } from "./webcrypto";

// Before supabase-js is loaded: its PKCE verifier and S256 challenge need Web Crypto (webcrypto.ts).
installWebCrypto(globalThis as { crypto?: unknown }, ExpoCrypto);
