import { Pressable, View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import type { MobileHome } from "../../lib/home/contract";
import { formatMoney, formatSavingsRate } from "../../lib/shared";
import { heroLine, keptPct } from "../../lib/home/view";
import { figureVariant } from "../kit/figure";
import { Rule } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { ProgressBar } from "../kit/progress-bar";
import { pressStyle } from "../kit/press";
import { CrystalPerch } from "../crystal/crystal-perch";
import { RollingAmount } from "../motion/rolling-amount";
import { Rise } from "../motion/rise";
import { TNUM } from "./type";


/** "+$3,200.00" / "−$1,748.54", or a plain zero (web `signed`). */
function signed(value: number, currency: string, direction: "in" | "out") {
  if (value === 0) return formatMoney(0, currency);
  return `${direction === "in" ? "+" : "−"}${formatMoney(value, currency)}`;
}

/** The sentence under the figure (web: `quiet` / no income / more out than in / the share kept). */
function HeroLine({ home }: { home: MobileHome }) {
  const line = heroLine(home);
  const negative = home.moneyLeft < 0;
  const color = negative ? ROLE.neg : ROLE.muted;
  return (
    <Text testID="home-hero-line" variant="body" color={color} style={TNUM}>
      {line === "quiet" ? (
        "Add income or connect a bank and your month appears here."
      ) : line === "no-income" ? (
        "No income yet this month."
      ) : line === "negative" ? (
        <>
          {/* the server's Money Left, shown without its sign: "$120.00 more went out than came in" */}
          <Text variant="bodyStrong" color={color}>
            {formatMoney(-home.moneyLeft, home.currency)}
          </Text>{" "}
          more went out than came in.
        </>
      ) : (
        <>
          <Text variant="bodyStrong" color={ROLE.ink}>
            {formatSavingsRate(home.savingsRate!)}
          </Text>{" "}
          of this month&apos;s income kept.
        </>
      )}
    </Text>
  );
}

/**
 * The month's held rows, under the note (web `home-held`): they count toward no figure until released, so the card says
 * so and links to Connected banks, where the account's money-direction check releases them. Absent when none is held.
 */
function HeldLine({ count, onCheck }: { count: number; onCheck: () => void }) {
  if (count <= 0) return null;
  return (
    <Rise testID="home-held" at={820} style={{ marginTop: 8, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <View style={{ marginTop: 4 }}>
        <Icon name="pending" size={12} color={ROLE.warn} />
      </View>
      <Text variant="meta" color={ROLE.warn} style={{ flex: 1 }}>
        {`${count} ${count === 1 ? "transaction isn't" : "transactions aren't"} counted yet. `}
        <Text
          testID="home-held-link"
          variant="metaStrong"
          color={ROLE.warn}
          accessibilityRole="link"
          onPress={onCheck}
          style={{ textDecorationLine: "underline" }}
        >
          {count === 1 ? "Check it" : "Check them"}
        </Text>
      </Text>
    </Rise>
  );
}

/**
 * The hero (web dashboard-view.tsx, the `home-money-left` section at phone
 * width): Money left as one rolling figure that steps down a size when it is
 * long, the sentence and cells for what was kept, then Came in (with the add
 * income plus) and Went out side by side, the note on what the figure is,
 * and the month's held rows when there are any.
 * Crystal perches on its top edge, in the 48px Home leaves above it.
 */
export function MoneyLeftCard({
  home,
  name,
  awake,
  layoutKey,
  onAddIncome,
  onCheckHeld,
}: {
  home: MobileHome;
  name: string;
  /** Home is the screen in front and the app is active (Crystal pauses otherwise) */
  awake: boolean;
  /** what sits above the card right now (Crystal re-measures her place when it changes) */
  layoutKey: string;
  onAddIncome: () => void;
  /** "Check them": opens Connected banks */
  onCheckHeld: () => void;
}) {
  const { currency } = home;
  const negative = home.moneyLeft < 0;
  const figure = formatMoney(home.moneyLeft, currency);

  return (
    <View testID="home-money-left">
      <PixelFrame frame="px-card-raised" style={{ padding: 8 }}>
        <View style={{ gap: 20 }}>
          <View style={{ minWidth: 0 }}>
            <Text variant="formLabel" color={ROLE.muted} accessibilityRole="header">
              Money left
            </Text>
            <View style={{ marginTop: 12 }}>
              <RollingAmount
                value={home.moneyLeft}
                currency={currency}
                variant={figureVariant(figure)}
                color={negative ? ROLE.neg : ROLE.ink}
              />
            </View>
            <Rise at={560} style={{ marginTop: 8 }}>
              <HeroLine home={home} />
            </Rise>
            <View style={{ marginTop: 16, maxWidth: 444 }}>
              <ProgressBar pct={keptPct(home.savingsRate)} tone={negative ? "over" : "under"} cellHeight={12} />
            </View>
          </View>
          <Rule />
          <View style={{ flexDirection: "row", gap: 16 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ minHeight: 28, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text variant="small" color={ROLE.muted}>
                  Came in
                </Text>
                <Pressable
                  testID="home-add-income"
                  accessibilityRole="button"
                  accessibilityLabel="Add income"
                  onPress={onAddIncome}
                  hitSlop={8}
                  style={({ pressed }) => [
                    { width: 28, height: 28, marginVertical: -4, alignItems: "center", justifyContent: "center" },
                    pressStyle(pressed),
                  ]}
                >
                  {({ pressed }) => <Icon name="plus" color={pressed ? ROLE.ink : ROLE.muted} />}
                </Pressable>
              </View>
              <Text testID="home-came-in" variant="tNum" color={home.income > 0 ? ROLE.pos : ROLE.ink}>
                {signed(home.income, currency, "in")}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ minHeight: 28, flexDirection: "row", alignItems: "center" }}>
                <Text variant="small" color={ROLE.muted}>
                  Went out
                </Text>
              </View>
              <Text testID="home-went-out" variant="tNum" color={ROLE.ink}>
                {signed(home.spent, currency, "out")}
              </Text>
            </View>
          </View>
        </View>
        <Rule style={{ marginTop: 20 }} />
        <Rise at={760} style={{ marginTop: 16, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ marginTop: 4 }}>
            <Icon name="info" size={12} color={ROLE.muted} />
          </View>
          <Text variant="meta" color={ROLE.muted} style={{ flex: 1 }}>
            Income minus spending. Not your savings balance.
          </Text>
        </Rise>
        <HeldLine count={home.heldCount} onCheck={onCheckHeld} />
      </PixelFrame>
      {/* Crystal perches on the card's top edge; drawn after it so she stands in front */}
      <CrystalPerch name={name} savingsRate={home.savingsRate} awake={awake} layoutKey={layoutKey} />
    </View>
  );
}
