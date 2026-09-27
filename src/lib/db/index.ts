import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function connect(connectionString: string) {
  // The Supabase transaction pooler (pgbouncer) does not support prepared
  // statements, so they must be disabled on the runtime connection.
  return drizzle(postgres(connectionString, { prepare: false }), { schema });
}

let cached: ReturnType<typeof connect> | null = null;

/**
 * The server-only Plaid pipeline's DB handle (connects as the DB owner, so it
 * bypasses RLS: scope every query by user_id / item_id). Built on first use,
 * never at import: `next build` loads every route module to collect page data,
 * and CI and Vercel Preview builds carry no database credentials. A missing
 * DATABASE_URL still fails loudly, on the first request that needs the DB.
 */
export function db(): ReturnType<typeof connect> {
  if (cached) return cached;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — see .env.local.example");
  }
  cached = connect(connectionString);
  return cached;
}

export { schema };
