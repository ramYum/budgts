import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { formatMoney } from "../../lib/home/format";
import type { NeedsCategoryGroup } from "../../lib/transactions/activity-api";
import { Button, IconTile } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";

/** Merchants shown before "Show N more" (the web's phone layout). */
export const FIRST = 3;

const SMALL = { fontSize: 14, lineHeight: 20 } as const;
const TNUM = { fontVariant: ["tabular-nums" as const] };

/** A stored day as "Sep 16", read in UTC like the Activity list. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** A group's net: spending reads "−$12.00", money back reads "+$3.00" (web `formatNet`). */
export function formatNet(netAmount: number, currency: string): string {
  return `${netAmount < 0 ? "+" : "−"}${formatMoney(Math.abs(netAmount), currency)}`;
}

/** "3 purchases · latest Sep 16", or one purchase's "Sep 16 · Everyday checking · Pending". */
export function groupMeta(group: NeedsCategoryGroup): string {
  const first = group.transactions[0]!;
  if (group.count > 1) return `${group.count} purchases · latest ${shortDate(first.occurredAt)}`;
  return `${shortDate(first.occurredAt)}${first.accountName ? ` · ${first.accountName}` : ""}${first.pending ? " · Pending" : ""}`;
}

/** "Show 3 transactions": the group's rows, opened in place (the web's `<details>`). */
function GroupTransactions({ group, currency }: { group: NeedsCategoryGroup; currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        testID="needs-category-show-txns"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        hitSlop={12}
        style={{ alignSelf: "flex-start" }}
      >
        {({ pressed }) => (
          <Text variant="body" color={pressed ? ROLE.ink : ROLE.muted} style={SMALL}>
            {open ? "▾" : "▸"} Show {group.count} transactions
          </Text>
        )}
      </Pressable>
      {open ? (
        <View style={{ marginTop: 8, gap: 6, borderLeftWidth: 2, borderLeftColor: ROLE.hairline, paddingLeft: 12 }}>
          {group.transactions.map((t) => (
            <View key={t.id} style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <Text variant="body" color={ROLE.muted} style={[SMALL, { flexShrink: 1, minWidth: 0 }]}>
                {t.description || "Transaction"}
              </Text>
              <Text variant="body" color={ROLE.muted} style={[SMALL, TNUM, { flexShrink: 0 }]}>
                {shortDate(t.occurredAt)} · {t.direction === "debit" ? "−" : "+"}
                {formatMoney(t.amount, currency)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * "Needs a category" (web `src/components/plaid/needs-category.tsx`): bank rows Budgts could not confidently categorize,
 * one group per merchant (grouped by the server), so one decision clears every purchase from that merchant. The lead card on
 * Activity; three merchants, then "Show N more". `renderActions` draws a group's picker (the categorize flow).
 */
export function NeedsCategory({
  groups,
  currency,
  headerAction,
  renderActions,
}: {
  groups: NeedsCategoryGroup[];
  currency: string;
  headerAction?: ReactNode;
  renderActions?: (group: NeedsCategoryGroup) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (groups.length === 0) return null;

  const totalTxns = groups.reduce((n, g) => n + g.count, 0);
  const shown = expanded ? groups : groups.slice(0, FIRST);
  const hidden = groups.length - shown.length;
  const a11y = `Needs a category, ${totalTxns} ${totalTxns === 1 ? "transaction" : "transactions"} from ${groups.length} ${
    groups.length === 1 ? "merchant" : "merchants"
  }`;

  return (
    <PixelFrame testID="needs-category" frame="px-card-raised" style={{ padding: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        {/* the web's "Needs a category " then the count 6px on (ml-1.5), in signal ink */}
        <View accessible accessibilityRole="header" accessibilityLabel={a11y} style={{ flexDirection: "row", alignItems: "baseline", flexShrink: 1 }}>
          <Text testID="needs-category-title" variant="tHead" color={ROLE.ink}>
            Needs a category
          </Text>
          <Text testID="needs-category-total" variant="listName" color={COLOR.signalInk} style={[TNUM, { marginLeft: 10 }]}>
            {String(totalTxns)}
          </Text>
        </View>
        {headerAction}
      </View>

      <Text variant="body" color={ROLE.muted} style={[SMALL, { marginTop: 4 }]}>
        Pick once and it applies to every purchase from that merchant. Missing one? Choose{" "}
        <Text variant="listName" color={COLOR.graphite} style={SMALL}>
          + New category
        </Text>
        .
      </Text>

      <View style={{ marginTop: 8 }}>
        {shown.map((group, i) => (
          <View
            key={group.key}
            testID="needs-category-group"
            style={[
              { gap: 12, paddingTop: 16, paddingBottom: i === shown.length - 1 ? 0 : 16 },
              i > 0 ? { borderTopWidth: 1, borderTopColor: COLOR.divider } : null,
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <IconTile name="tag" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text testID="needs-category-label" variant="listName" color={ROLE.ink}>
                  {group.label}
                </Text>
                <Text variant="body" color={ROLE.muted} numberOfLines={1} style={SMALL}>
                  {groupMeta(group)}
                </Text>
              </View>
              <Text variant="bodyStrong" color={group.netAmount < 0 ? ROLE.pos : ROLE.ink} style={[TNUM, { flexShrink: 0 }]}>
                {formatNet(group.netAmount, currency)}
              </Text>
            </View>
            {renderActions?.(group)}
            {group.count > 1 ? <GroupTransactions group={group} currency={currency} /> : null}
          </View>
        ))}
      </View>

      {hidden > 0 ? (
        <Button testID="needs-category-more" variant="secondary" style={{ marginTop: 16 }} onPress={() => setExpanded(true)}>
          {`Show ${hidden} more`}
        </Button>
      ) : null}
    </PixelFrame>
  );
}
