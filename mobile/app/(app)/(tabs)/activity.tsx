import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { authFetch } from "../../../lib/auth/api";
import { loadResource } from "../../../lib/api/load";
import { useResource } from "../../../lib/api/use-resource";
import { parseCategories } from "../../../lib/categories/categories-api";
import { currentMonth, shiftMonth } from "../../../lib/dates";
import { formatActivityDay, formatMoney, formatMonthLabel } from "../../../lib/home/format";
import { useProfile } from "../../../lib/profile/profile-context";
import { colors, fonts, radii } from "../../../lib/theme";
import { draftFromTransaction } from "../../../lib/transactions/form";
import type { MobileTransaction } from "../../../lib/transactions/transactions-api";
import { useTransactionList } from "../../../lib/transactions/use-transaction-list";
import { Chip, ErrorBlock, Loading, MonthNav, Notice } from "../../../components/parts";
import { OutlineButton, PrimaryButton, TextLink } from "../../../components/ui";

/**
 * Activity: the month's ledger, newest first, with category filter and description search, keyset-paged from
 * `GET /api/mobile/transactions`. A row opens the edit form; "Add" opens a blank one (manual entry is the permanent fallback
 * for cash and unsupported banks). Uncategorized rows say so — nothing needing attention is silent.
 */
export default function ActivityScreen() {
  const router = useRouter();
  const { state: profile } = useProfile();
  const currency = profile.status === "ready" ? profile.profile.currency : "USD";

  const [month, setMonth] = useState(currentMonth());
  const [category, setCategory] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");

  const list = useTransactionList({ month, category, search });
  const categories = useResource("categories-filter", (s) => loadResource(() => authFetch("/api/mobile/categories", s), parseCategories));
  const cats = categories.state.status === "ready" ? categories.state.data : [];

  const openEditor = (t?: MobileTransaction) =>
    router.push(t ? { pathname: "/transaction", params: { id: t.id, draft: JSON.stringify(draftFromTransaction(t)) } } : "/transaction");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Activity
        </Text>
        <OutlineButton testID="activity-add" onPress={() => openEditor()} style={styles.addBtn}>
          Add
        </OutlineButton>
      </View>

      <View style={styles.controls}>
        <MonthNav month={month} onPrev={() => setMonth((m) => shiftMonth(m, -1))} onNext={() => setMonth((m) => shiftMonth(m, 1))} />
        <TextInput
          testID="activity-search"
          style={styles.search}
          placeholder="Search descriptions"
          placeholderTextColor={colors.muted}
          value={searchText}
          onChangeText={(t) => {
            setSearchText(t);
            if (t === "") setSearch("");
          }}
          onSubmitEditing={() => setSearch(searchText.trim())}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search descriptions"
        />
        {cats.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="All" selected={category === null} onPress={() => setCategory(null)} testID="filter-all" />
            {cats.map((c) => (
              <Chip key={c.id} label={c.name} selected={category === c.id} onPress={() => setCategory(c.id)} testID={`filter-${c.id}`} />
            ))}
          </ScrollView>
        ) : null}
        {list.notice ? <Notice text={list.notice} /> : null}
      </View>

      {list.state.status === "loading" ? (
        <Loading label="Loading your transactions" />
      ) : list.state.status === "error" ? (
        <ErrorBlock title="Can't show your transactions" message={list.state.message} onRetry={() => void list.reload()} />
      ) : (
        <FlatList
          data={list.state.page.items}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <Row t={item} currency={currency} onPress={() => openEditor(item)} />}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.accent} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => void list.loadMore()}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No transactions in {formatMonthLabel(month)}</Text>
              <Text style={styles.emptyBody}>
                {search || category ? "Nothing matches these filters." : "Add one by hand, or connect a bank to bring them in automatically."}
              </Text>
              <PrimaryButton testID="activity-empty-add" onPress={() => openEditor()}>
                Add a transaction
              </PrimaryButton>
            </View>
          }
          ListFooterComponent={
            list.state.loadingMore ? (
              <ActivityIndicator color={colors.accent} style={styles.footer} />
            ) : list.state.moreError ? (
              <View style={styles.footer}>
                <Notice text={list.state.moreError} />
                <TextLink testID="activity-load-more" onPress={() => void list.loadMore()}>
                  Try loading more
                </TextLink>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function Row({ t, currency, onPress }: { t: MobileTransaction; currency: string; onPress: () => void }) {
  const credit = t.direction === "credit";
  const sub = [t.category?.name ?? (t.isTransfer ? "Transfer" : null), t.account.name, formatActivityDay(t.occurredAt)].filter(Boolean).join(" · ");
  return (
    <Pressable testID={`txn-${t.id}`} accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.desc} numberOfLines={1}>
          {t.description || t.category?.name || "Transaction"}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
        {t.uncategorized ? <Text style={styles.needs}>Needs a category</Text> : null}
      </View>
      <Text style={[styles.amount, credit && { color: colors.pos }]}>
        {credit ? "+" : "−"}
        {formatMoney(t.amount, currency)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8 },
  title: { fontFamily: fonts.bold, fontSize: 26, color: colors.text },
  addBtn: { minHeight: 40, paddingHorizontal: 18 },
  controls: { paddingHorizontal: 20, gap: 8 },
  search: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.field,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  chips: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  listContent: { paddingHorizontal: 20, paddingBottom: 24, flexGrow: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1, gap: 2 },
  desc: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  needs: { fontFamily: fonts.medium, fontSize: 12, color: colors.accent },
  amount: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  empty: { alignItems: "center", gap: 10, paddingVertical: 40 },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text, textAlign: "center" },
  emptyBody: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 6 },
  footer: { paddingVertical: 16, alignItems: "center" },
});
