import { Pressable, View, type TextStyle } from "react-native";
import { COLOR, ROLE, type TypeRoleName } from "../../lib/brand/shared";
import type { MobileBudgetCategory, MobileBudgets, MobileBudgetsAllTime, MobileBudgetsMonth } from "../../lib/budgets/budgets-api";
import { formatMoney } from "../../lib/shared";
import { Button } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { EmptyState } from "../kit/empty-state";
import { figureVariant } from "../kit/figure";
import { MonthNav } from "../kit/month-nav";
import { PageHeader } from "../kit/page-header";
import { pressStyle } from "../kit/press";
import { ProgressBar } from "../kit/progress-bar";
import { SectionHead } from "../kit/section-head";
import { SegmentedControl } from "../kit/segmented-control";
import { CategoryIcon } from "../kit/tiles";
import { Reveal } from "../motion/reveal";

export type BudgetsRange = "month" | "all";

/** The web's `.tnum`: tabular figures, tightened by a hundredth of an em. */
const tnum = (size: number): TextStyle => ({ fontVariant: ["tabular-nums"], letterSpacing: -0.01 * size });
/** The web's `text-sm leading-5` (14/20) on a reading role. */
const SM: TextStyle = { fontSize: 14, lineHeight: 20 };

/** "Copy last month" (web copy-budgets.tsx): a quiet semibold ink text action with the copy icon after it. */
function CopyLastMonth({ pending, error, onCopy }: { pending: boolean; error: string | null; onCopy: () => void }) {
  const label = pending ? "Copying…" : "Copy last month";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 }}>
      <Pressable
        testID="budgets-copy"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: pending, busy: pending }}
        disabled={pending}
        onPress={onCopy}
        hitSlop={4}
        style={({ pressed }) => [{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, opacity: pending ? 0.5 : 1 }, pressStyle(pressed)]}
      >
        <Text variant="bodyStrong" color={ROLE.ink}>
          {label}
        </Text>
        <Icon name="copy" color={ROLE.ink} />
      </Pressable>
      {error ? (
        <Text variant="body" color={ROLE.muted} style={[SM, { flexShrink: 1 }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** The lead card: what's left this month, spent of budgeted, 12px cells, and the unplanned-spending note when there is one. */
function Hero({ data, onSetBudget }: { data: MobileBudgetsMonth; onSetBudget: (categoryId: string) => void }) {
  const remaining = formatMoney(data.leftToSpend, data.currency);
  const unplanned = data.suggestion?.kind === "unbudgeted" ? data.suggestion : null;
  return (
    <Reveal i={1}>
      <PixelFrame testID="budgets-hero" frame="px-card-raised" style={{ padding: 8, gap: 20 }}>
        <View>
          <Text variant="formLabel" color={ROLE.muted} accessibilityRole="header">
            Remaining
          </Text>
          <Text
            testID="budgets-remaining"
            variant={figureVariant(remaining)}
            color={data.leftToSpend < 0 ? ROLE.neg : ROLE.ink}
            style={{ marginTop: 12 }}
          >
            {remaining}
          </Text>
          <Text variant="body" color={ROLE.muted} style={[{ marginTop: 8 }, tnum(15)]}>
            <Text variant="bodyStrong" color={ROLE.ink}>
              {formatMoney(data.spent, data.currency)}
            </Text>
            {" spent of "}
            <Text variant="bodyStrong" color={ROLE.ink}>
              {formatMoney(data.budgeted, data.currency)}
            </Text>
            {" budgeted"}
          </Text>
          <View style={{ marginTop: 16 }}>
            <ProgressBar pct={data.spentPct} tone={data.tone} cellHeight={12} />
          </View>
        </View>
        {unplanned ? (
          <View testID="budgets-unplanned" style={{ alignItems: "flex-start", gap: 12 }}>
            <PixelFrame frame="px-warn" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 8, paddingVertical: 6 }}>
              <Icon name="warning" color={ROLE.warn} />
              <Text variant="body" color={ROLE.ink} style={{ flex: 1, fontSize: 14, lineHeight: 24 }}>
                <Text variant="bodyStrong" color={ROLE.ink} style={{ fontSize: 14, lineHeight: 24 }}>
                  {`${unplanned.name} has no budget.`}
                </Text>
                {` All ${formatMoney(unplanned.amount, data.currency)} of it counts as unplanned.`}
              </Text>
            </PixelFrame>
            <Button variant="secondary" icon="budgets" onPress={() => onSetBudget(unplanned.categoryId)}>
              {`Set ${unplanned.name} budget`}
            </Button>
          </View>
        ) : null}
      </PixelFrame>
    </Reveal>
  );
}

/** A category's card (web `BudgetCard`): what went out, the cells, what's left (or over) and the plan it's measured against. */
export function BudgetRow({
  b,
  currency,
  index,
  onOpen,
}: {
  b: MobileBudgetCategory;
  currency: string;
  index: number;
  onOpen: () => void;
}) {
  const unplanned = b.budget <= 0 && b.actual > 0;
  const over = b.state === "over" && b.budget > 0;
  const spent = formatMoney(b.actual, currency);
  return (
    <Reveal i={index + 2}>
      <Pressable
        testID="budget-card"
        accessibilityRole="button"
        accessibilityLabel={`${b.name}, ${spent} spent`}
        onPress={onOpen}
      >
        {({ pressed }) => (
          <PixelFrame
            frame="px-card"
            state={pressed ? ":is(a, button):hover" : ""}
            style={[{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 }, pressStyle(pressed)]}
          >
            <CategoryIcon name={b.name} tone={unplanned || over ? "wash" : "gray"} />
            <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <Text variant="listName" color={ROLE.ink} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {b.name}
                </Text>
                <Text variant="bodyStrong" color={ROLE.ink} style={[{ flexShrink: 0 }, tnum(15)]}>
                  {spent}
                </Text>
              </View>
              <ProgressBar pct={b.pctUsed} tone={b.state} start={index * 2} />
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                {unplanned ? (
                  <Text variant="listName" color={ROLE.neg} style={[SM, { flexShrink: 1 }]}>
                    No budget, all unplanned
                  </Text>
                ) : over ? (
                  <Text variant="listName" color={ROLE.neg} style={[SM, tnum(14), { flexShrink: 1 }]}>
                    {`Over by ${formatMoney(-b.remaining, currency)}`}
                  </Text>
                ) : b.budget > 0 ? (
                  <Text variant="body" color={ROLE.ink} style={[SM, tnum(14), { flexShrink: 1 }]}>
                    {formatMoney(b.remaining, currency)}
                    <Text variant="body" color={ROLE.muted} style={SM}>
                      {" left"}
                    </Text>
                  </Text>
                ) : (
                  <Text variant="body" color={ROLE.muted} style={[SM, { flexShrink: 1 }]}>
                    No budget set
                  </Text>
                )}
                {b.budget > 0 ? (
                  <Text variant="body" color={ROLE.muted} style={[SM, tnum(14), { flexShrink: 0 }]}>
                    {`of ${formatMoney(b.budget, currency)}`}
                  </Text>
                ) : (
                  <Text variant="bodyStrong" color={unplanned ? ROLE.neg : ROLE.ink} style={[SM, { flexShrink: 0 }]}>
                    Set budget
                  </Text>
                )}
              </View>
            </View>
          </PixelFrame>
        )}
      </Pressable>
    </Reveal>
  );
}

function MonthBody({
  data,
  onOpen,
  onNew,
}: {
  data: MobileBudgetsMonth;
  onOpen: (categoryId: string, editing: boolean) => void;
  onNew: () => void;
}) {
  return (
    <>
      <Hero data={data} onSetBudget={(id) => onOpen(id, true)} />
      <View style={{ marginTop: 40, gap: 12 }}>
        <SectionHead title="Categories" count={data.categories.length} />
        {data.categories.length === 0 ? (
          <EmptyState
            icon="budgets"
            title="You don't have a budget yet."
            body="Set a monthly limit per category to see how you're tracking."
            action={
              <Button icon="plus" onPress={onNew}>
                Build my budget
              </Button>
            }
          />
        ) : (
          <View style={{ gap: 16 }}>
            {data.categories.map((b, i) => (
              <BudgetRow key={b.id} b={b} currency={data.currency} index={i} onOpen={() => onOpen(b.id, false)} />
            ))}
          </View>
        )}
      </View>
    </>
  );
}

function AllTimeBody({ data }: { data: MobileBudgetsAllTime }) {
  if (data.allTime.length === 0) return <EmptyState icon="budgets" title="No spending recorded yet." />;
  return (
    <View style={{ gap: 12 }}>
      <SectionHead title="All time" count={data.allTime.length} />
      <PixelFrame testID="budgets-all-time" frame="px-card" style={{ padding: 8 }}>
        {data.allTime.map((r, i) => (
          <View
            key={r.categoryId}
            testID="budgets-all-time-row"
            style={[
              { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: i === 0 ? 0 : 12, paddingBottom: i === data.allTime.length - 1 ? 0 : 12 },
              i > 0 ? { borderTopWidth: 1, borderTopColor: COLOR.divider } : null,
            ]}
          >
            <CategoryIcon name={r.name} />
            <Text variant="listName" color={ROLE.ink} numberOfLines={1} style={{ flex: 1 }}>
              {r.name}
            </Text>
            <Text variant="bodyStrong" color={ROLE.ink} style={tnum(15)}>
              {formatMoney(r.total, data.currency)}
            </Text>
          </View>
        ))}
      </PixelFrame>
    </View>
  );
}

/**
 * The Budgets screen (web budgets-view.tsx, phone layout): the header with the month and "New", the This month / All time
 * range with "Copy last month", then either the Remaining hero and a card per category (their cells cascading two steps
 * apart) or every category's all-time spending. Every figure is the server's (`/api/mobile/budgets`); nothing is summed here.
 */
export function BudgetsView({
  month,
  range,
  data,
  onMonth,
  onRange,
  onOpen,
  onNew,
  copy,
}: {
  month: string;
  range: BudgetsRange;
  data: MobileBudgets;
  onMonth: (month: string) => void;
  onRange: (range: BudgetsRange) => void;
  onOpen: (categoryId: string, editing: boolean) => void;
  onNew: () => void;
  copy: { pending: boolean; error: string | null; onCopy: () => void };
}) {
  return (
    <View>
      <PageHeader
        title="Budgets"
        month={<MonthNav month={month} onChange={onMonth} />}
        action={
          range === "month" ? (
            <Button icon="plus" accessibilityLabel="New budget" onPress={onNew}>
              New
            </Button>
          ) : undefined
        }
      />
      <View style={{ marginBottom: 24, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <SegmentedControl
          label="Range"
          value={range}
          onChange={onRange}
          options={[
            { value: "month", label: "This month" },
            { value: "all", label: "All time" },
          ]}
        />
        {range === "month" ? <CopyLastMonth {...copy} /> : null}
      </View>
      {data.range === "all" ? <AllTimeBody data={data} /> : <MonthBody data={data} onOpen={onOpen} onNew={onNew} />}
    </View>
  );
}
