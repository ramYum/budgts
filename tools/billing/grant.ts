/**
 * Entry point of `npm run billing:grant` (logic and safety rules: ./grant-tool.ts; how to run it:
 * docs/operations/billing-manual-grant.md). Loads the database URL from --env-file (default .env.local) the way
 * `predb:migrate` does, so the target-ref confirmation checks the URL this run will really use.
 */
import fs from "node:fs";
import os from "node:os";
import { parse as parseEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fromPostgres } from "../../src/lib/billing/db";
import { parseGrantArgs, runGrantTool } from "./grant-tool";

const argv = process.argv.slice(2);
const parsed = parseGrantArgs(argv);
const envFile = "error" in parsed ? ".env.local" : parsed.envFile;
const fileEnv = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile)) : {};

runGrantTool(argv, {
  env: { ...fileEnv, ...process.env },
  log: (line) => console.log(line),
  openDb: async (url) => {
    // Wrapped by drizzle exactly as the server's connection is (src/lib/db/index.ts): drizzle makes json/jsonb
    // parameters pass through. A bare postgres-js client would JSON-encode the already-serialized payload again and
    // store the audit row as a jsonb STRING (found on staging, 2026-10-02).
    const client = drizzle(postgres(url, { prepare: false, max: 1 })).$client;
    return { db: fromPostgres(client), close: () => client.end({ timeout: 5 }) };
  },
  now: () => new Date(),
  operator: () => os.userInfo().username,
}).then(
  (code) => process.exit(code),
  (err: unknown) => {
    // Never print the connection string or a driver's raw message (it can carry the host); the code is enough.
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "unknown";
    console.error(`billing:grant: failed (${err instanceof Error ? err.name : "error"}, code ${code}); nothing after the last printed line was written.`);
    process.exit(1);
  },
);
