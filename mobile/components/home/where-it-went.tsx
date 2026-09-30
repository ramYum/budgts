import type { Href } from "expo-router";
import { budgetsLink } from "../../lib/budgets/params";
import { Pressable, View } from "react-native";
import { COLOR, FONT, ROLE, categoryIcon } from "../../lib/brand/shared";
import type { HomeCategory, MobileHome } from "../../lib/home/contract";
import { formatMoney } from "../../lib/shared";
import { whereNote } from "../../lib/home/view";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { ProgressBar } from "../kit/progress-bar";
import { pressStyle } from "../kit/press";
import { SectionHead } from "../kit/section-head";
import { CategoryIcon } from "../kit/tiles";
import { CardRows } from "./card-rows";

const TNUM = { fontVariant: ["tabular-nums" as const] };

/**
 * One row (web `WhereRow`): name and amount, the cells, then what's left or
 * over against the plan. The row opens that category's transactions; "Set
 * budget" opens its budget instead. Rows rise 60ms apart from 240ms, and
 * their cells cascade three steps apart.
 */
function WhereRow({ c, row, currency, month, go }: { c: HomeCategory; row: number; currency: string; month: string; go: (href: Href) => void }) {
  const note = whereNote(c);
  const flagged = note === "unplanned" || note === "over";
  const setBudget = () => go(budgetsLink.edit(month, c.id));
  return (
    <Pressable
        testID="home-where-row"
        accessibilityRole="link"
        accessibilityLabel={`${c.name}, ${formatMoney(c.actual, currency)}`}
        // the row is one stop for a screen reader; "Set budget" is its action there
        accessibilityActions={c.budget > 0 ? undefined : [{ name: "setBudget", label: "Set budget" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "setBudget") setBudget();
        }}
        onPress={() => go(budgetsLink.activity(month, c.id))}
        style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12 }, pressStyle(pressed)]}
      >
        <CategoryIcon name={c.name} tone={flagged ? "wash" : "gray"} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <Text variant="listName" color={ROLE.ink} numberOfLines={1} style={{ flexShrink: 1 }}>
              {c.name}
            </Text>
            <Text variant="bodyStrong" color={ROLE.ink} style={[TNUM, { flexShrink: 0 }]}>
              {formatMoney(c.actual, currency)}
            </Text>
          </View>
          <ProgressBar pct={c.pctUsed} tone={c.state} start={row * 3} />
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            {note === "unplanned" ? (
              <Text variant="metaStrong" color={ROLE.neg}>
                No budget, all unplanned
              </Text>
            ) : note === "over" ? (
              <Text variant="metaStrong" color={ROLE.neg} style={TNUM}>
                {/* the server's remaining is budget − actual, so over is its negation */}
                Over by {formatMoney(-c.remaining, currency)}
              </Text>
            ) : note === "left" ? (
              <Text variant="meta" color={ROLE.ink} style={TNUM}>
                {formatMoney(c.remaining, currency)} <Text variant="meta" color={ROLE.muted}>left</Text>
              </Text>
            ) : (
              <Text variant="meta" color={ROLE.muted}>
                No budget set
              </Text>
            )}
            {c.budget > 0 ? (
              <Text variant="meta" color={ROLE.muted} style={[TNUM, { flexShrink: 0 }]}>
                of {formatMoney(c.budget, currency)}
              </Text>
            ) : (
              <Pressable
                testID="home-where-set-budget"
                accessibilityRole="link"
                accessibilityLabel={`Set budget for ${c.name}`}
                onPress={setBudget}
                hitSlop={12}
                style={{ flexShrink: 0 }}
              >
                {({ pressed }) => (
                  <Text
                    variant="meta"
                    color={note === "unplanned" ? ROLE.neg : ROLE.ink}
                    style={[{ fontFamily: FONT.geist[600] }, pressed ? { textDecorationLine: "underline" } : null]}
                  >
                    Set budget
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
  );
}

/** Nothing spent yet: Crystal asleep, and the categories waiting, as chips (web `px-badge` h-8). */
function NoSpending({ expense }: { expense: MobileHome["expenseCategories"] }) {
  return (
    <PixelFrame testID="home-where-empty" frame="px-card" style={{ padding: 8 }}>
      <View style={{ alignSelf: "flex-start" }}>
        <Robin mood="sleepy" size={51} />
      </View>
      <Text variant="listName" color={ROLE.ink} style={{ marginTop: 16 }}>
        No spending yet this month
      </Text>
      <Text variant="small" color={ROLE.muted}>
        Your categories are ready. Spending shows up here as it happens.
      </Text>
      {expense.length > 0 ? (
        <View accessibilityLabel="Your categories" style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {expense.map((c) => (
            <PixelFrame
              key={c.id}
              testID="home-category-chip"
              frame="px-badge"
              style={{ height: 32, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Icon name={categoryIcon(c.name)} size={12} color={COLOR.graphite} />
              <Text variant="small" color={COLOR.graphite}>
                {c.name}
              </Text>
            </PixelFrame>
          ))}
        </View>
      ) : null}
    </PixelFrame>
  );
}

/**
 * "Where it went" (web dashboard-view.tsx `whereItWent`): the month's spending
 * against the plan in one line, then a row per category, or the empty cards
 * for a month with no spending or no budgets.
 */
export function WhereItWent({
  home,
  go,
}: {
  home: MobileHome;
  go: (href: Href) => void;
}) {
  const { currency, month } = home;
  return (
    <View testID="home-where" style={{ gap: 12 }}>
      <SectionHead title="Where it went" action="Budgets" onAction={() => go({ pathname: "/budgets", params: { m: month } })} />
      {home.budgeted > 0 && home.spent > 0 ? (
        home.leftToSpend < 0 ? (
          <View testID="home-where-summary" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="warning" color={COLOR.signal} />
            <Text variant="body" color={ROLE.ink} style={[TNUM, { flex: 1 }]}>
              <Text variant="bodyStrong" color={ROLE.neg}>
                {formatMoney(-home.leftToSpend, currency)} over
              </Text>{" "}
              your {formatMoney(home.budgeted, currency)} budget
            </Text>
          </View>
        ) : (
          <Text testID="home-where-summary" variant="body" color={ROLE.muted} style={TNUM}>
            <Text variant="bodyStrong" color={ROLE.ink}>
              {formatMoney(home.leftToSpend, currency)} left
            </Text>{" "}
            of your {formatMoney(home.budgeted, currency)} budget
          </Text>
        )
      ) : null}
      {home.spent === 0 ? (
        <NoSpending expense={home.expenseCategories} />
      ) : home.categories.length === 0 ? (
        <PixelFrame testID="home-where-no-budgets" frame="px-card" style={{ padding: 12 }}>
          <Text variant="body" color={ROLE.muted}>
            Set a budget on the{" "}
            <Text variant="listName" color={ROLE.ink} accessibilityRole="link" onPress={() => go("/budgets")} style={{ textDecorationLine: "underline" }}>
              Budgets
            </Text>{" "}
            screen to see how you&apos;re tracking.
          </Text>
        </PixelFrame>
      ) : (
        <CardRows
          testID="home-where-rows"
          paddingY={12}
          riseFrom={240}
          rows={home.categories.map((c, row) => ({
            key: c.id,
            node: <WhereRow c={c} row={row} currency={currency} month={month} go={go} />,
          }))}
        />
      )}
    </View>
  );
}
