import { Children, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { COLOR, hubTestId, ROLE, type IconName } from "../../lib/brand/shared";
import { IconTile } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { pressStyle } from "./press";
import { SectionHead } from "./section-head";
import { Chevron } from "./tiles";

/** A hub's group (web `HubSection`): the heading, then its rows in one card divided by 1px rules (`px-card px-rows`). */
export function HubSection({ title, children }: { title: string; children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View testID="hub-section" style={{ gap: 12 }}>
      <SectionHead title={title} />
      <PixelFrame frame="px-card" style={{ paddingHorizontal: 8, paddingVertical: 2 }}>
        {rows.map((row, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: COLOR.divider } : undefined}>
            {row}
          </View>
        ))}
      </PixelFrame>
    </View>
  );
}

/**
 * One destination (web `HubRow`): its icon, its name, what's there (a count, a setting), a chevron. The whole row is the
 * button, and goes to `href`; its test ids derive from `href` as the web's do (`hub-settings-profile`).
 */
export function HubRow({
  href,
  label,
  icon,
  value,
  go,
}: {
  href: string;
  label: string;
  icon: IconName;
  /** a quiet summary on the right ("2 goals", "Light") */
  value?: string | number | null;
  go: (href: string) => void;
}) {
  const testID = hubTestId(href);
  const shown = value !== undefined && value !== null ? String(value) : null;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={shown ? `${label}, ${shown}` : label}
      onPress={() => go(href)}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", columnGap: 16, paddingVertical: 8 },
        pressStyle(pressed),
      ]}
    >
      <IconTile name={icon} />
      <Text
        testID={`${testID}-label`}
        variant="listName"
        color={ROLE.ink}
        numberOfLines={1}
        style={{ flexGrow: 1, flexShrink: 0 }}
      >
        {label}
      </Text>
      {shown !== null ? (
        <Text
          testID={`${testID}-value`}
          variant="meta"
          color={ROLE.muted}
          numberOfLines={1}
          style={{ flexShrink: 1, minWidth: 0, fontVariant: ["tabular-nums"] }}
        >
          {shown}
        </Text>
      ) : null}
      <Chevron marginRight={-4} />
    </Pressable>
  );
}
