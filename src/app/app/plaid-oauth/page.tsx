import type { Metadata } from "next";

export const metadata: Metadata = { title: "Return to Budgts" };

/**
 * Web fallback for the native Plaid OAuth return (`https://<host>/app/plaid-oauth`). With the Budgts app installed, the
 * iOS universal link / Android app link (`/.well-known/*`, `src/lib/native-links.ts`) opens the app and this page is never
 * shown. It appears only when the link opens in a browser instead — e.g. the app is not installed, or the association is not
 * set up yet — so the user gets a clear next step instead of a blank or error page. The web flow's return page is
 * `/plaid-oauth`, deliberately separate.
 */
export default function NativePlaidReturnPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-6 py-12">
      <h1 className="text-xl font-semibold text-heading">Return to the Budgts app</h1>
      <p className="text-sm text-muted">
        To finish connecting your bank, open the Budgts app on the phone you started on. If the app isn&apos;t installed, install
        Budgts from the App Store or Google Play, sign in, and connect your bank again.
      </p>
    </main>
  );
}
