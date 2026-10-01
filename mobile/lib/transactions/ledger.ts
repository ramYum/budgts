import type { LoadErrorKind, LoadState } from "../api/load";
import { mergePages, type TransactionsPage } from "./transactions-api";

type Settled<T> = Exclude<LoadState<T>, { status: "loading" }>;

/** Rows per request: the endpoint's maximum, so a heavy month needs the fewest round trips. */
export const LEDGER_PAGE = 100;

export type FetchPage = (cursor: string | null) => Promise<Settled<TransactionsPage>>;

export type LedgerProgress =
  | { status: "error"; kind: LoadErrorKind; message: string }
  /**
   * `cursor` is where the next page starts; null once the month is complete. `restError` is a later page that failed, and
   * `restKind` why (a `rejected` later page is a cursor the server refused, e.g. 422 invalid_cursor: start over).
   */
  | { status: "ready"; page: TransactionsPage; cursor: string | null; restError: string | null; restKind?: LoadErrorKind };

/**
 * The whole month's ledger, keyset page after keyset page, the way the web page reads every row of the month
 * (`fetchAllRows`) before it filters: the search, the kind filter and each day's net all cover every row, not only the
 * first page. `onProgress` hears each page as it lands, so the first rows show while the rest arrive; `isCurrent` stops a
 * superseded run (a new month, a newer refresh) without another request. A later page that fails keeps the rows already
 * loaded and says so, with the cursor to resume from.
 */
export async function loadLedger(
  fetchPage: FetchPage,
  opts: { from?: { page: TransactionsPage; cursor: string }; onProgress?: (p: LedgerProgress) => void; isCurrent: () => boolean },
): Promise<LedgerProgress | null> {
  let page: TransactionsPage | null = opts.from?.page ?? null;
  let cursor: string | null = opts.from?.cursor ?? null;

  for (;;) {
    if (!opts.isCurrent()) return null;
    const r = await fetchPage(cursor);
    if (!opts.isCurrent()) return null;
    let out: LedgerProgress;
    if (r.status === "error") {
      out = page
        ? { status: "ready", page, cursor, restError: r.message, restKind: r.kind }
        : { status: "error", kind: r.kind, message: r.message };
    } else {
      page = page ? mergePages(page, r.data) : r.data;
      cursor = r.data.nextCursor;
      out = { status: "ready", page, cursor, restError: null };
    }
    opts.onProgress?.(out);
    if (out.status === "error" || out.restError !== null || out.cursor === null) return out;
  }
}
