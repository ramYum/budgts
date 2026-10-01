import { memo } from "react";
import { Pressable, View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { dayLabel, groupByDay, rowAmount, rowMeta, rowTitle, signedTotal } from "../../lib/transactions/activity-view";
import type { MobileTransaction } from "../../lib/transactions/transactions-api";
import { Text } from "../brand/text";
import { CategoryIcon } from "../kit/tiles";
import { pressStyle } from "../kit/press";

const TNUM = { fontVariant: ["tabular-nums" as const] };

function TransactionRow({
  t,
  kinds,
  currency,
  onOpen,
}: {
  t: MobileTransaction;
  kinds: Map<string, "expense" | "income">;
  currency: string;
  onOpen: (t: MobileTransaction) => void;
}) {
  const title = rowTitle(t);
  const meta = rowMeta(t, kinds);
  const amount = rowAmount(t, currency);
  return (
    <Pressable
      testID="txn-row"
      accessibilityRole="button"
      accessibilityLabel={[title, meta.text, amount].filter(Boolean).join(", ")}
      onPress={() => onOpen(t)}
      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }, pressStyle(pressed)]}
    >
      {({ pressed }) => (
        <>
          <CategoryIcon name={t.isTransfer ? "Transfer" : (t.category?.name ?? "")} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              testID="txn-title"
              variant="listName"
              color={ROLE.ink}
              numberOfLines={1}
              style={pressed ? { textDecorationLine: "underline" } : null}
            >
              {title}
            </Text>
            <Text testID="txn-meta" variant="small" color={meta.warn ? ROLE.warn : ROLE.muted} numberOfLines={1}>
              {meta.text}
            </Text>
          </View>
          <Text testID="txn-amount" variant="bodyStrong" color={t.direction === "credit" ? ROLE.pos : ROLE.ink} style={[TNUM, { flexShrink: 0 }]}>
            {amount}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * The rendered rows in their day bands (web `TxnDays`): each band names the day and its net across every matching row,
 * then the day's rows divided by 1px rules. Memoized so typing in the search doesn't re-render rows that didn't change.
 */
export const TransactionDays = memo(function TransactionDays({
  rows,
  totals,
  kinds,
  currency,
  onOpen,
}: {
  rows: MobileTransaction[];
  /** each day's net across every matching row, not just the rendered slice; null while the month is still arriving */
  totals: Map<string, number> | null;
  kinds: Map<string, "expense" | "income">;
  currency: string;
  onOpen: (t: MobileTransaction) => void;
}) {
  return (
    <>
      {groupByDay(rows).map(({ day, rows: dayRows }, i) => (
        <View key={day} testID="txn-day">
          <View
            accessibilityRole="header"
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 8, paddingBottom: 4, paddingTop: i === 0 ? 16 : 20 }}
          >
            <Text testID="txn-day-label" variant="tLabelStrong" color={COLOR.graphite}>
              {dayLabel(day)}
            </Text>
            {totals ? (
              <Text testID="txn-day-total" variant="tLabel" color={ROLE.muted} style={TNUM}>
                {signedTotal(totals.get(day) ?? 0, currency)}
              </Text>
            ) : null}
          </View>
          <View style={{ paddingHorizontal: 8 }}>
            {dayRows.map((t, j) => (
              <View key={t.id} style={j > 0 ? { borderTopWidth: 1, borderTopColor: COLOR.divider } : undefined}>
                <TransactionRow t={t} kinds={kinds} currency={currency} onOpen={onOpen} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
});
