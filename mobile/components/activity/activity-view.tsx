import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import type { LoadState, MutationOutcome } from "../../lib/api/load";
import type { CategoryFields, CategoryWrite } from "../../lib/categories/manage";
import type { CategoryChoice } from "../../lib/transactions/use-transaction-commands";
import type { ActivityExtras } from "../../lib/transactions/activity-api";
import { KIND_OPTIONS, SLICE, dayTotals, filterActivity, type ActivityKind } from "../../lib/transactions/activity-view";
import type { LedgerState } from "../../lib/transactions/use-ledger";
import type { MobileTransaction } from "../../lib/transactions/transactions-api";
import { ConnectBank } from "../banks/connect-bank";
import { Button, IconTile } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { Skeleton } from "../feedback/skeleton";
import { MonthNav } from "../kit/month-nav";
import { PageHeader } from "../kit/page-header";
import { pressStyle } from "../kit/press";
import { SegmentedControl } from "../kit/segmented-control";
import { Reveal } from "../motion/reveal";
import { LimitedHistoryBanner, WarnLine } from "./limited-history-banner";
import { NeedsCategory } from "./needs-category";
import { SearchField } from "./search-field";
import { ShowMore } from "./show-more";
import { TransactionDays } from "./transaction-days";

const SMALL = { fontSize: 14, lineHeight: 20 } as const;

/** "Showing Groceries · Clear": the list narrowed to one category, reached from Home, Budgets, Insights or Categories. */
function CategoryBand({ name, onClear }: { name: string; onClear: () => void }) {
  return (
    <PixelFrame
      testID="category-band"
      frame="px-band"
      style={{ marginBottom: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 8, paddingVertical: 4 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, minWidth: 0 }}>
        <Icon name="categories" color={COLOR.graphite} />
        <Text variant="body" color={ROLE.ink} numberOfLines={1} style={{ flexShrink: 1 }}>
          Showing{" "}
          <Text variant="bodyStrong" color={ROLE.ink}>
            {name}
          </Text>
        </Text>
      </View>
      <Pressable testID="category-band-clear" accessibilityRole="button" accessibilityLabel="Clear" onPress={onClear} hitSlop={8}>
        {({ pressed }) => (
          <View style={[{ flexDirection: "row", alignItems: "center", gap: 4, marginVertical: -4 }, pressStyle(pressed)]}>
            <Text variant="listName" color={pressed ? ROLE.ink : COLOR.graphite}>
              Clear
            </Text>
            <Icon name="close" color={pressed ? ROLE.ink : COLOR.graphite} />
          </View>
        )}
      </Pressable>
    </PixelFrame>
  );
}

/** "Connect a bank to fill this in on its own": an empty month where bank connections are on (web page's prompt card). */
function ConnectBankCard() {
  return (
    <PixelFrame testID="connect-bank-card" frame="px-card" style={{ alignItems: "flex-start", gap: 12, padding: 12 }}>
      <IconTile name="bank" />
      <Text variant="body" color={COLOR.graphite}>
        Connect a bank to fill this in on its own, or add a transaction by hand.
      </Text>
      <ConnectBank tone="outline" />
    </PixelFrame>
  );
}

/** The month has no transactions (web `TransactionList` empty card): sleepy Crystal and the way to add one. */
function NoTransactions() {
  return (
    <PixelFrame testID="activity-empty" frame="px-card" style={{ alignItems: "flex-start", gap: 8, padding: 16 }}>
      <Robin mood="sleepy" scale={2} />
      <Text variant="listName" color={ROLE.ink} style={{ marginTop: 8 }}>
        No transactions this month yet.
      </Text>
      <Text variant="body" color={ROLE.muted} style={SMALL}>
        Add your first with{" "}
        <Text variant="bodyStrong" color={ROLE.ink} style={SMALL}>
          Add
        </Text>
        , or connect a bank and they arrive on their own.
      </Text>
    </PixelFrame>
  );
}

export type ActivityViewProps = {
  month: string;
  onMonth: (month: string) => void;
  currency: string;
  /** the category the list is narrowed to (its name once the categories load), or null */
  category: { id: string; name: string } | null;
  onClearCategory: () => void;
  /** the month once its first page is in (loading and a failed month are the screen's skeleton and failure states) */
  ledger: LedgerState;
  /** a failed pull to refresh: the list stays, this says why it isn't fresh */
  notice: string | null;
  onRetryRest: () => void;
  extras: LoadState<ActivityExtras>;
  onRetryExtras: () => void;
  /** category id → kind, to mark a refund */
  kinds: Map<string, "expense" | "income">;
  onAdd: () => void;
  onOpen: (t: MobileTransaction) => void;
  /** the user's categories, for the needs-category picker */
  categories: { id: string; name: string }[];
  onCategorize: (anchorId: string, choice: CategoryChoice) => Promise<MutationOutcome>;
  onRescan: () => Promise<MutationOutcome>;
  onCreateCategory: (fields: CategoryFields, requestId: string | undefined) => Promise<CategoryWrite>;
  newRequestId: () => string;
};

/**
 * Activity (web `src/app/(app)/(dashboard)/transactions/page.tsx` + `src/components/transaction-list.tsx`) at phone width:
 * the header with the month and Add, the limited-history advisory, the category band, "Needs a category" leading, the
 * connect prompt for an empty month, then the search, the All / Spending / Income / Transfers control and the month's rows
 * in day bands. The search and the kind filter cover every row of the month, as on the web.
 */
export function ActivityView(p: ActivityViewProps) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<ActivityKind>("all");
  const [shown, setShown] = useState(SLICE);
  const showMore = useCallback(() => setShown((n) => n + SLICE), []);

  const items = p.ledger.status === "ready" ? p.ledger.page.items : null;
  const filtered = useMemo(() => (items ? filterActivity(items, search, kind) : []), [items, search, kind]);
  const visible = useMemo(() => filtered.slice(0, shown), [filtered, shown]);
  const totals = useMemo(() => dayTotals(filtered), [filtered]);

  const extras = p.extras.status === "ready" ? p.extras.data : null;
  const showConnect = !!extras?.plaidEnabled && items !== null && items.length === 0 && !p.category;

  return (
    <View testID="activity-view">
      <PageHeader
        title="Activity"
        month={<MonthNav month={p.month} onChange={p.onMonth} />}
        action={
          <Button testID="activity-add" icon="plus" accessibilityLabel="Add transaction" onPress={p.onAdd}>
            Add
          </Button>
        }
      />

      {p.notice ? (
        <View style={{ marginBottom: 24 }}>
          <WarnLine testID="activity-notice">{p.notice}</WarnLine>
        </View>
      ) : null}

      {extras ? <LimitedHistoryBanner messages={extras.limitedHistory} /> : null}

      {p.category ? <CategoryBand name={p.category.name} onClear={p.onClearCategory} /> : null}

      <View style={{ gap: 24 }}>
        {extras && extras.needsCategory.length > 0 ? (
          <NeedsCategory
            groups={extras.needsCategory}
            currency={p.currency}
            categories={p.categories}
            missingStandard={extras.missingStandardCategories}
            onCategorize={p.onCategorize}
            onRescan={p.onRescan}
            onCreateCategory={p.onCreateCategory}
            newRequestId={p.newRequestId}
          />
        ) : null}
        {p.extras.status === "error" ? (
          <WarnLine testID="needs-category-error" action={{ label: "Try again", onPress: p.onRetryExtras }}>
            {"Couldn't check for purchases that need a category."}
          </WarnLine>
        ) : null}

        {showConnect ? <ConnectBankCard /> : null}

        {items !== null && items.length === 0 ? <NoTransactions /> : null}

        {items !== null && items.length > 0 ? (
          <>
            <View style={{ gap: 12 }}>
              <SearchField
                value={search}
                onChangeText={(t) => {
                  setSearch(t);
                  setShown(SLICE);
                }}
              />
              <SegmentedControl
                label="Show"
                value={kind}
                options={KIND_OPTIONS}
                onChange={(v) => {
                  setKind(v);
                  setShown(SLICE);
                }}
              />
            </View>
            {filtered.length === 0 ? (
              <PixelFrame testID="activity-no-match" frame="px-card" style={{ padding: 16 }}>
                <Text variant="body" color={ROLE.muted} style={{ textAlign: "center" }}>
                  No matching transactions.
                </Text>
              </PixelFrame>
            ) : (
              <>
                <Reveal i={1}>
                  <PixelFrame testID="activity-list" frame="px-card" style={{ paddingBottom: 4 }}>
                    <TransactionDays rows={visible} totals={totals} kinds={p.kinds} currency={p.currency} onOpen={p.onOpen} />
                  </PixelFrame>
                </Reveal>
                {filtered.length > visible.length ? (
                  <ShowMore remaining={filtered.length - visible.length} slice={SLICE} onMore={showMore} />
                ) : null}
              </>
            )}
          </>
        ) : null}

        {p.ledger.status === "ready" && p.ledger.cursor !== null && !p.ledger.restError ? (
          <View testID="activity-rest-loading" accessibilityLabel="Loading the rest of the month" style={{ gap: 8 }}>
            <Skeleton width="100%" height={56} />
            <Skeleton width="100%" height={56} />
          </View>
        ) : null}

        {p.ledger.status === "ready" && p.ledger.restError ? (
          <WarnLine testID="activity-rest-error" action={{ label: "Try again", onPress: p.onRetryRest }}>
            {`Some of this month's transactions didn't load. ${p.ledger.restError}`}
          </WarnLine>
        ) : null}
      </View>
    </View>
  );
}
