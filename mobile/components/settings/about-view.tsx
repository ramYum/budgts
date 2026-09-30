import { useMemo, useState } from "react";
import { PixelRatio, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { COLOR, ROLE } from "../../lib/brand/shared";
import type { LegalLink } from "../../lib/legal";
import { PixelFrame } from "../brand/pixel-frame";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { DOT, dotsPath } from "../kit/empty-state";
import { HubRow, HubSection } from "../kit/hub-list";
import { PageHeader } from "../kit/page-header";
import { RowsCard } from "./rows-card";

/** The web About page's facts (about/page.tsx): the roadmap tier, not a made-up semver. */
export const DETAILS: [string, string][] = [
  ["Version", "V1"],
  ["Bank connections", "Plaid"],
  ["Pixel type", "Dogica by Roberto Mocci · OFL"],
  ["Icons", "Pixelarticons · MIT"],
];

/** The brand on its stage (web `px-card` > `px-dots`, px-4 py-6): Crystal, a hairline, the name and the tagline. */
function BrandStage() {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const ratio = PixelRatio.get();
  const d = useMemo(() => (size ? dotsPath(size.width, size.height, ratio) : ""), [size, ratio]);
  function measure(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }
  return (
    <PixelFrame testID="about-stage" frame="px-card">
      <View
        onLayout={measure}
        style={{ alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 24 }}
        accessible
        accessibilityLabel="Budgts. Track, plan, grow."
      >
        {d ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
            <Svg width="100%" height="100%">
              <Path d={d} fill={DOT.color} />
            </Svg>
          </View>
        ) : null}
        <Robin scale={4} />
        <View style={{ height: 4, width: 80, backgroundColor: ROLE.hairline }} />
        <Text variant="pxTitle" color={ROLE.ink} style={{ marginTop: 8 }}>
          Budgts
        </Text>
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
    </PixelFrame>
  );
}

/**
 * About (web about/page.tsx): the brand on its stage, the line it stands for,
 * the facts behind it, and the legal pages once they're live (they open on
 * budgts.com, where they stay after the browser app retires).
 */
export function AboutView({
  onBack,
  legal,
  onOpen,
}: {
  onBack: () => void;
  legal: LegalLink[];
  onOpen: (url: string) => void;
}) {
  return (
    <View testID="about-view">
      <PageHeader title="About" onBack={onBack} />
      <View style={{ gap: 32 }}>
        <BrandStage />

        <View style={{ gap: 8 }}>
          <Text testID="about-lead" variant="pxFigure" color={ROLE.ink} accessibilityRole="header">
            A brighter way to budget.
          </Text>
          <Text variant="body" color={ROLE.muted}>
            Budgts helps you take control of your money with simple tools, clear insights and a little encouragement along
            the way.
          </Text>
        </View>

        <RowsCard pad={14} testID="about-details">
          {DETAILS.map(([label, value]) => (
            <View key={label} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
              <Text variant="body" color={ROLE.muted}>
                {label}
              </Text>
              <Text variant="listName" color={ROLE.ink} style={{ flexShrink: 1, textAlign: "right" }}>
                {value}
              </Text>
            </View>
          ))}
        </RowsCard>

        {legal.length > 0 ? (
          <HubSection title="Legal" testID="about-legal">
            {legal.map((l) => (
              <HubRow key={l.page} testID={l.testID} label={l.label} icon={l.icon} onPress={() => onOpen(l.url)} />
            ))}
          </HubSection>
        ) : null}
      </View>
    </View>
  );
}
