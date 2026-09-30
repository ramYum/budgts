/**
 * Settings → Export transactions (web: `<a href="/api/export/transactions" download>`):
 * the whole history as the same CSV the web builds (`GET /api/mobile/export/transactions`),
 * saved to the app's cache and handed to the system share sheet. Every failure is a
 * plain-language message (never server, OS or network text); no partial file is shared.
 */
export type ExportOutcome = { status: "ok" } | { status: "error"; message: string };

export const EXPORT_FAILED = "Couldn't export your transactions. Check your connection and try again.";

/** The server's file name (`attachment; filename="budgts-transactions-2026-09-30.csv"`), or a safe default. */
export function exportFileName(disposition: string | null): string {
  const m = disposition?.match(/filename="([\w.-]+\.csv)"/);
  return m?.[1] ?? "budgts-transactions.csv";
}

export async function exportTransactions(deps: {
  fetchCsv: () => Promise<Response>;
  /** writes the text to a file and returns its uri */
  save: (name: string, text: string) => string;
  share: (uri: string) => Promise<void>;
}): Promise<ExportOutcome> {
  try {
    const res = await deps.fetchCsv();
    if (!res.ok) return { status: "error", message: EXPORT_FAILED };
    const text = await res.text();
    await deps.share(deps.save(exportFileName(res.headers.get("Content-Disposition")), text));
    return { status: "ok" };
  } catch {
    return { status: "error", message: EXPORT_FAILED };
  }
}
