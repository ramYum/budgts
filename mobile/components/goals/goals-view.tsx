import { View, type TextStyle } from "react-native";
import { savingsPct } from "../../../src/lib/figures/savings-pct";
import { ROLE } from "../../lib/brand/shared";
import { formatTargetDate, type MobileGoal, type MobileGoals } from "../../lib/goals/goals-api";
import { formatMoney } from "../../lib/home/format";
import { Button, IconTile, TextButton } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { figureVariant } from "../kit/figure";
import { PageHeader } from "../kit/page-header";
import { ProgressBar } from "../kit/progress-bar";
import { RowMenu } from "../kit/row-menu";
import { SectionHead } from "../kit/section-head";
import { Badge } from "../kit/tiles";
import { Reveal } from "../motion/reveal";

/** The web's `.tnum`: tabular figures, tightened by a hundredth of an em. */
const tnum = (size: number): TextStyle => ({ fontVariant: ["tabular-nums"], letterSpacing: -0.01 * size });
const SM: TextStyle = { fontSize: 14, lineHeight: 20 };

export type GoalAction = "add" | "withdraw" | "edit" | "archive";

/** One goal's card (web goals-view.tsx `GoalCard`): name, what's to go and by when, its share, saved of target, growth cells, actions. */
export function GoalCard({
  g,
  currency,
  index,
  archiving,
  onAction,
}: {
  g: MobileGoal;
  currency: string;
  index: number;
  archiving: boolean;
  onAction: (action: GoalAction, goal: MobileGoal) => void;
}) {
  return (
    <Reveal i={index + 2}>
      <PixelFrame testID="goal-card" frame="px-card" style={{ padding: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <IconTile name="goals" tone={g.complete ? "growth" : "gray"} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="listName" color={ROLE.ink} numberOfLines={1}>
              {g.name}
            </Text>
            <Text variant="body" color={ROLE.muted} style={[SM, tnum(14)]}>
              {g.complete ? "Reached" : `${formatMoney(g.remaining, currency)} to go`}
              {g.targetDate ? ` · by ${formatTargetDate(g.targetDate).replace(/ /g, " ")}` : ""}
            </Text>
          </View>
          <Badge tone="growth">{`${g.pct}%`}</Badge>
        </View>

        <Text variant="body" color={ROLE.muted} style={[{ marginTop: 20 }, tnum(15)]}>
          <Text variant="bodyStrong" color={ROLE.ink}>
            {formatMoney(g.saved, currency)}
          </Text>
          {` of ${formatMoney(g.target, currency)}`}
        </Text>
        <View style={{ marginTop: 8 }}>
          <ProgressBar pct={g.pct} tone="growth" cellHeight={10} start={index * 3} />
        </View>

        <View style={{ marginTop: 20, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Button variant="secondary" icon="plus" onPress={() => onAction("add", g)}>
            Add money
          </Button>
          <TextButton onPress={() => onAction("withdraw", g)}>
            Withdraw
          </TextButton>
          <View style={{ marginLeft: "auto", marginRight: -8 }}>
            <RowMenu
              label={`More for ${g.name}`}
              items={[
                { label: "Edit", icon: "edit", onSelect: () => onAction("edit", g) },
                { label: "Archive", icon: "archive", onSelect: () => onAction("archive", g), disabled: archiving },
              ]}
            />
          </View>
        </View>
      </PixelFrame>
    </Reveal>
  );
}

/** No goals yet (web goals-view.tsx): Crystal, curious, and the way to start one. */
function NoGoals() {
  return (
    <PixelFrame testID="goals-empty" frame="px-card-raised" style={{ alignItems: "flex-start", gap: 12, padding: 16 }}>
      <Robin mood="curious" scale={3} />
      <View>
        <Text variant="pxFigure" color={ROLE.ink}>
          No goals yet
        </Text>
        <Text variant="body" color={ROLE.muted} style={{ marginTop: 4 }}>
          {"A trip, a cushion, a big buy: add one with "}
          <Text variant="bodyStrong" color={ROLE.ink}>
            Add goal
          </Text>
          {" and watch it fill, cell by cell."}
        </Text>
      </View>
    </PixelFrame>
  );
}

/**
 * Savings goals (web goals-view.tsx, phone layout): the header with its back arrow and "Add", then either the empty
 * card or the Total saved hero and a card per goal (growth cells cascading three steps apart). Every figure is the
 * server's (`/api/mobile/goals`); the hero's share of the target is the web's own `savingsPct`.
 */
export function GoalsView({
  data,
  archiving,
  onBack,
  onNew,
  onAction,
}: {
  data: MobileGoals;
  /** the goal whose archive is in flight */
  archiving: string | null;
  onBack: () => void;
  onNew: () => void;
  onAction: (action: GoalAction, goal: MobileGoal) => void;
}) {
  const { summary, currency, goals } = data;
  const saved = formatMoney(summary.totalSaved, currency);
  const savedPct = savingsPct(summary.totalSaved, summary.totalTarget);
  return (
    <View style={{ paddingBottom: 8 }}>
      <PageHeader
        title="Savings goals"
        onBack={onBack}
        action={
          <Button icon="plus" accessibilityLabel="Add goal" onPress={onNew}>
            Add
          </Button>
        }
      />
      {goals.length === 0 ? (
        <NoGoals />
      ) : (
        <>
          <Reveal i={1}>
            <PixelFrame testID="goals-hero" frame="px-card-raised" style={{ padding: 8 }}>
              <Text variant="formLabel" color={ROLE.muted} accessibilityRole="header">
                Total saved
              </Text>
              <Text testID="goals-total" variant={figureVariant(saved)} color={ROLE.ink} style={{ marginTop: 12 }}>
                {saved}
              </Text>
              <View style={{ marginTop: 12 }}>
                <ProgressBar pct={savedPct} tone="growth" cellHeight={12} />
              </View>
              <Text testID="goals-summary" variant="body" color={ROLE.muted} style={[{ marginTop: 12 }, tnum(15)]}>
                {`${savedPct}% of `}
                <Text variant="bodyStrong" color={ROLE.ink}>
                  {formatMoney(summary.totalTarget, currency)}
                </Text>
                {` across ${summary.activeCount} ${summary.activeCount === 1 ? "goal" : "goals"}`}
                {summary.completeCount > 0 ? ` · ${summary.completeCount} reached` : ""}
              </Text>
            </PixelFrame>
          </Reveal>

          <View style={{ marginTop: 40, gap: 12 }}>
            <SectionHead title="Goals" count={goals.length} />
            <View style={{ gap: 16 }}>
              {goals.map((g, i) => (
                <GoalCard key={g.id} g={g} currency={currency} index={i} archiving={archiving === g.id} onAction={onAction} />
              ))}
            </View>
          </View>
        </>
      )}
    </View>
  );
}
