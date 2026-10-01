import { useState } from "react";
import { useRouter, type Href } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { SettingsView } from "../../../../../components/settings/settings-view";
import { useBack } from "../../../../../components/settings/use-back";
import { Screen } from "../../../../../components/shell/screen";
import { authFetch } from "../../../../../lib/auth/api";
import { useAuth } from "../../../../../lib/auth/auth-context";
import { exportTransactions } from "../../../../../lib/export/export-transactions";
import { useHub } from "../../../../../lib/status/use-hub";

/** Settings: the web's /settings hub (components/settings/settings-view.tsx). */
export default function SettingsScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { hub, notice, refresh } = useHub();
  const onBack = useBack("/more");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function onExport() {
    setExporting(true);
    setExportError(null);
    const outcome = await exportTransactions({
      fetchCsv: () => authFetch("/api/mobile/export/transactions", session),
      save: (name, text) => {
        const file = new File(Paths.cache, name);
        if (file.exists) file.delete();
        file.create();
        file.write(text);
        return file.uri;
      },
      share: (uri) => Sharing.shareAsync(uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text", dialogTitle: "Export transactions" }),
    });
    setExporting(false);
    if (outcome.status === "error") setExportError(outcome.message);
  }

  return (
    <Screen name="settings" notice={notice} onRetry={() => void refresh()}>
      <SettingsView
        email={session?.user.email ?? ""}
        hub={hub}
        go={(path) => router.push(path as Href)}
        onBack={onBack}
        onExport={() => void onExport()}
        exporting={exporting}
        exportError={exportError}
        onSignOut={() => void signOut()}
      />
    </Screen>
  );
}
