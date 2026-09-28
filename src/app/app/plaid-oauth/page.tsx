import type { Metadata } from "next";
import { Robin } from "@/components/mascot";
import { StandaloneShell } from "@/components/standalone-shell";
import { Badge, Stage } from "@/components/ui";

export const metadata: Metadata = { title: "Return to Budgts" };

/**
 * Web fallback for the native Plaid OAuth return (`https://<host>/app/plaid-oauth`). With the Budgts app installed, the
 * iOS universal link / Android app link (`/.well-known/*`, `src/lib/native-links.ts`) opens the app and this page is
 * never shown. It appears only when the link opens in a browser instead (the app is not installed, or the association
 * is not set up yet), so the user gets a clear next step instead of a blank or error page. The web flow's own return
 * page is `/plaid-oauth`, deliberately separate.
 */
export default function NativePlaidReturnPage() {
  return (
    <StandaloneShell>
      <div className="space-y-6">
        <Stage>
          <Robin mood="curious" size={88} />
        </Stage>
        <div className="space-y-2">
          <Badge tone="gray" icon="smartphone">
            Bank connection
          </Badge>
          <h1 className="px-figure text-ink">Return to the Budgts app</h1>
          <p className="text-base leading-6 text-muted">
            To finish connecting your bank, open the Budgts app on the phone you started on. If the app isn&apos;t
            installed, install Budgts from the App Store or Google Play, sign in, and connect your bank again.
          </p>
        </div>
      </div>
    </StandaloneShell>
  );
}
