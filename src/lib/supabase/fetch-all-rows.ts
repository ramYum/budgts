/**
 * Fetches every row a Supabase query matches, paginating past PostgREST's
 * default 1000-row response cap. Any query feeding a financial total
 * (rollup, budget-vs-actual, trend, CSV export, "needs a category") MUST
 * use this instead of awaiting the query builder directly — a user with
 * more than 1000 matching rows in the queried window (a real, confirmed
 * case: a heavy Plaid feed) otherwise silently gets an arbitrary subset of
 * their own data, with no error and no warning. Root-caused 2026-09-14: a
 * manually-entered income transaction went missing from Home's Money Left
 * because that month had 1,209 bank rows and the unbounded query quietly
 * returned only 1,000 of them.
 *
 * `buildPage` must build a FRESH query each call (not reuse one query
 * builder instance across pages) and that query MUST already carry a
 * deterministic `.order(...)` on a unique column (`id` — never a
 * timestamp column, which can have many rows sharing the exact same value
 * from one bulk insert; pagination across ties on a non-unique sort key is
 * non-deterministic between separate requests and can silently skip or
 * repeat rows across the page boundary).
 */
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    out.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
