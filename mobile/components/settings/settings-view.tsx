import { View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { plural, type MobileHub } from "../../lib/status/status-api";
import { Button, IconTile } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { HubRow, HubSection } from "../kit/hub-list";
import { PageHeader } from "../kit/page-header";
import { SectionHead } from "../kit/section-head";

/**
 * Settings (web src/app/(app)/(dashboard)/settings/page.tsx), in the order a
 * phone reads it: Your account, Your money, Connected banks, App, Data, then
 * Sign out. Every row is a real destination. No plan status here: the web
 * has none, and subscriptions arrive with Phase 4.
 */
export function SettingsView({
  email,
  hub,
  go,
  onBack,
  onExport,
  exporting,
  exportError,
  onSignOut,
}: {
  email: string;
  hub: MobileHub | null;
  go: (path: string) => void;
  onBack: () => void;
  onExport: () => void;
  exporting: boolean;
  exportError: string | null;
  onSignOut: () => void;
}) {
  return (
    <View>
      <PageHeader title="Settings" onBack={onBack} />
      <View style={{ gap: 32 }}>
        <HubSection title="Your account">
          <HubRow href="/settings/profile" label="Profile" icon="profile" value={email} go={go} />
          <HubRow href="/settings/security" label="Security" icon="security" go={go} />
          <HubRow href="/settings/delete-account" label="Delete account" icon="user-x" go={go} />
        </HubSection>

        <HubSection title="Your money">
          <HubRow href="/settings/categories" label="Categories" icon="categories" value={hub?.categories} go={go} />
          <HubRow href="/budgets" label="Budgets" icon="budgets" value={hub ? `${hub.budgets} set` : null} go={go} />
          <HubRow href="/goals" label="Savings goals" icon="goals" value={hub?.goals} go={go} />
        </HubSection>

        <HubSection title="Connected banks">
          <HubRow href="/connected-banks" label="Connected banks"
            icon="bank"
            value={hub && hub.banks !== null ? plural(hub.banks, "bank", "banks") : null} go={go}
          />
          <HubRow href="/accounts" label="Manage accounts" icon="accounts" value={hub?.accounts} go={go} />
        </HubSection>

        <HubSection title="App">
          <HubRow href="/settings/appearance" label="Appearance" icon="appearance" value="Light" go={go} />
          <HubRow href="/help" label="Help" icon="help" go={go} />
          <HubRow href="/about" label="About Budgts" icon="about" value="V1" go={go} />
        </HubSection>

        <View style={{ gap: 12 }}>
          <SectionHead title="Data" />
          <PixelFrame frame="px-card" style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
            <IconTile name="download" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="listName" color={ROLE.ink}>
                Export transactions
              </Text>
              <Text variant="meta" color={ROLE.muted}>
                All of them, as a CSV file.
              </Text>
            </View>
            <Button variant="secondary" icon="download" loading={exporting} onPress={onExport}>
              Export
            </Button>
          </PixelFrame>
          {exportError ? (
            <Text variant="meta" color={COLOR.signalInk} accessibilityRole="alert">
              {exportError}
            </Text>
          ) : null}
        </View>

        <Button variant="danger" size="lg" icon="sign-out" onPress={onSignOut}>
          Sign out
        </Button>
      </View>
    </View>
  );
}
