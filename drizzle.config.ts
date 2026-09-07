import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next loads .env.local automatically; the standalone drizzle-kit CLI does not.
config({ path: ".env.local" });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error("DIRECT_URL (or DATABASE_URL) must be set for drizzle-kit. See .env.local.example.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./supabase/migrations",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
