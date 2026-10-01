import { View } from "react-native";
import Animated, { steps } from "react-native-reanimated";
import { useReducedMotion } from "../motion/reduced-motion";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { POP_IN, POP_MS } from "../../lib/motion/css";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import {
  formatMoney,
  formatMonthName,
  formatSignedChange,
  formatWhole,
  TREND_GAP,
  TREND_ROWS,
  TREND_SEG_H,
  TREND_SEG_W,
  trendColumns,
  type TrendColumn,
} from "../../lib/shared";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { RollingAmount } from "../motion/rolling-amount";
import { usePlay } from "../motion/reveal";
import { Cell } from "./cell";

/** The shown month's tag: a small ink badge above its column, popping on once the column has built. */
function Tag({ column, col, currency }: { column: TrendColumn; col: number; currency: string }) {
  const reduced = useReducedMotion();
  const play = usePlay() && !reduced;
  const timing = useMotionTiming((col * 3 + column.lit) * 22 + 380);
  return (
    <Animated.View
      style={[
        { position: "absolute", right: -4, bottom: TREND_ROWS * (TREND_SEG_H + TREND_GAP) + 6 },
        play ? { animationName: POP_IN, animationDuration: `${POP_MS}ms`, animationTimingFunction: steps(3, "jump-end"), animationFillMode: "backwards", ...timing } : null,
      ]}
    >
      <PixelFrame frame="px-badge-ink" style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
        <Text variant="tLabelStrong" color={COLOR.white} numberOfLines={1} style={{ lineHeight: 12, fontVariant: ["tabular-nums"] }}>
          {formatWhole(column.spend, currency)}
        </Text>
      </PixelFrame>
    </Animated.View>
  );
}

/**
 * "Spending · 6 months" (web `SpendingTrendCard`, src/components/spending-overview.tsx): six columns of 14 flat
 * segments, past months in quiet grey, the shown month in the accent with its value tagged on top; unlit rows show as a
 * faint track. `figure="total"` (Home) leads with this month's spending, `"change"` (Insights) with the change against
 * last month. Every figure comes from the server (`trend`, `change`); only how many rows light is drawn here.
 */
export function SpendingTrendCard({
  trend,
  change,
  currency,
  figure = "total",
  title,
  testID = "spending-trend-card",
}: {
  trend: readonly { month: string; spend: number }[];
  change: { total: number; delta: number | null; previousMonth: string | null };
  currency: string;
  figure?: "total" | "change";
  /** a small heading inside the card (when the section has no heading outside it) */
  title?: string;
  testID?: string;
}) {
  const data = trendColumns(trend);
  const money = (m: number) => formatMoney(m, currency);
  const prevName = change.previousMonth ? formatMonthName(change.previousMonth, "long") : "";

  return (
    <PixelFrame testID={testID} frame="px-card" style={{ padding: 8 }}>
      {title ? (
        <Text variant="formLabel" color={ROLE.muted} accessibilityRole="header" style={{ marginBottom: 4 }}>
          {title}
        </Text>
      ) : null}
      {figure === "change" && change.delta !== null ? (
        <>
          <Text variant="tNumLg" color={ROLE.ink}>
            {formatSignedChange(change.delta, money)}
          </Text>
          <Text variant="small" color={ROLE.muted}>{`vs ${prevName}`}</Text>
        </>
      ) : (
        <>
          <RollingAmount value={change.total} currency={currency} variant="tNumLg" />
          <Text variant="small" color={ROLE.muted}>
            This month
            {change.delta !== null ? (
              <>
                {" · "}
                <Text variant="small" color={ROLE.ink} style={{ fontVariant: ["tabular-nums"] }}>
                  {formatSignedChange(change.delta, money)}
                </Text>
                {` vs ${prevName}`}
              </>
            ) : null}
          </Text>
        </>
      )}

      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Spending by month: ${data.map((d) => `${d.label} ${money(d.spend)}`).join(", ")}`}
        style={{ marginTop: 32, paddingTop: 28, flexDirection: "row", alignItems: "flex-end", columnGap: 8 }}
      >
        {data.map((d, col) => (
          <View key={d.month} style={{ flex: 1, alignItems: "center", gap: 12 }}>
            <View style={{ width: TREND_SEG_W, gap: TREND_GAP }}>
              {Array.from({ length: TREND_ROWS }, (_, i) => {
                const rowFromBottom = TREND_ROWS - 1 - i;
                const lit = rowFromBottom < d.lit;
                const color = lit ? (d.current ? COLOR.signal : COLOR.silver) : ROLE.surface2;
                return <Cell key={i} d={col * 3 + rowFromBottom} color={color} style={{ height: TREND_SEG_H, width: TREND_SEG_W }} />;
              })}
              {d.current && d.lit > 0 ? <Tag column={d} col={col} currency={currency} /> : null}
            </View>
            <Text variant={d.current ? "bodyStrong" : "body"} color={d.current ? ROLE.ink : ROLE.muted} style={{ lineHeight: 20 }}>
              {d.label}
            </Text>
          </View>
        ))}
      </View>
    </PixelFrame>
  );
}
