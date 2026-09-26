/** Passed to a page's `select(columns, { count })`: `"exact"` on the first
 * page only, so the response carries the total match count. */
export type RowCount = "exact" | undefined;

type Page<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

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
 * builder instance across pages), pass `count` to its select
 * (`.select(columns, { count })`), and carry a deterministic `.order(...)`
 * on a unique column (`id` — never a timestamp column alone, which can have
 * many rows sharing the exact same value from one bulk insert; pagination
 * across ties on a non-unique sort key is non-deterministic between separate
 * requests and can silently skip or repeat rows across the page boundary).
 *
 * Speed: the first page also returns the total count, so every remaining
 * page is requested at once — two round trips for any size instead of one
 * per 1000 rows (a heavy feed's 6-month Home window was 8 in a row). The
 * unique order fixes each page's rows, so the result is the same rows in the
 * same order. If the last page still comes back full (rows landed after the
 * count), it keeps paging one page at a time until a short page, exactly as
 * a purely sequential read would.
 */
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number, count: RowCount) => PromiseLike<Page<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const rowsOf = (page: Page<T>): T[] => {
    if (page.error) throw new Error(page.error.message);
    return page.data ?? [];
  };

  const first = await buildPage(0, pageSize - 1, "exact");
  const out = [...rowsOf(first)];
  if (out.length < pageSize) return out;
  if (first.count == null) {
    throw new Error("fetchAllRows: the first page came back without a count; its select() must pass { count }");
  }

  let from = pageSize;
  let lastPageLength = out.length;
  while (lastPageLength === pageSize) {
    const pages = from < first.count ? Math.ceil((first.count - from) / pageSize) : 1;
    const batch = await Promise.all(
      Array.from({ length: pages }, (_, i) => {
        const start = from + i * pageSize;
        return buildPage(start, start + pageSize - 1, undefined);
      }),
    );
    for (const page of batch) {
      const rows = rowsOf(page);
      out.push(...rows);
      lastPageLength = rows.length;
    }
    from += pages * pageSize;
  }
  return out;
}
