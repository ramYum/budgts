import { Pressable, View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { plural, type MobileHub } from "../../lib/status/status-api";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { HubRow, HubSection } from "../kit/hub-list";
import { PageHeader } from "../kit/page-header";
import { pressStyle } from "../kit/press";

/** The welcome-guide replay card (web /more): Crystal on a wash tile, the words, a red play tile. */
function PlayGuide({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      testID="more-play-guide"
      accessibilityRole="link"
      accessibilityLabel="Play welcome guide. A one-minute tour with Crystal."
      onPress={onPress}
    >
      {({ pressed }) => (
        <PixelFrame frame="px-card-raised" style={[{ flexDirection: "row", alignItems: "center", gap: 16, padding: 8 }, pressStyle(pressed)]}>
          <PixelFrame frame="px-tile-wash" style={{ width: 56, height: 56, alignItems: "center", justifyContent: "center" }}>
            <Robin scale={2} />
          </PixelFrame>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="listName" color={ROLE.ink} style={pressed ? { textDecorationLine: "underline" } : null}>
              Play welcome guide
            </Text>
            <Text variant="meta" color={ROLE.muted}>
              A one-minute tour with Crystal.
            </Text>
          </View>
          <PixelFrame frame="px-tile-accent" style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
            <Icon name="play" color={COLOR.white} />
          </PixelFrame>
        </PixelFrame>
      )}
    </Pressable>
  );
}

/**
 * More (web src/app/(app)/(dashboard)/more/page.tsx): the secondary hub,
 * everything outside Home, Budgets and Activity. The web's "Install app" card
 * is a browser install prompt with no meaning in an installed app, so it is
 * not here.
 */
export function MoreView({ hub, go }: { hub: MobileHub | null; go: (path: string) => void }) {
  return (
    <View>
      <PageHeader title="More" />
      <View style={{ gap: 32 }}>
        <PlayGuide onPress={() => go("/tour")} />

        <HubSection title="Your money">
          <HubRow href="/goals" label="Savings goals" icon="goals" value={hub ? plural(hub.goals, "goal", "goals") : null} go={go} />
          <HubRow href="/accounts" label="Accounts" icon="accounts" value={hub?.accounts} go={go} />
          <HubRow href="/insights" label="Insights" icon="insights" go={go} />
        </HubSection>

        <HubSection title="Banks & settings">
          <HubRow href="/connected-banks" label="Connected banks"
            icon="bank"
            value={hub && hub.banks !== null ? plural(hub.banks, "bank", "banks") : null} go={go}
          />
          <HubRow href="/settings" label="Settings" icon="settings" go={go} />
        </HubSection>

        <HubSection title="Help">
          <HubRow href="/help" label="Help" icon="help" go={go} />
          <HubRow href="/about" label="About Budgts" icon="about" value="V1" go={go} />
        </HubSection>

        <View
          style={{ alignItems: "center", gap: 12, paddingTop: 16, paddingBottom: 8 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Robin scale={2} />
          {/* each run its own Text, so Dogica's spaces narrow as the web's word-spacing does */}
          <Text variant="pxTag" color={ROLE.muted}>
            <Text variant="pxTag" color={ROLE.muted}>
              {"Track "}
            </Text>
            <Text variant="pxTag" color={COLOR.signal}>
              :
            </Text>
            <Text variant="pxTag" color={ROLE.muted}>
              {" Plan "}
            </Text>
            <Text variant="pxTag" color={COLOR.signal}>
              :
            </Text>
            <Text variant="pxTag" color={ROLE.muted}>
              {" Grow"}
            </Text>
          </Text>
        </View>
      </View>
    </View>
  );
}
