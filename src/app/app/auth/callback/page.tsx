import type { Metadata } from "next";
import { StandaloneShell } from "@/components/standalone-shell";
import { AppSignInHandoff } from "./handoff";

export const metadata: Metadata = {
  title: "Open Budgts",
  robots: { index: false, follow: false },
  // the address carries a one-time sign-in code: never pass it on
  referrer: "no-referrer",
};

/**
 * Where the app's sign-in email links land (`https://<host>/app/auth/callback`,
 * the `emailRedirectTo` of mobile/lib/auth/sign-in-options.ts). Once the app's
 * universal links / app links are set up (`/.well-known/*`), a phone with the
 * app opens the app straight from the link and never shows this page. Until
 * then, and on a computer, the link opens here:
 *
 * - on a phone, one button hands the link to the app (`budgts://auth/callback`,
 *   carrying only its code or error: HANDOFF_PARAMS), which finishes the sign-in;
 * - on a computer, it says to open the email on the phone, because the link
 *   only works in the app that asked for it (its PKCE verifier is there). Web
 *   sign-in stays one tap away, for account deletion and the browser app.
 *
 * The page never reads the code: the server renders the same page for every
 * address, and the browser builds the hand-off link from its own location.
 */
export default function AppSignInReturnPage() {
  return (
    <StandaloneShell>
      <AppSignInHandoff />
    </StandaloneShell>
  );
}
