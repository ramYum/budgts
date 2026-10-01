import { View } from "react-native";
import { COLOR, ROLE, type IconName } from "../../lib/brand/shared";
import { Button } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { PageHeader } from "../kit/page-header";

/** The web page's seven steps (help/how-it-works/page.tsx), word for word. */
export const STEPS: { icon: IconName; heading: string; body: string }[] = [
  {
    icon: "bank",
    heading: "Connect your accounts",
    body: "Connect your bank and card accounts once. Budgts brings in your transactions, so you don't enter every purchase yourself.",
  },
  {
    icon: "receipt",
    heading: "Transactions arrive automatically",
    body: "New purchases show up on their own: taps, swipes and online orders. Manual entry is there for cash and anything your bank can't reach.",
  },
  {
    icon: "tag",
    heading: "Budgts sorts them for you",
    body: "Every purchase is filed into the right category. When Budgts isn't sure it asks instead of guessing, and learns from your answer.",
  },
  {
    icon: "bell",
    heading: "You review the exceptions",
    body: "The bell shows exactly what needs a look. Your answer usually covers that merchant from then on.",
  },
  {
    icon: "budgets",
    heading: "Set your budgets",
    body: "Tell Budgts how much to spend per category, once. It compares your real spending against that plan.",
  },
  {
    icon: "coins",
    heading: "See your Money Left",
    body: "Home shows income minus spending so far this month. It's a snapshot of the month's flow, not your savings balance.",
  },
  {
    icon: "insights",
    heading: "Track your progress",
    body: "As months add up you see spending trends, how much income you keep and how budgets are holding.",
  },
];

/**
 * How Budgts works (web help/how-it-works/page.tsx): the mental model, seven
 * numbered steps on a dotted thread, then Crystal offering the welcome guide.
 * Static, no data.
 */
export function HowItWorksView({ onBack, onGuide }: { onBack: () => void; onGuide: () => void }) {
  return (
    <View testID="how-it-works-view">
      <PageHeader title="How Budgts works" onBack={onBack} />
      <View style={{ gap: 24 }}>
        <View style={{ gap: 8 }}>
          <Text testID="how-it-works-lead" variant="pxFigure" color={ROLE.ink} accessibilityRole="header">
            You spend. Budgts keeps track.
          </Text>
          <Text variant="body" color={ROLE.muted}>
            {"Connect your accounts, spend normally, and Budgts organizes everything, so you don't have to."}
          </Text>
        </View>

        <PixelFrame testID="how-it-works-steps" frame="px-card" style={{ paddingHorizontal: 8, paddingVertical: 12 }}>
          {STEPS.map((s, i) => {
            const last = i === STEPS.length - 1;
            return (
              <View
                key={s.heading}
                testID="how-it-works-step"
                style={{ flexDirection: "row", gap: 12, paddingBottom: last ? 0 : 24 }}
                accessible
                accessibilityLabel={`Step ${i + 1}. ${s.heading}. ${s.body}`}
              >
                {/* the thread from one step to the next (`.px-rule-v`) */}
                {last ? null : <View style={{ position: "absolute", left: 15, top: 40, bottom: 0, width: 1, backgroundColor: COLOR.divider }} />}
                <PixelFrame frame="px-tile-ink" style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
                  <Text variant="tLabelStrong" color={COLOR.white} style={{ fontVariant: ["tabular-nums"] }}>
                    {String(i + 1).padStart(2, "0")}
                  </Text>
                </PixelFrame>
                <View style={{ flex: 1, minWidth: 0, gap: 4, paddingTop: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon name={s.icon} color={ROLE.ink} />
                    <Text variant="listName" color={ROLE.ink} style={{ flexShrink: 1 }}>
                      {s.heading}
                    </Text>
                  </View>
                  <Text variant="small" color={ROLE.muted}>
                    {s.body}
                  </Text>
                </View>
              </View>
            );
          })}
        </PixelFrame>

        <PixelFrame testID="how-it-works-guide" frame="px-card-raised" style={{ alignItems: "flex-start", gap: 16, padding: 12 }}>
          {/* the web's 80px Mascot (68 tall): the art at a whole 3px a cell, centred in the same box */}
          <View
            style={{ width: 80, height: 68, alignItems: "center", justifyContent: "center" }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Robin mood="happy" scale={3} />
          </View>
          <View style={{ alignSelf: "stretch" }}>
            <Text variant="listName" color={ROLE.ink}>
              Want Crystal to walk you through it?
            </Text>
            <Text variant="meta" color={ROLE.muted}>
              The welcome guide takes about a minute.
            </Text>
          </View>
          <Button testID="how-it-works-open-guide" arrow onPress={onGuide}>
            Open the welcome guide
          </Button>
        </PixelFrame>
      </View>
    </View>
  );
}
