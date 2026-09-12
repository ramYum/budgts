/**
 * Re-run the deterministic categorization evidence chain (design §18) over a
 * user's still-uncategorised bank transactions and fill the ones it can now
 * resolve. Used for:
 *  - the pre-existing backlog (rows that landed before the chain improved), and
 *  - picking up `MERCHANT_KNOWLEDGE` additions without a re-sync.
 *
 * Safe to run repeatedly:
 *  - only touches `source='bank' AND category_id IS NULL AND user_categorized
 *    = false AND removed_at IS NULL AND is_transfer = false` rows;
 *  - the UPDATE re-checks `category_id IS NULL AND user_categorized = false`;
 *  - leaves `user_categorized = false` (this is an automatic assignment).
 *
 * Runs as the DB role (RLS-bypassed), so every query filters `user_id`
 * explicitly — the documented service-role exception (`docs/conventions.md`).
 */
import { and, eq, isNull } from "drizzle-orm";
import { categories, transactions } from "@/lib/db/schema";
import { buildCategoryLookup } from "./category-map";
import { buildResolveCategory, loadMerchantRules } from "./merchant-rules";
import type { PlaidDb } from "./sync-store";
import { UnknownPfcPrimaryError } from "./category-map";

// A user's uncategorized backlog can run into the thousands (confirmed in
// production: 7,000+ rows after a large historical import landed). One
// sequential awaited UPDATE per row at that scale risks the server action
// timing out. Each row's resolve+update is independent, so bound the
// concurrency instead of running them one at a time.
const CONCURRENCY = 25;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function recategorizeUncategorizedBankTxns(
  db: PlaidDb,
  userId: string,
): Promise<{ updated: number }> {
  const [rules, cats] = await Promise.all([
    loadMerchantRules(db, userId),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, userId)),
  ]);

  const resolveCategory = buildResolveCategory({
    merchantRules: rules,
    categoryLookup: buildCategoryLookup(cats.map((c) => [c.name, c.id] as const)),
  });

  const rows = await db
    .select({
      id: transactions.id,
      merchantEntityId: transactions.merchantEntityId,
      merchantName: transactions.merchantName,
      description: transactions.description,
      primary: transactions.plaidCategoryPrimary,
      detailed: transactions.plaidCategoryDetailed,
      confidence: transactions.plaidPfcConfidence,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.source, "bank"),
        isNull(transactions.categoryId),
        eq(transactions.userCategorized, false),
        isNull(transactions.removedAt),
        eq(transactions.isTransfer, false),
      ),
    );

  let updated = 0;
  for (const batch of chunk(rows, CONCURRENCY)) {
    const counts = await Promise.all(
      batch.map(async (r) => {
        let categoryId: string | null = null;
        try {
          categoryId = resolveCategory({
            merchantEntityId: r.merchantEntityId,
            merchantName: r.merchantName,
            description: r.description,
            primary: r.primary,
            detailed: r.detailed,
            confidence: r.confidence,
          });
        } catch (e) {
          if (!(e instanceof UnknownPfcPrimaryError)) throw e;
          categoryId = null;
        }
        if (!categoryId) return 0;

        const done = await db
          .update(transactions)
          .set({ categoryId })
          .where(
            and(
              eq(transactions.id, r.id),
              eq(transactions.userId, userId),
              isNull(transactions.categoryId),
              eq(transactions.userCategorized, false),
            ),
          )
          .returning({ id: transactions.id });
        return done.length;
      }),
    );
    updated += counts.reduce((a, b) => a + b, 0);
  }

  return { updated };
}
