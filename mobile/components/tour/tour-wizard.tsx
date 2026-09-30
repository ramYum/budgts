import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, BackHandler, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ROLE, SPACE } from "../../lib/brand/shared";
import { DirectionContext, type Direction } from "./motion";

export type StepNav = {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  next: () => void;
  back: () => void;
  /** Onboarding's Skip jumps straight to the required last step (currency) rather than leaving the flow. */
  jumpToLast: () => void;
};

export type WizardStep = {
  id: string;
  /** announced as "Step n of m: label" */
  label: string;
  render: (nav: StepNav) => ReactNode;
};

type Position = { index: number; dir: Direction };

/** Move by `delta` within [0, last], remembering the direction (web tour-wizard.tsx `move`). */
export function move(p: Position, delta: number, last: number): Position {
  const to = Math.min(Math.max(p.index + delta, 0), last);
  return to === p.index ? p : { index: to, dir: delta > 0 ? "next" : "back" };
}

/**
 * The welcome guide's step navigator (web src/components/tour/tour-wizard.tsx), shared by onboarding and the tour: owns
 * only the position and the direction of travel; each step's `render` says what its buttons do. `steps` must be stable
 * for the wizard's life (the caller resolves them once), so a refresh mid-guide never reshuffles the cards. `offset` /
 * `total` place these steps in the whole guide, so the announcement matches the progress cells across onboarding → tour.
 *
 * Native additions with the web's meaning: the Android back button steps back like the web's ← key (on the first card
 * it does what back does anywhere else), and each step is announced to TalkBack / VoiceOver like the web's live region.
 */
export function TourWizard({ steps, offset = 0, total = steps.length }: { steps: WizardStep[]; offset?: number; total?: number }) {
  const [{ index, dir }, setPosition] = useState<Position>({ index: 0, dir: "none" });
  const insets = useSafeAreaInsets();
  const last = steps.length - 1;
  const step = steps[Math.min(index, last)]!;

  const moveBy = (delta: number) => setPosition((p) => move(p, delta, last));

  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (indexRef.current === 0) return false;
      setPosition((p) => move(p, -1, last));
      return true;
    });
    return () => sub.remove();
  }, [last]);

  const announced = `Step ${offset + index + 1} of ${total}: ${step.label}`;
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(announced);
  }, [announced]);

  const nav: StepNav = {
    index,
    isFirst: index === 0,
    isLast: index === last,
    next: () => moveBy(1),
    back: () => moveBy(-1),
    jumpToLast: () => setPosition((p) => move(p, last - p.index, last)),
  };

  return (
    <ScrollView
      testID="screen-root"
      style={{ flex: 1, backgroundColor: ROLE.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: SPACE.gutter,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* keyed on the step, so each card mounts fresh and plays its entrance from the way the guide moved */}
      <View key={step.id} testID={`tour-step-${step.id}`} style={{ width: "100%", alignItems: "center" }}>
        <DirectionContext.Provider value={dir}>{step.render(nav)}</DirectionContext.Provider>
      </View>
    </ScrollView>
  );
}
