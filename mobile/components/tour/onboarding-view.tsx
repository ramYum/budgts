import { useMemo, useState } from "react";
import { View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { GUIDE_COPY, type TourStepId } from "../../lib/tour/shared";
import { Button } from "../brand/controls";
import { Text } from "../brand/text";
import { Select } from "../kit/select";
import { GuideScene } from "./scenes";
import { TourCard } from "./tour-card";
import { TourWizard, type WizardStep } from "./tour-wizard";

/**
 * The welcome guide's first half (web src/app/(app)/onboarding/onboarding-wizard-content.tsx): Crystal → what Budgts
 * does → (every purchase, tracked →) currency, the cards the server sends. The currency card is required: Skip on the
 * earlier cards jumps straight to it rather than leaving the flow. The progress cells count the whole guide, this half
 * and the tour after it (`totalVisible`).
 *
 * `onSubmit` saves the currency (set once) with the device's time zone and resolves to an error message, or null once
 * saved (the app shell then moves on to the tour).
 */
export function OnboardingView({
  stepIds,
  totalVisible,
  defaultCurrency,
  currencies,
  onSubmit,
}: {
  stepIds: TourStepId[];
  totalVisible: number;
  defaultCurrency: string;
  currencies: readonly string[];
  onSubmit: (currency: string) => Promise<string | null>;
}) {
  // drives the currency scene's live preview and is what the form submits
  const [currency, setCurrency] = useState(defaultCurrency);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(() => currencies.map((c) => ({ value: c, label: c })), [currencies]);

  async function submit() {
    setPending(true);
    setError(null);
    const message = await onSubmit(currency);
    // on success the shell moves on; this card stays "Saving…" until it does
    if (message !== null) {
      setError(message);
      setPending(false);
    }
  }

  const steps: WizardStep[] = stepIds.map((id, i) => ({
    id,
    label: GUIDE_COPY[id].label,
    render: (nav) => {
      const copy = GUIDE_COPY[id];
      const shared = {
        heading: copy.heading,
        body: copy.body,
        scene: <GuideScene id={id} currency={currency} />,
        dotCount: totalVisible,
        dotIndex: i,
        onBack: nav.isFirst ? undefined : nav.back,
        onSkip: nav.isLast ? undefined : nav.jumpToLast,
      };

      if (id === "currency") {
        return (
          <TourCard
            {...shared}
            media={
              <View style={{ gap: 12 }}>
                <Select
                  testID="onboarding-currency"
                  label="Currency"
                  value={currency}
                  options={options}
                  onChange={setCurrency}
                  disabled={pending}
                />
                {error ? (
                  <Text testID="onboarding-error" variant="body" color={ROLE.neg} accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 20 }}>
                    {error}
                  </Text>
                ) : null}
                <Button testID="tour-primary" arrow={!pending} loading={pending} onPress={() => void submit()}>
                  {pending ? "Saving…" : copy.cta}
                </Button>
              </View>
            }
          />
        );
      }
      // "crystal" | "welcome" | "auto-capture"; the tour's cards never come in this half
      return (
        <TourCard
          {...shared}
          primary={
            <Button testID="tour-primary" arrow onPress={nav.next}>
              {copy.cta}
            </Button>
          }
        />
      );
    },
  }));

  return <TourWizard steps={steps} total={totalVisible} />;
}
