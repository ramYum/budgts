import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { useScrollWatch } from "../motion/scroll-context";
import { HEADER_HEIGHT } from "../shell/app-header";
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
      <Pressable testID="category-band-clear" accessibilityRole="button" accessibilityLabel="Clear category filter" onPress={onClear} hitSlop={8}>
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
      <Text variant="small" color={ROLE.muted}>
        Add your first with{" "}
        <Text variant="bodyStrong" color={ROLE.ink} style={SMALL}>
          Add
        </Text>
        , or connect a bank and they arrive on their own.
      </Text>
    </PixelFrame>
  );
}

/**
 * Where the web's `#needs-category` anchor lands: `scroll-mt-20` (80px) under the 56px header, so 24px below it. The screen's
 * content view holds the header clearance (insets.top + HEADER_HEIGHT), so a y measured against it includes that too.
 */
export const FOCUS_GAP = 24;

/**
 * The header bell opens Activity with `focus=needs-category` (the web's `/transactions#needs-category`): once the panels
 * have loaded, the "Needs a category" card scrolls to just under the header, once per arrival, and the param is cleared
 * (`onFocused`). With nothing to categorize there is nothing to scroll to, so the param is simply cleared.
 */
function useNeedsCategoryFocus(p: ActivityViewProps) {
  const watch = useScrollWatch();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const ref = useRef<View>(null);
  const wanted = p.focus === "needs-category";
  const settled = p.extras.status !== "loading";
  const hasCard = p.extras.status === "ready" && p.extras.data.needsCategory.length > 0;
  const onFocused = useRef(p.onFocused);
  useEffect(() => {
    onFocused.current = p.onFocused;
  });
  // once per arrival: a later layout (a row expanding) never scrolls again; the next bell tap sets the param afresh
  const done = useRef(false);
  useEffect(() => {
    if (!wanted) done.current = false;
  }, [wanted]);

  const tryScroll = useCallback(() => {
    const content = watch?.contentRef.current;
    if (!wanted || done.current || !watch || !ref.current || !content) return;
    ref.current.measureLayout(content, (_x, y) => {
      if (done.current) return;
      done.current = true;
      watch.scrollTo?.(y - (insets.top + HEADER_HEIGHT) - FOCUS_GAP, !reduced);
      onFocused.current();
    });
  }, [wanted, watch, reduced, insets.top]);

  useEffect(() => {
    if (!wanted || !settled) return;
    if (hasCard) tryScroll();
    else if (!done.current) {
      done.current = true;
      onFocused.current();
    }
  }, [wanted, settled, hasCard, tryScroll]);

  return { ref, onLayout: tryScroll };
}

export type ActivityViewProps = {
  month: string;
  onMonth: (month: string) => void;
  currency: string;
  /** the category the list is narrowed to (its name once the categories load), or null */
  category: { id: string; name: string | null } | null;
  onClearCategory: () => void;
  /** the month once its first page is in (loading and a failed month are the screen's skeleton and failure states) */
  ledger: LedgerState;
  /** a failed refresh (a pull, or a silent reload after a save or sync): the list stays, this says why it isn't fresh */
  notice: string | null;
  /** the notice's Refresh: re-reads the month and the panels */
  onRefreshNotice: () => void;
  onRetryRest: () => void;
  extras: LoadState<ActivityExtras>;
  onRetryExtras: () => void;
  /** category id → kind, to mark a refund */
  kinds: Map<string, "expense" | "income">;
  onAdd: () => void;
  onOpen: (t: MobileTransaction) => void;
  /** `focus=needs-category` from the header bell: scroll to that card, then `onFocused` clears the param */
  focus?: string | null;
  onFocused: () => void;
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
  const focusNeedsCategory = useNeedsCategoryFocus(p);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<ActivityKind>("all");
  const [shown, setShown] = useState(SLICE);
  const showMore = useCallback(() => setShown((n) => n + SLICE), []);

  const items = p.ledger.status === "ready" ? p.ledger.page.items : null;
  const filtered = useMemo(() => (items ? filterActivity(items, search, kind) : []), [items, search, kind]);
  const visible = useMemo(() => filtered.slice(0, shown), [filtered, shown]);
  const totals = useMemo(() => dayTotals(filtered), [filtered]);

  /** every row of the month is in: the web shows the list only then (fetchAllRows), so "no match" and day nets wait for it */
  const monthComplete = p.ledger.status === "ready" && p.ledger.cursor === null;
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
          <WarnLine testID="activity-notice" action={{ label: "Refresh", onPress: p.onRefreshNotice }}>
            {p.notice}
          </WarnLine>
        </View>
      ) : null}

      {extras ? <LimitedHistoryBanner messages={extras.limitedHistory} /> : null}

      {/* the band waits for the category's name (never a "Showing category" flash while the categories load) */}
      {p.category && p.category.name !== null ? <CategoryBand name={p.category.name} onClear={p.onClearCategory} /> : null}

      <View style={{ gap: 24 }}>
        {extras && extras.needsCategory.length > 0 ? (
          <View ref={focusNeedsCategory.ref} onLayout={focusNeedsCategory.onLayout} collapsable={false}>
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
          </View>
        ) : null}
        {p.extras.status === "error" ? (
          // native only: the web hides a failed panel read; the API answers 503 so nothing is silently empty
          <WarnLine testID="activity-extras-error" action={{ label: "Try again", onPress: p.onRetryExtras }}>
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
              // nothing matches yet, but the month is still arriving (or its rest failed): the footer below says which
              monthComplete ? (
              <PixelFrame testID="activity-no-match" frame="px-card" style={{ padding: 16 }}>
                <Text variant="body" color={ROLE.muted} style={{ textAlign: "center" }}>
                  No matching transactions.
                </Text>
              </PixelFrame>
              ) : null
            ) : (
              <>
                <Reveal i={1}>
                  <PixelFrame testID="activity-list" frame="px-card" style={{ paddingBottom: 4 }}>
                    <TransactionDays rows={visible} totals={monthComplete ? totals : null} kinds={p.kinds} currency={p.currency} onOpen={p.onOpen} />
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
