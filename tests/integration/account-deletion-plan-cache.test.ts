/**
 * A backend's CACHED foreign-key lookup plans must not decide how long a 25k-row Path B delete takes.
 *
 * Reproduced on staging (intermittent 41-46 s runs of the 25k Path B test, against 2.4-5 s normally):
 * `transactions` has two self-referencing foreign keys (transfer_pair_id, duplicate_of_id, ON DELETE SET NULL).
 * Postgres runs one lookup per deleted row for each. Those lookups are plans cached PER BACKEND: after five
 * executions it may switch to a generic plan, chosen with whatever the table looked like at that moment — and it is
 * not re-planned when the table later grows. If a pooled backend ran a few small deletes while `transactions` was
 * physically ONE page (a sequential scan is then the cheapest plan), it keeps that plan, and its next 25,000-row
 * delete does 2 x 25,000 sequential scans: ~20 s per trigger, ~40 s total — the same pathology the indexes fixed,
 * back again by a stale plan. It needs a physically tiny table, which is why it looked like random noise.
 * (Measured with the table vacuumed to one page: priming with 0-2 small deletes -> 0.5 s; 3 or more -> 39-41 s;
 * `discard plans` on that same backend -> 0.5 s again.)
 *
 * This test builds the same state deterministically on ONE dedicated backend (a session-pinned connection) without
 * depending on the table's physical size, which background vacuum timing makes unrepeatable: it primes the backend
 * with three small deletes run with index scans DISABLED, so the lookups cache sequential-scan plans (six executions,
 * past the five-plan threshold), then grows the table to 25,000 rows and deletes through the real store under normal
 * settings. Without `discard plans` at the start of the delete transaction this took ~43 s.
 */
import { afterEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { createDeletionStore } from "@/lib/account/deletion-store";
import { adminSupabase } from "@/lib/supabase/admin";
import { client as pg, categoryIdByName, mainAccountId } from "./_db";

const admin = adminSupabase();
const cleanupIds: string[] = [];
class Rollback extends Error {}

afterEach(async () => {
  for (const id of cleanupIds.splice(0)) await admin.auth.admin.deleteUser(id, false).catch(() => {});
}, 60_000);

async function makeUser() {
  const { data, error } = await admin.auth.admin.createUser({ email: `itest-plan+${crypto.randomUUID()}@example.test`, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  const userId = data.user.id;
  cleanupIds.push(userId);
  const accountId = await mainAccountId(userId);
  const categoryId = await categoryIdByName(userId, "Food / Groceries");
  const seed = (n: number) =>
    pg.unsafe(
      `insert into public.transactions (user_id, account_id, category_id, amount, direction, occurred_at, description, source)
       select $1, $2, $3, 100 + (g % 900), 'debit', now() - (g || ' minutes')::interval, 'itest bulk ' || g, 'manual'
       from generate_series(1, ${n}) g`,
      [userId, accountId, categoryId],
    );
  return { userId, seed };
}

describe("account deletion — cached foreign-key plans", () => {
  it("a backend holding cached sequential-scan lookup plans still deletes a 25,000-transaction user in seconds", async () => {
    const tiny = await makeUser();
    await tiny.seed(2);
    const big = await makeUser();

    // One dedicated connection = one backend for priming AND deletion (session-pinned on the direct/session pooler).
    const conn = postgres(process.env.DIRECT_URL!, { max: 1, prepare: false });
    try {
      await conn.unsafe("discard all"); // a clean starting point: nothing cached from an earlier session on this backend

      // Prime: three small deletes (each fires both self-FK lookups twice -> six executions, past the five-plan
      // threshold) planned with index scans off, so the cached lookup plans are sequential scans. Each transaction is
      // rolled back and its SET LOCAL settings end with it — the plans stay cached in the backend regardless.
      for (let i = 0; i < 3; i++) {
        await conn
          .begin(async (tx) => {
            await tx`set local enable_indexscan = off`;
            await tx`set local enable_bitmapscan = off`;
            await tx`set local enable_indexonlyscan = off`;
            await tx`delete from public.transactions where user_id = ${tiny.userId}`;
            throw new Rollback();
          })
          .catch((e) => {
            if (!(e instanceof Rollback)) throw e;
          });
      }

      await big.seed(25_000);

      const store = createDeletionStore({ db: drizzle(conn, { schema }) });
      const started = Date.now();
      const { deleted } = await store.deleteOwnedData(big.userId);
      const elapsedMs = Date.now() - started;
      console.info(`[plan-cache] 25k delete on a backend with cached sequential-scan lookup plans: ${elapsedMs}ms`);

      expect(deleted.transactions).toBe(25_000);
      // Healthy: ~1-3 s (mostly round trips). The stale-plan pathology: ~43 s.
      expect(elapsedMs, "a cached sequential-scan plan made the foreign-key lookups O(rows) each").toBeLessThan(10_000);
    } finally {
      await conn.end();
    }
  }, 180_000);
});
