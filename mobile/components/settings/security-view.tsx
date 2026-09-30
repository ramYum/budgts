import { Pressable, View } from "react-native";
import { COLOR, ROLE, type IconName } from "../../lib/brand/shared";
import { IconTile } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { PageHeader } from "../kit/page-header";
import { RowsCard } from "./rows-card";

/**
 * The web Security page's facts (settings/security/page.tsx), word for word:
 * nothing here that isn't true of the app's architecture.
 */
export const SECURITY_FACTS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "key",
    title: "Your bank login never reaches Budgts",
    body: "Plaid hands Budgts a secure token, never your username or password.",
  },
  {
    icon: "security",
    title: "Only you can see your data",
    body: "Every record is scoped to your account at the database level, so no one else can see it.",
  },
  {
    icon: "eye",
    title: "Read-only access",
    body: "Budgts can read accounts and transactions to help you budget. It can't send money, pay or transfer.",
  },
];

/** Security (web settings/security/page.tsx): plain-language reassurance, each fact ticked. */
export function SecurityView({ onBack, onHowItWorks }: { onBack: () => void; onHowItWorks: () => void }) {
  return (
    <View testID="security-view">
      <PageHeader title="Security" onBack={onBack} />
      <View style={{ gap: 24 }}>
        <PixelFrame testID="security-lead" frame="px-card-raised" style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 8 }}>
          <PixelFrame
            frame="px-tile-growth"
            style={{ width: 56, height: 56, alignItems: "center", justifyContent: "center" }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Icon name="shield" color={ROLE.pos} />
          </PixelFrame>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="pxFigure" color={ROLE.ink} accessibilityRole="header">
              Your connections are protected.
            </Text>
            <Text variant="body" color={ROLE.muted}>
              {"Here's what that means in practice."}
            </Text>
          </View>
        </PixelFrame>

        <RowsCard pad={10} testID="security-facts">
          {SECURITY_FACTS.map((f) => (
            <View key={f.title} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }} accessible accessibilityLabel={`${f.title}. ${f.body} True.`}>
              <IconTile name={f.icon} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="listName" color={ROLE.ink}>
                  {f.title}
                </Text>
                <Text variant="body" color={ROLE.muted}>
                  {f.body}
                </Text>
              </View>
              <PixelFrame
                frame="px-check"
                state="[data-state='done']"
                style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="check" size={12} color={COLOR.white} />
              </PixelFrame>
            </View>
          ))}
        </RowsCard>

        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
          <Icon name="bank" size={12} color={ROLE.muted} />
          <Text variant="meta" color={ROLE.muted}>
            Bank connections by Plaid ·
          </Text>
          <Pressable testID="security-how-it-works" accessibilityRole="link" onPress={onHowItWorks} hitSlop={12}>
            {({ pressed }) => (
              <Text variant="metaStrong" color={ROLE.ink} style={pressed ? { textDecorationLine: "underline" } : null}>
                How Budgts works
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
