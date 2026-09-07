import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — see .env.local.example");
}

// The Supabase transaction pooler (pgbouncer) does not support prepared
// statements, so they must be disabled on the runtime connection.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
export { schema };
