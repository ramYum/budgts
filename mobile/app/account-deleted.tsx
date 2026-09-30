import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { AccountDeletedView } from "../components/settings/account-deleted-view";
import { StandaloneShell } from "../components/settings/standalone-shell";
import { legalUrl } from "../lib/legal";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * Where a completed deletion lands, signed out (web /account-deleted). It reads nothing about any account: the user is
 * gone. The deletion screen passes what to say: `store=1` (a store subscription may still be running), `keeps=1` (a
 * billing record outlives the account), `legal=1` (the legal pages are live).
 */
export default function AccountDeletedScreen() {
  const router = useRouter();
  const { store, keeps, legal } = useLocalSearchParams<{ store?: string; keeps?: string; legal?: string }>();
  const privacy = legal === "1" ? legalUrl(API_BASE, "privacy") : null;
  return (
    <StandaloneShell>
      <AccountDeletedView
        store={store === "1"}
        keeps={keeps === "1"}
        privacyUrl={privacy ? `${privacy}#deleting-your-data` : null}
        openUrl={(url) => void WebBrowser.openBrowserAsync(url)}
        onDone={() => router.replace("/sign-in")}
      />
    </StandaloneShell>
  );
}
