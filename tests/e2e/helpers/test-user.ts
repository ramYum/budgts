import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** The service-role client, built on first use. Constructed lazily so specs
 * that need no admin access (and the whole suite's collection step) don't fail
 * when the secret is absent — only the tests that call this do. */
function admin(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("e2e needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.local)");
  }
  client = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

/** True when the admin credentials are present — use with `test.skip(...)`. */
export function hasAdminCredentials(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export type TestUser = { id: string; email: string };

/** Create a confirmed throwaway user. The handle_new_user trigger seeds it. */
export async function createTestUser(): Promise<TestUser> {
  const email = `e2e+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  return { id: data.user.id, email };
}

/** Delete the user (cascades to their rows via FK on delete cascade). */
export async function deleteTestUser(id: string): Promise<void> {
  await admin().auth.admin.deleteUser(id);
}

/** A magic-link token_hash the app's /auth/callback can verify. */
export async function magicTokenHash(email: string): Promise<string> {
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    throw error ?? new Error("generateLink returned no hashed_token");
  }
  return data.properties.hashed_token;
}
