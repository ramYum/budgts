import { useState } from "react";
import { Pressable, View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { formatDayShort, formatMoney } from "../../lib/shared";
import type { MutationOutcome } from "../../lib/api/load";
import type { NeedsCategoryGroup } from "../../lib/transactions/activity-api";
import type { CategoryFields, CategoryWrite } from "../../lib/categories/manage";
import type { CategoryChoice } from "../../lib/transactions/use-transaction-commands";
import { Button, IconTile, TextButton } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { pressStyle } from "../kit/press";
import { Select } from "../kit/select";
import { CategorySheet } from "../settings/category-form";

/** Merchants shown before "Show N more" (the web's phone layout). */
export const FIRST = 3;

const SMALL = { fontSize: 14, lineHeight: 20 } as const;
const TNUM = { fontVariant: ["tabular-nums" as const] };

const shortDate = (iso: string) => formatDayShort(iso);

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
          <Text variant="small" color={pressed ? ROLE.ink : ROLE.muted}>
            {open ? "▾" : "▸"} Show {group.count} transactions
          </Text>
        )}
      </Pressable>
      {open ? (
        <View style={{ marginTop: 8, gap: 6, borderLeftWidth: 2, borderLeftColor: ROLE.hairline, paddingLeft: 12 }}>
          {group.transactions.map((t) => (
            <View key={t.id} style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <Text variant="small" color={ROLE.muted} style={{ flexShrink: 1, minWidth: 0 }}>
                {t.description || "Transaction"}
              </Text>
              <Text variant="small" color={ROLE.muted} style={[TNUM, { flexShrink: 0 }]}>
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

/** "FOOD_AND_DRINK" → "Food and drink": Plaid's own guess, shown as a hint (web `humanizePfc`). */
export function humanizePfc(v: string | null): string | null {
  if (!v) return null;
  const s = v.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STD_PREFIX = "std:";
const STD_HEADING = "__std_heading";
export const NEW_CATEGORY = "__new__";

/** The picker's choices: the user's categories, the standard ones they no longer have (web optgroup), then "+ New category…". */
export function pickerOptions(categories: { id: string; name: string }[], missingStandard: string[]) {
  return [
    ...categories.map((c) => ({ value: c.id, label: c.name })),
    ...(missingStandard.length > 0
      ? [
          { value: STD_HEADING, label: "Restore a default category", disabled: true },
          ...missingStandard.map((name) => ({ value: `${STD_PREFIX}${name}`, label: name })),
        ]
      : []),
    { value: NEW_CATEGORY, label: "+ New category…" },
  ];
}

/** A picker value as the categorize command's choice. */
export function choiceOf(value: string): CategoryChoice {
  return value.startsWith(STD_PREFIX) ? { standardCategoryName: value.slice(STD_PREFIX.length) } : { categoryId: value };
}

/** A failed pick's sentence: the server's own for a rejected choice, else the load layer's. */
function failure(out: MutationOutcome): string {
  if (out.status === "error") return out.message;
  if (out.status === "invalid") return out.fieldErrors.form ?? "Couldn't use that category. Try again.";
  return "Something went wrong. Please try again.";
}

/**
 * "Needs a category" (web `src/components/plaid/needs-category.tsx`): bank rows Budgts could not confidently categorize,
 * one group per merchant (grouped by the server), so one decision clears every purchase from that merchant. The lead card on
 * Activity; three merchants, then "Show N more". A pick hides its group at once and sends the choice for the group's newest
 * row; a failure brings the group back and says why. A suggestion is offered as a one-tap chip, never applied without it.
 */
export function NeedsCategory({
  groups,
  currency,
  categories,
  missingStandard,
  onCategorize,
  onRescan,
  onCreateCategory,
  newRequestId,
}: {
  groups: NeedsCategoryGroup[];
  currency: string;
  categories: { id: string; name: string }[];
  missingStandard: string[];
  onCategorize: (anchorId: string, choice: CategoryChoice) => Promise<MutationOutcome>;
  onRescan: () => Promise<MutationOutcome>;
  /** "+ New category…": creates the category (the Categories screen's command), then it is used for the group */
  onCreateCategory: (fields: CategoryFields, requestId: string | undefined) => Promise<CategoryWrite>;
  newRequestId: () => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [addingFor, setAddingFor] = useState<NeedsCategoryGroup | null>(null);

  const visible = groups.filter((g) => !done.has(g.key));
  if (visible.length === 0) return null;

  const names = new Map(categories.map((c) => [c.id, c.name]));
  const options = pickerOptions(categories, missingStandard);

  async function pick(group: NeedsCategoryGroup, value: string) {
    setError(null);
    setDone((prev) => new Set(prev).add(group.key));
    const out = await onCategorize(group.anchorId, choiceOf(value));
    // gone already (404) is as good as done: the refresh drops it
    if (out.status === "ok" || out.status === "missing") return;
    setDone((prev) => {
      const next = new Set(prev);
      next.delete(group.key);
      return next;
    });
    setError(failure(out));
  }

  async function rescan() {
    setError(null);
    setRescanning(true);
    const out = await onRescan();
    setRescanning(false);
    if (out.status !== "ok") setError(failure(out));
  }

  const totalTxns = visible.reduce((n, g) => n + g.count, 0);
  const shown = expanded ? visible : visible.slice(0, FIRST);
  const hidden = visible.length - shown.length;
  const a11y = `Needs a category, ${totalTxns} ${totalTxns === 1 ? "transaction" : "transactions"} from ${visible.length} ${
    visible.length === 1 ? "merchant" : "merchants"
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
        <View style={{ marginVertical: -6 }}>
          <TextButton testID="needs-category-rescan" iconAfter="sync" disabled={rescanning} onPress={() => void rescan()}>
            {rescanning ? "Re-scanning…" : "Re-scan"}
          </TextButton>
        </View>
      </View>

      <Text variant="small" color={ROLE.muted} style={{ marginTop: 4 }}>
        Pick once and it applies to every purchase from that merchant. Missing one? Choose{" "}
        <Text variant="listName" color={COLOR.graphite} style={SMALL}>
          + New category
        </Text>
        .
      </Text>

      <View style={{ marginTop: 8 }}>
        {shown.map((group, i) => {
          const suggestedName = group.suggestedCategoryId ? (names.get(group.suggestedCategoryId) ?? null) : null;
          const pfc = suggestedName ? null : humanizePfc(group.plaidCategoryPrimary);
          return (
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
                  <Text variant="small" color={ROLE.muted} numberOfLines={1}>
                    {groupMeta(group)}
                  </Text>
                </View>
                <Text variant="bodyStrong" color={group.netAmount < 0 ? ROLE.pos : ROLE.ink} style={[TNUM, { flexShrink: 0 }]}>
                  {formatNet(group.netAmount, currency)}
                </Text>
              </View>

              {suggestedName ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <Text variant="small" color={ROLE.muted}>
                    Looks like
                  </Text>
                  <Pressable
                    testID="needs-category-suggestion"
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${suggestedName}`}
                    onPress={() => void pick(group, group.suggestedCategoryId!)}
                    hitSlop={6}
                  >
                    {({ pressed }) => (
                      <PixelFrame
                        frame="px-chip"
                        state={pressed ? ":hover" : ""}
                        style={[{ height: 32, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 6 }, pressStyle(pressed)]}
                      >
                        <Icon name="check" color={ROLE.ink} />
                        <Text variant="listName" color={ROLE.ink}>
                          {suggestedName}
                        </Text>
                      </PixelFrame>
                    )}
                  </Pressable>
                </View>
              ) : null}

              <Select
                testID="needs-category-picker"
                label={`Category for ${group.label}`}
                hideLabel
                value={null}
                placeholder={suggestedName ? "Choose another" : "Choose a category"}
                options={options}
                plaidHint={pfc}
                onChange={(v) => (v === NEW_CATEGORY ? setAddingFor(group) : void pick(group, v))}
              />

              {group.count > 1 ? <GroupTransactions group={group} currency={currency} /> : null}
            </View>
          );
        })}
      </View>

      {hidden > 0 ? (
        <Button testID="needs-category-more" variant="secondary" iconAfter="chevron-down" style={{ marginTop: 16 }} onPress={() => setExpanded(true)}>
          {`Show ${hidden} more`}
        </Button>
      ) : null}

      {addingFor ? (
        <CategorySheet
          title={`New category for ${addingFor.label}`}
          submitLabel="Add & use"
          newRequestId={newRequestId}
          save={onCreateCategory}
          onDone={(created) => {
            const group = addingFor;
            setAddingFor(null);
            if (created) void pick(group, created.id);
          }}
        />
      ) : null}

      {error ? (
        <Text testID="needs-category-error" variant="small" color={ROLE.neg} accessibilityRole="alert" style={{ marginTop: 12 }}>
          {error}
        </Text>
      ) : null}
    </PixelFrame>
  );
}
