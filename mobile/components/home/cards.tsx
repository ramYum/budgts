import { Pressable, View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import type { HomeSuggestion, MobileHome } from "../../lib/home/contract";
import { formatMoney } from "../../lib/home/format";
import { savingsProgress } from "../../lib/home/view";
import { IconTile } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { ProgressBar } from "../kit/progress-bar";
import { pressStyle } from "../kit/press";
import { SectionHead } from "../kit/section-head";
import { Badge, CategoryIcon, Chevron } from "../kit/tiles";
import { RollingAmount } from "../motion/rolling-amount";
import { CardRows } from "./card-rows";
import { Lamp } from "./rise";

const TNUM = { fontVariant: ["tabular-nums" as const] };
/** web `text-sm leading-5` */
const SM = { fontSize: 14, lineHeight: 20 };

/**
 * "What can I change?" (web dashboard-view.tsx `change`): the one suggestion
 * the server picked, on a wash card whose idea tile switches on like a bulb.
 * An unbudgeted category opens its budget; a category that grew opens its
 * transactions.
 */
export function ChangeCard({ suggestion, month, currency, go }: { suggestion: HomeSuggestion; month: string; currency: string; go: (path: string) => void }) {
  const href =
    suggestion.kind === "unbudgeted"
      ? `/budgets?m=${month}&edit=${suggestion.categoryId}`
      : `/activity?m=${month}&category=${suggestion.categoryId}`;
  const title = suggestion.kind === "unbudgeted" ? `Give ${suggestion.name} a budget` : suggestion.name;
  const amount = formatMoney(suggestion.amount, currency);
  const detail =
    suggestion.kind === "unbudgeted"
      ? `${amount} this month, ${suggestion.share}% of spending.`
      : `${amount} this month, up ${formatMoney(suggestion.delta, currency)} vs. last month`;

  return (
    <Pressable testID="home-change" accessibilityRole="link" accessibilityLabel={`What can I change? ${title}. ${detail}`} onPress={() => go(href)}>
      {({ pressed }) => (
        <PixelFrame frame="px-wash" style={[{ flexDirection: "row", alignItems: "center", gap: 12, padding: 8 }, pressStyle(pressed)]}>
          <Lamp at={380}>
            <IconTile name="idea" tone="accent" />
          </Lamp>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="tLabelStrong" color={COLOR.signalInk}>
              What can I change?
            </Text>
            <Text variant="listName" color={ROLE.ink}>
              {title}
            </Text>
            {suggestion.kind === "unbudgeted" ? (
              <Text variant="body" color={COLOR.graphite} style={[SM, TNUM]}>
                {detail}
              </Text>
            ) : (
              <Text variant="body" color={COLOR.graphite} style={[SM, TNUM]}>
                {amount} this month,{" "}
                <Text variant="body" color={ROLE.neg} style={SM}>
                  up {formatMoney(suggestion.delta, currency)} vs. last month
                </Text>
              </Text>
            )}
          </View>
          <Chevron />
        </PixelFrame>
      )}
    </Pressable>
  );
}

/** "Savings" (web `savingsCard`): what the active goals hold, rolling in, and their progress toward the targets. */
export function SavingsCard({ savings, currency, go }: { savings: NonNullable<MobileHome["savings"]>; currency: string; go: (path: string) => void }) {
  const { pct, badge } = savingsProgress(savings);
  return (
    <View testID="home-savings" style={{ gap: 12 }}>
      <SectionHead title="Savings" action="Goals" onAction={() => go("/goals")} />
      <PixelFrame frame="px-card" style={{ padding: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <RollingAmount value={savings.totalSaved} currency={currency} variant="tNumLg" />
          {badge ? (
            <Badge tone="growth">
              {badge}
            </Badge>
          ) : null}
        </View>
        <View style={{ marginTop: 16 }}>
          <ProgressBar pct={pct} tone="growth" />
        </View>
        <Text variant="body" color={ROLE.muted} style={[SM, TNUM, { marginTop: 16 }]}>
          Kept toward {formatMoney(savings.totalTarget, currency)} across {savings.activeCount}{" "}
          {savings.activeCount === 1 ? "goal" : "goals"}
        </Text>
      </PixelFrame>
    </View>
  );
}

/** "Recent activity" (web `recentCard`): the five newest transactions, or a first-entry card with a way to add one. */
export function RecentActivity({
  home,
  go,
  onAddTransaction,
}: {
  home: MobileHome;
  go: (path: string) => void;
  onAddTransaction: () => void;
}) {
  const { recent, currency } = home;
  return (
    <View testID="home-recent" style={{ gap: 12 }}>
      <SectionHead title="Recent activity" action="See all" onAction={() => go("/activity")} />
      {recent.length === 0 ? (
        <PixelFrame testID="home-recent-empty" frame="px-card" style={{ padding: 8 }}>
          <View style={{ alignSelf: "flex-start" }}>
            <IconTile name="receipt" />
          </View>
          <Text variant="listName" color={ROLE.ink} style={{ marginTop: 16 }}>
            Nothing recorded yet
          </Text>
          <Text variant="body" color={ROLE.muted} style={SM}>
            {home.bankConnected ? "Purchases from your bank land here on their own." : "Connected purchases land here on their own."}
          </Text>
          <View style={{ marginTop: 8, flexDirection: "row" }}>
            <Pressable
              testID="home-add-transaction"
              accessibilityRole="button"
              accessibilityLabel="Add one by hand"
              onPress={onAddTransaction}
              hitSlop={4}
              style={({ pressed }) => [{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6 }, pressStyle(pressed)]}
            >
              {({ pressed }) => (
                <>
                  <Text variant="button" color={ROLE.ink} style={pressed ? { textDecorationLine: "underline" } : null}>
                    Add one by hand
                  </Text>
                  <Icon name="plus" />
                </>
              )}
            </Pressable>
          </View>
        </PixelFrame>
      ) : (
        <CardRows
          testID="home-recent-rows"
          paddingY={12}
          riseFrom={200}
          rows={recent.map((r) => {
            const credit = r.direction === "credit";
            const title = r.description || r.category?.name || "Transaction";
            const kind = r.isTransfer ? "Transfer" : (r.category?.name ?? "Uncategorized");
            const amount = `${credit ? "+" : "−"}${formatMoney(r.amount, currency)}`;
            return {
              key: r.id,
              node: (
                <View
                  testID="home-recent-row"
                  accessible
                  accessibilityLabel={`${title}, ${kind}, ${amount}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
                >
                  <CategoryIcon name={r.isTransfer ? "Transfer" : (r.category?.name ?? "")} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="listName" color={ROLE.ink} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text variant="body" color={ROLE.muted} numberOfLines={1} style={SM}>
                      {kind}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" color={credit ? ROLE.pos : ROLE.ink} style={[TNUM, { flexShrink: 0 }]}>
                    {amount}
                  </Text>
                </View>
              ),
            };
          })}
        />
      )}
    </View>
  );
}
