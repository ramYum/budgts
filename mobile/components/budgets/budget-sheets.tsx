import { useState } from "react";
import { View } from "react-native";
import { budgetTrendPct } from "../../../src/lib/figures/budget-trend";
import { COLOR, ROLE } from "../../lib/brand/shared";
import type { MobileBudgetCategory } from "../../lib/budgets/budgets-api";
import { formatMoney } from "../../lib/home/format";
import { Button, Field } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { Overlay } from "../kit/overlay";
import { ProgressBar } from "../kit/progress-bar";
import { Select } from "../kit/select";
import { CategoryIcon } from "../kit/tiles";

/** Saves one category's budget for the month; resolves to the message to show, or null once saved. */
export type SaveBudget = (categoryId: string, amount: string) => Promise<string | null>;

const tnum = { fontVariant: ["tabular-nums" as const], letterSpacing: -0.15 };

/** The amount field as the web prefills it: the budget in major units with two decimals, empty when there is none. */
export function toInput(minor: number): string {
  return minor > 0 ? (minor / 100).toFixed(2) : "";
}

/** "Monthly budget" and Save (web budgets-view.tsx `AmountForm`): an empty field clears the budget. */
function AmountForm({ categoryId, initial, onSave, onSaved }: { categoryId: string; initial: number; onSave: SaveBudget; onSaved: () => void }) {
  const [value, setValue] = useState(toInput(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async () => {
    setError(null);
    setPending(true);
    const message = await onSave(categoryId, value || "0");
    setPending(false);
    if (message) setError(message);
    else onSaved();
  };

  return (
    <View style={{ gap: 12 }}>
      <Field
        testID="budget-amount"
        label="Monthly budget"
        keyboardType="decimal-pad"
        placeholder="0.00"
        value={value}
        editable={!pending}
        invalid={!!error}
        onChangeText={setValue}
        onSubmitEditing={() => void save()}
        autoFocus
      />
      {error ? (
        <Text testID="budget-amount-error" variant="body" color={ROLE.neg} style={{ fontSize: 14, lineHeight: 20 }}>
          {error}
        </Text>
      ) : null}
      <Button testID="budget-save" loading={pending} onPress={() => void save()}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </View>
  );
}

/**
 * A category's sheet (web budgets-view.tsx `CategoryDetail`): what went out against the plan, the cells, what's left or
 * over, the change against last month, then "Change budget" (the amount form in place) and "See transactions".
 */
export function CategorySheet({
  bar,
  currency,
  startEditing,
  onSave,
  onSeeTransactions,
  onClose,
}: {
  bar: MobileBudgetCategory;
  currency: string;
  startEditing: boolean;
  onSave: SaveBudget;
  onSeeTransactions: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const trend = budgetTrendPct(bar.actual, bar.previousActual);
  const over = bar.state === "over";

  return (
    <Overlay title={bar.name} onClose={onClose}>
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <CategoryIcon name={bar.name} tone={over ? "wash" : "gray"} />
          <View>
            <Text testID="budget-sheet-spent" variant="tNumLg" color={ROLE.ink}>
              {formatMoney(bar.actual, currency)}
            </Text>
            <Text variant="body" color={ROLE.muted} style={{ fontSize: 14, lineHeight: 20 }}>
              {bar.budget > 0 ? `of ${formatMoney(bar.budget, currency)} budget` : "no budget set"}
            </Text>
          </View>
        </View>

        <ProgressBar pct={bar.pctUsed} tone={bar.state} />

        <PixelFrame testID="budget-sheet-figures" frame="px-card" style={{ padding: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 16, paddingBottom: trend !== null ? 12 : 0 }}>
            <Text variant="body" color={ROLE.muted}>
              {over ? "Over by" : "Remaining"}
            </Text>
            <Text testID="budget-sheet-remaining" variant="body" color={over && bar.budget > 0 ? ROLE.neg : ROLE.ink} style={tnum}>
              {bar.budget > 0 ? formatMoney(Math.abs(bar.remaining), currency) : "No budget"}
            </Text>
          </View>
          {trend !== null ? (
            <View
              testID="budget-sheet-trend"
              style={{ flexDirection: "row", justifyContent: "space-between", gap: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLOR.divider }}
            >
              <Text variant="body" color={ROLE.muted}>
                vs. last month
              </Text>
              <Text testID="budget-sheet-trend-value" variant="body" color={trend > 0 ? ROLE.neg : ROLE.pos} style={tnum}>
                {`${trend > 0 ? "↑" : "↓"} ${Math.abs(trend)}%`}
              </Text>
            </View>
          ) : null}
        </PixelFrame>

        {editing ? (
          <AmountForm categoryId={bar.id} initial={bar.budget} onSave={onSave} onSaved={() => setEditing(false)} />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <Button testID="budget-sheet-change" variant="secondary" icon="budgets" style={{ flex: 1 }} onPress={() => setEditing(true)}>
              Change budget
            </Button>
            <Button testID="budget-sheet-transactions" style={{ flex: 1 }} onPress={onSeeTransactions}>
              See transactions
            </Button>
          </View>
        )}
      </View>
    </Overlay>
  );
}

/** "New budget" (web budgets-view.tsx `AddBudget`): pick a category without a budget, then the amount form. */
export function NewBudgetSheet({
  categories,
  onSave,
  onClose,
}: {
  categories: { id: string; name: string }[];
  onSave: SaveBudget;
  onClose: () => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  if (categories.length === 0) {
    return (
      <Overlay title="New budget" onClose={onClose}>
        <Text variant="body" color={ROLE.muted}>
          Every expense category already has a budget.
        </Text>
      </Overlay>
    );
  }
  return (
    <Overlay title="New budget" onClose={onClose}>
      <View style={{ gap: 16 }}>
        <Select
          label="Category"
          value={categoryId}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          onChange={setCategoryId}
        />
        <AmountForm categoryId={categoryId} initial={0} onSave={onSave} onSaved={onClose} />
      </View>
    </Overlay>
  );
}
