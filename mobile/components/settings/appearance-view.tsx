import { View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { IconTile } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { PageHeader } from "../kit/page-header";
import { Badge } from "../kit/tiles";

/**
 * Appearance (web settings/appearance/page.tsx): the one true state, Light,
 * and no toggle that would do nothing, since dark mode isn't built.
 */
export function AppearanceView({ onBack }: { onBack: () => void }) {
  return (
    <View testID="appearance-view">
      <PageHeader title="Appearance" onBack={onBack} />
      <PixelFrame testID="appearance-light" frame="px-card" style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 8 }}>
        <IconTile name="appearance" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="listName" color={ROLE.ink}>
            Light
          </Text>
          <Text variant="meta" color={ROLE.muted}>
            {"Dark mode isn't available yet."}
          </Text>
        </View>
        <View>
          <Badge tone="ink" testID="appearance-active">
            Active
          </Badge>
        </View>
      </PixelFrame>
    </View>
  );
}
