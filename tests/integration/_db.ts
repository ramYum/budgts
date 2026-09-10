/**
 * Shared harness for the DB-integration layer. Connects to budgts-staging ONLY
 * (guards on the project ref), and seeds/tears down a throwaway auth user whose
 * `handle_new_user` trigger provides the default categories + a "Main" account.
 *
 * Everything created here is synthetic test data — never mistake it for a real
 * Plaid integration.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

const STAGING_REF = "iwypmifvmtmkwtnxkfma";
const url = process.env.DIRECT_URL;
if (!url || !url.includes(STAGING_REF)) {
  throw new Error(
    `DB-integration tests need .env.staging DIRECT_URL pointing at budgts-staging (${STAGING_REF}); got ${
      url ? "a different target" : "nothing"
    }`,
  );
}

export const client = postgres(url, { prepare: false, max: 4 });
export const db = drizzle(client, { schema });

/** Insert a bare `auth.users` row (the trigger does the rest); return its id. */
export async function seedUser(): Promise<string> {
  const [row] = await client<{ id: string }[]>`
    insert into auth.users (id, aud, role, email)
    values (gen_random_uuid(), 'authenticated', 'authenticated',
            concat('itest+', gen_random_uuid(), '@example.test'))
    returning id`;
  return row.id;
}

/** Delete the user; every owned row cascades (auth.users FK ON DELETE cascade). */
export async function cleanupUser(id: string): Promise<void> {
  await client`delete from auth.users where id = ${id}`;
}

export async function categoryIdByName(userId: string, name: string): Promise<string> {
  const [row] = await client<{ id: string }[]>`
    select id from public.categories where user_id = ${userId} and name = ${name} limit 1`;
  if (!row) throw new Error(`no category "${name}" for ${userId}`);
  return row.id;
}

export async function mainAccountId(userId: string): Promise<string> {
  const [row] = await client<{ id: string }[]>`
    select id from public.accounts where user_id = ${userId} order by created_at limit 1`;
  if (!row) throw new Error(`no account for ${userId}`);
  return row.id;
}
