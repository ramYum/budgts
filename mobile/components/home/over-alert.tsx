import { useSyncExternalStore } from "react";
import { Pressable, View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { formatMoney } from "../../lib/home/format";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { pressStyle } from "../kit/press";

/**
 * Dismissals last as long as the app runs, per month: the web keeps them in
 * sessionStorage, which lives as long as the tab (switching screens never
 * brings the warning back; relaunching does).
 */
const dismissed = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissOverAlert(month: string) {
  dismissed.add(month);
  for (const l of [...listeners]) l();
}

/** Whether the warning for `month` was dismissed while the app has been running. */
export function useOverAlertDismissed(month: string): boolean {
  return useSyncExternalStore(subscribe, () => dismissed.has(month), () => false);
}

/** Test seam: forget every dismissal. */
export function resetOverAlertDismissals() {
  dismissed.clear();
  for (const l of [...listeners]) l();
}

/**
 * The budgets add up to more than has come in (web budget-over-alert.tsx): a
 * warn card with the two server figures, a link to Budgets, and a dismiss.
 * Home leaves it out once dismissed (`useOverAlertDismissed`).
 */
export function BudgetOverAlert({
  month,
  budgeted,
  income,
  currency,
  onReview,
}: {
  month: string;
  budgeted: number;
  income: number;
  currency: string;
  onReview: () => void;
}) {
  return (
    <PixelFrame
      testID="home-over-alert"
      frame="px-warn"
      accessibilityRole="alert"
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12, paddingRight: 48 }}
    >
      <Icon name="warning" color={ROLE.warn} />
      <Text variant="body" color={ROLE.ink} style={{ flex: 1, fontVariant: ["tabular-nums"] }}>
        This month&apos;s budgets add up to {formatMoney(budgeted, currency)}, more than the {formatMoney(income, currency)}{" "}
        you&apos;ve brought in so far.{" "}
        <Text
          testID="home-over-alert-review"
          variant="listName"
          color={ROLE.ink}
          accessibilityRole="link"
          onPress={onReview}
          style={{ textDecorationLine: "underline" }}
        >
          Review your budgets
        </Text>
        .
      </Text>
      <Pressable
        testID="home-over-alert-dismiss"
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={() => dismissOverAlert(month)}
        hitSlop={4}
        style={({ pressed }) => [
          { position: "absolute", right: 8, top: 8, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
          pressStyle(pressed),
        ]}
      >
        {({ pressed }) => (
          <View>
            <Icon name="close" color={pressed ? ROLE.ink : ROLE.muted} />
          </View>
        )}
      </Pressable>
    </PixelFrame>
  );
}
