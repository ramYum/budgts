import { useState } from "react";
import { Pressable, View, type TextStyle } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import type { MobileInsights } from "../../lib/insights/insights-api";
import { formatMoney, formatSavingsRate } from "../../lib/shared";
import { IconTile } from "../brand/controls";
import { Cell } from "../charts/cell";
import { SpendingBreakdownCard } from "../charts/spending-breakdown-card";
import { SpendingTrendCard } from "../charts/spending-trend-card";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { figureVariant } from "../kit/figure";
import { MonthNav } from "../kit/month-nav";
import { PageHeader } from "../kit/page-header";
import { pressStyle } from "../kit/press";
import { SegmentedControl } from "../kit/segmented-control";
import { CategoryIcon, Chevron } from "../kit/tiles";
import { Reveal } from "../motion/reveal";

const tnum = (size: number): TextStyle => ({ fontVariant: ["tabular-nums"], letterSpacing: -0.01 * size });
const SM: TextStyle = { fontSize: 14, lineHeight: 20 };

const CELL = 6;
const GAP = 2;

/**
 * How many of the waffle's 100 cells light for a savings rate (web insights-view.tsx `Waffle`): one per whole percent,
 * none for a negative month or no income. A picture of the printed rate (the same rounding as `formatSavingsRate`),
 * not a figure of its own.
 */
export function waffleLit(rate: number | null): number {
  return rate === null ? 0 : Math.max(0, Math.min(100, Math.round(rate * 100)));
}

/** Savings rate as a 10×10 waffle, filled from the bottom-left row by row; the rows pop in bottom first (F7's `Cell`). */
function Waffle({ rate }: { rate: number | null }) {
  const lit = waffleLit(rate);
  return (
    <View
      testID="insights-waffle"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 10 * CELL + 9 * GAP, flexDirection: "row", flexWrap: "wrap", gap: GAP, flexShrink: 0 }}
    >
      {Array.from({ length: 100 }, (_, i) => {
        // the web's --d: the cell's row counted from the bottom
        const band = 9 - Math.floor(i / 10);
        const fill = band * 10 + (i % 10);
        return <Cell key={i} d={band} color={fill < lit ? ROLE.ink : ROLE.surface2} style={{ width: CELL, height: CELL }} />;
      })}
    </View>
  );
}

function Label({ children }: { children: string }) {
  return (
    <Text variant="formLabel" color={ROLE.muted} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** "Where you could save" as the card reads, both lines, for a screen reader. */
export function suggestionLabel(s: NonNullable<MobileInsights["suggestion"]>, currency: string): string {
  return s.kind === "unbudgeted"
    ? `Where you could save. ${s.name} is ${s.share}% of your spending. ${formatMoney(s.amount, currency)} with no budget. Setting one makes the plan real.`
    : `Where you could save. ${s.name}. ${formatMoney(s.amount, currency)} this month, up ${formatMoney(s.delta, currency)} vs. last month`;
}

export type InsightsTab = "spending" | "income";

/**
 * Insights (web insights/page.tsx + insights-view.tsx, phone layout): the header with its back arrow and the month;
 * Money left; the savings rate with its waffle; "Where you could save" (to Budgets for unplanned spending, to Activity for
 * a mover); then the breakdown card with the Spending / Income switch, and the six-month trend. Every figure is the
 * server's (`/api/mobile/insights`); the breakdown ring and the trend are F7's cell charts (components/charts).
 */
export function InsightsView({
  data,
  onBack,
  onMonth,
  onSuggestion,
}: {
  data: MobileInsights;
  onBack: () => void;
  onMonth: (month: string) => void;
  onSuggestion: (s: NonNullable<MobileInsights["suggestion"]>) => void;
}) {
  const [tab, setTab] = useState<InsightsTab>("spending");
  const { currency, suggestion } = data;
  const moneyLeft = formatMoney(data.moneyLeft, currency);
  const rate = data.savingsRate;
  const delta = data.savingsRateDelta;

  const breakdownHeader = (
    <View style={{ marginBottom: 24, flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <View>
        <Label>{tab === "spending" ? "Total spending" : "Total income"}</Label>
        <Text testID="insights-total" variant="tNumLg" color={ROLE.ink} style={{ marginTop: 4 }}>
          {formatMoney(tab === "spending" ? data.spent : data.income, currency)}
        </Text>
      </View>
      <SegmentedControl
        label="Show"
        value={tab}
        onChange={setTab}
        options={[
          { value: "spending", label: "Spending" },
          { value: "income", label: "Income" },
        ]}
      />
    </View>
  );

  return (
    <View>
      <PageHeader title="Insights" onBack={onBack} month={<MonthNav month={data.month} onChange={onMonth} />} />
      <View style={{ gap: 24 }}>
        <Reveal i={1}>
          <PixelFrame testID="insights-money-left" frame="px-card-raised" style={{ padding: 8 }}>
            <Label>Money left</Label>
            <Text variant={figureVariant(moneyLeft)} color={data.moneyLeft < 0 ? ROLE.neg : ROLE.ink} style={{ marginTop: 12 }}>
              {moneyLeft}
            </Text>
            <Text variant="body" color={ROLE.muted} style={{ marginTop: 8 }}>
              Income minus spending, this month.
            </Text>
          </PixelFrame>
        </Reveal>

        <Reveal i={2}>
          <PixelFrame
            testID="insights-savings-rate"
            frame="px-card-raised"
            style={{ padding: 8, flexDirection: "row", alignItems: "center", gap: 24 }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Label>Savings rate</Label>
              <Text variant="tNumXl" color={rate !== null && rate < 0 ? ROLE.neg : ROLE.ink} style={{ marginTop: 8 }}>
                {rate === null ? "No income" : formatSavingsRate(rate)}
              </Text>
              <Text variant="body" color={ROLE.muted} style={{ marginTop: 8 }}>
                {rate === null ? "No income this month yet" : "of income kept"}
              </Text>
              {delta !== null ? (
                <Text variant="body" color={ROLE.muted} style={[SM, tnum(14)]}>
                  {`${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta)} pts vs. last month`}
                </Text>
              ) : null}
              <Text variant="body" color={ROLE.muted} numberOfLines={1} style={SM}>
                1 cell = 1%
              </Text>
            </View>
            <Waffle rate={rate} />
          </PixelFrame>
        </Reveal>

        {suggestion ? (
          <Reveal i={3}>
            <Pressable
              testID="insights-suggestion"
              accessibilityRole="link"
              accessibilityLabel={suggestionLabel(suggestion, currency)}
              onPress={() => onSuggestion(suggestion)}
            >
              {({ pressed }) => (
                <PixelFrame frame="px-wash" style={[{ flexDirection: "row", alignItems: "center", gap: 16, padding: 16 }, pressStyle(pressed)]}>
                  <IconTile name="idea" tone="accent" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="tLabelStrong" color={COLOR.signalInk}>
                      Where you could save
                    </Text>
                    {suggestion.kind === "unbudgeted" ? (
                      <>
                        <Text variant="listName" color={ROLE.ink}>
                          {`${suggestion.name} is ${suggestion.share}% of your spending`}
                        </Text>
                        <Text variant="body" color={COLOR.graphite} style={[SM, tnum(14)]}>
                          {`${formatMoney(suggestion.amount, currency)} with no budget. Setting one makes the plan real.`}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text variant="listName" color={ROLE.ink}>
                          {suggestion.name}
                        </Text>
                        <Text variant="body" color={COLOR.graphite} style={[SM, tnum(14)]}>
                          {`${formatMoney(suggestion.amount, currency)} this month, `}
                          <Text variant="body" color={ROLE.neg} style={SM}>
                            {`up ${formatMoney(suggestion.delta, currency)} vs. last month`}
                          </Text>
                        </Text>
                      </>
                    )}
                  </View>
                  <Chevron />
                </PixelFrame>
              )}
            </Pressable>
          </Reveal>
        ) : null}

        <Reveal i={4}>
          {tab === "spending" && data.spent > 0 ? (
            <SpendingBreakdownCard breakdown={data.breakdown} totalSpent={data.spent} currency={currency} header={breakdownHeader} />
          ) : (
            <PixelFrame testID="insights-breakdown" frame="px-card" style={{ padding: 8 }}>
              {breakdownHeader}
              {tab === "spending" ? (
                <Text variant="body" color={ROLE.muted}>
                  No spending recorded this month yet.
                </Text>
              ) : data.incomeSources.length > 0 ? (
                <View>
                  {data.incomeSources.map((s, i) => (
                    <View
                      key={s.name}
                      testID="insights-income-row"
                      style={[
                        {
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingTop: i === 0 ? 0 : 12,
                          paddingBottom: i === data.incomeSources.length - 1 ? 0 : 12,
                        },
                        i > 0 ? { borderTopWidth: 1, borderTopColor: COLOR.divider } : null,
                      ]}
                    >
                      <CategoryIcon name={s.name} />
                      <Text variant="body" color={ROLE.ink} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                        {s.name}
                      </Text>
                      <Text variant="body" color={ROLE.ink} style={tnum(15)}>
                        {formatMoney(s.amount, currency)}
                      </Text>
                      <Text variant="tLabel" color={ROLE.muted} style={[{ width: 36, textAlign: "right" }, tnum(12)]}>
                        {`${s.share}%`}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text variant="body" color={ROLE.muted}>
                  No income recorded this month yet.
                </Text>
              )}
            </PixelFrame>
          )}
        </Reveal>

        <Reveal i={5}>
          <SpendingTrendCard trend={data.trend} change={data.trendChange} currency={currency} figure="change" title="Spending · 6 months" />
        </Reveal>
      </View>
    </View>
  );
}
