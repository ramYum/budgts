import { useState, type ReactNode } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ROLE, SPACE } from "../../lib/brand/shared";
import { textStyle } from "../../lib/brand/type";
import { GUIDE_COPY, type TourStepId } from "../../lib/tour/shared";
import { Button } from "../brand/controls";
import { Text } from "../brand/text";
import { GuideScene } from "./scenes";
import { TourCard } from "./tour-card";
import { TourWizard, type WizardStep } from "./tour-wizard";

/**
 * The welcome guide's second half, and the whole guide on a replay from More (web
 * src/app/(app)/tour/tour-wizard-content.tsx): the cards the server sends, captured once so a refresh mid-guide never
 * reshuffles them. Skip (any card but the last) and the last card's button both mark the guide seen (`onFinish`), which
 * resolves to an error message or null once done. The bank card's connect action is `bank` (native Plaid Link).
 */
export function TourView({
  stepIds,
  offset,
  totalVisible,
  currency,
  bank,
  onFinish,
  onHowItWorks,
}: {
  stepIds: TourStepId[];
  offset: number;
  totalVisible: number;
  /** the user's currency, for the scenes' sample amounts */
  currency: string;
  /** the bank card's "Connect a bank" (label from the guide's words) */
  bank: (label: string) => ReactNode;
  onFinish: () => Promise<string | null>;
  /** opens How Budgts Works (Help's page on a replay, its first-run route while the guide gates the app) */
  onHowItWorks: () => void;
}) {
  const [fixedStepIds] = useState(stepIds);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  async function finish() {
    if (finishing) return;
    setFinishing(true);
    setError(null);
    const message = await onFinish();
    if (message !== null) {
      setError(message);
      setFinishing(false);
    }
  }

  const steps: WizardStep[] = fixedStepIds.map((id, i) => ({
    id,
    label: GUIDE_COPY[id].label,
    render: (nav) => {
      const copy = GUIDE_COPY[id];
      const shared = {
        heading: copy.heading,
        body: copy.body,
        scene: <GuideScene id={id} currency={currency} />,
        dotCount: totalVisible,
        dotIndex: offset + i,
        onBack: nav.isFirst ? undefined : nav.back,
        onSkip: nav.isLast ? undefined : () => void finish(),
        skipDisabled: finishing,
      };
      const next = (
        <Button testID="tour-primary" arrow onPress={nav.next}>
          {copy.cta}
        </Button>
      );

      switch (id) {
        case "bank":
          return (
            <TourCard
              {...shared}
              media={bank(copy.cta)}
              secondary={
                <Pressable
                  testID="tour-by-hand"
                  accessibilityRole="button"
                  accessibilityLabel="I'll add things by hand"
                  onPress={nav.next}
                  hitSlop={4}
                  style={({ pressed }) => ({ minHeight: 36, justifyContent: "center", paddingHorizontal: 8, transform: pressed ? [{ scale: 0.98 }] : [] })}
                >
                  {({ pressed }) => (
                    <Text variant="formLabel" color={pressed ? ROLE.ink : ROLE.muted}>
                      I&apos;ll add things by hand →
                    </Text>
                  )}
                </Pressable>
              }
            />
          );
        case "done":
          return (
            <TourCard
              {...shared}
              primary={
                <Button testID="tour-primary" arrow={!finishing} loading={finishing} onPress={() => void finish()}>
                  {copy.cta}
                </Button>
              }
              footnote={
                // The line's one link: the whole line is its touch target, grown to 44pt tall (a 16px line of words
                // alone is too small to hit), drawn exactly as the web's sentence with its red link words, still when
                // pressed (the web's link has no press effect). A screen reader reads the sentence, then "link".
                <Pressable
                  testID="tour-how-it-works"
                  accessibilityRole="link"
                  onPress={onHowItWorks}
                  hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
                >
                  <RNText style={[textStyle("caption"), { color: ROLE.muted, textAlign: "center" }]}>
                    {"Replay this guide, or read "}
                    <RNText style={{ fontFamily: textStyle("tLabel").fontFamily, color: ROLE.neg }}>How Budgts Works</RNText>
                    {", anytime from Help."}
                  </RNText>
                </Pressable>
              }
            />
          );
        case "currency":
          // never on the tour: onboarding owns it
          return null;
        default:
          // "crystal" | "welcome" | "auto-capture" (a replay's intro) | "auto-sort" | "money-left" | "plan"
          return <TourCard {...shared} primary={next} />;
      }
    },
  }));

  return (
    <View style={{ flex: 1, backgroundColor: ROLE.bg }}>
      <TourWizard steps={steps} offset={offset} total={totalVisible} />
      {error ? (
        // the web's fixed alert across the top (`fixed inset-x-0 top-4 px-6 text-center text-sm text-neg`)
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: insets.top + 16, paddingHorizontal: SPACE.gutter }}>
          <Text testID="tour-error" variant="body" color={ROLE.neg} accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 20, textAlign: "center" }}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
