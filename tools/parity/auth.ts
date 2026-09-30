/**
 * Sign-in helpers for the parity users (staging only: call `loadStagingEnv()` first). A magic-link `token_hash` is
 * single-use and short-lived, so every capture mints a fresh one right before it signs in, on the web
 * (`/auth/callback?token_hash=…`) and on the device (`budgts://auth/callback?token_hash=…`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ParityUserName } from "./data";

export const NO_SESSION = { auth: { autoRefreshToken: false, persistSession: false } } as const;

let adminClient: SupabaseClient | null = null;

/** The service-role client (server-side tooling only; never shipped to a client). */
export function admin(): SupabaseClient {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret) throw new Error("parity: .env.staging needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
    adminClient = createClient(url, secret, NO_SESSION);
  }
  return adminClient;
}

/** A fresh, single-use magic-link token hash (the same trick as tests/e2e/helpers/test-user.ts). */
export async function tokenHashFor(email: string): Promise<string> {
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) throw error ?? new Error("generateLink returned no hashed_token");
  return data.properties.hashed_token;
}

/** Signs in as `email` through the publishable key, the way the apps do; returns an RLS-scoped client. */
export async function signIn(email: string): Promise<{ supabase: SupabaseClient; accessToken: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const anon = createClient(url, anonKey, NO_SESSION);
  const { data, error } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: await tokenHashFor(email) });
  if (error || !data.session) throw error ?? new Error("verifyOtp produced no session");
  const accessToken = data.session.access_token;
  const supabase = createClient(url, anonKey, { ...NO_SESSION, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
  return { supabase, accessToken };
}

export type SeededUsers = {
  project: string;
  month: string;
  timeZone: string;
  users: Partial<Record<ParityUserName, { id: string; email: string }>>;
};

export const USERS_FILE = join(process.cwd(), ".tmp", "parity", "users.json");

export function readSeededUsers(): SeededUsers {
  try {
    return JSON.parse(readFileSync(USERS_FILE, "utf8")) as SeededUsers;
  } catch {
    throw new Error("parity: .tmp/parity/users.json is missing; run `npm run parity:seed` first");
  }
}
