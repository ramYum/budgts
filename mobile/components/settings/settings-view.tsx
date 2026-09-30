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
    <View testID="settings-view">
      <PageHeader title="Settings" onBack={onBack} />
      <View style={{ gap: 32 }}>
        <HubSection title="Your account">
          <HubRow testID="settings-profile" label="Profile" icon="profile" value={email} onPress={() => go("/settings/profile")} />
          <HubRow testID="settings-security" label="Security" icon="security" onPress={() => go("/settings/security")} />
          <HubRow testID="settings-delete-account" label="Delete account" icon="user-x" onPress={() => go("/delete-account")} />
        </HubSection>

        <HubSection title="Your money">
          <HubRow testID="settings-categories" label="Categories" icon="categories" value={hub?.categories} onPress={() => go("/settings/categories")} />
          <HubRow testID="settings-budgets" label="Budgets" icon="budgets" value={hub ? `${hub.budgets} set` : null} onPress={() => go("/budgets")} />
          <HubRow testID="settings-goals" label="Savings goals" icon="goals" value={hub?.goals} onPress={() => go("/goals")} />
        </HubSection>

        <HubSection title="Connected banks">
          <HubRow
            testID="settings-connected-banks"
            label="Connected banks"
            icon="bank"
            value={hub && hub.banks !== null ? plural(hub.banks, "bank", "banks") : null}
            onPress={() => go("/connected-banks")}
          />
          <HubRow testID="settings-accounts" label="Manage accounts" icon="accounts" value={hub?.accounts} onPress={() => go("/accounts")} />
        </HubSection>

        <HubSection title="App">
          <HubRow testID="settings-appearance" label="Appearance" icon="appearance" value="Light" onPress={() => go("/settings/appearance")} />
          <HubRow testID="settings-help" label="Help" icon="help" onPress={() => go("/help")} />
          <HubRow testID="settings-about" label="About Budgts" icon="about" value="V1" onPress={() => go("/about")} />
        </HubSection>

        <View style={{ gap: 12 }}>
          <SectionHead title="Data" />
          <PixelFrame testID="settings-export" frame="px-card" style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
            <IconTile name="download" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="listName" color={ROLE.ink}>
                Export transactions
              </Text>
              <Text variant="meta" color={ROLE.muted}>
                All of them, as a CSV file.
              </Text>
            </View>
            <Button testID="settings-export-button" variant="secondary" icon="download" loading={exporting} onPress={onExport}>
              Export
            </Button>
          </PixelFrame>
          {exportError ? (
            <Text testID="settings-export-error" variant="meta" color={COLOR.signalInk} accessibilityRole="alert">
              {exportError}
            </Text>
          ) : null}
        </View>

        <Button testID="settings-sign-out" variant="danger" size="lg" icon="sign-out" onPress={onSignOut}>
          Sign out
        </Button>
      </View>
    </View>
  );
}
