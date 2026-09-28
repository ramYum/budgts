import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/auth-context";
import type { HomeActivity, HomeCategory, MobileHome } from "../../../lib/home/contract";
import {
  formatActivityDay,
  formatMoney,
  formatMonthLabel,
  formatSavingsRate,
} from "../../../lib/home/format";
import { useHome } from "../../../lib/home/use-home";
import { colors, fonts, radii } from "../../../lib/theme";
import { PrimaryButton } from "../../../components/ui";

/**
 * The first real Budgts Home. Every number is computed server-side by the same
 * dashboard math the web Home uses (`GET /api/mobile/home`); this screen only
 * formats and lays out what it is given — no financial calculation lives here.
 * Presentation is native (see docs/BRAND_GUIDELINES.md tokens in lib/theme.ts);
 * account/diagnostics/sign-out live behind the avatar (`/diagnostics`).
 */
export default function HomeScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { state, refreshing, notice, refresh, retry } = useHome();

  const initial = (session?.user.email ?? "?").charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <Image source={require("../../../assets/brand/logo-mark.png")} style={styles.mark} resizeMode="contain" />
          <Image
            source={require("../../../assets/brand/wordmark.png")}
            style={styles.wordmark}
            resizeMode="contain"
            accessibilityLabel="Budgts"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push("/settings")}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </Pressable>
      </View>

      {state.status === "loading" ? (
        <View style={styles.centered} accessibilityLabel="Loading your Home">
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : state.status === "error" ? (
        <View style={styles.centered}>
          <View style={styles.errorCard} accessibilityRole="alert">
            <Text style={styles.errorTitle}>Can&apos;t show your Home</Text>
            <Text style={styles.errorBody}>{state.message}</Text>
            {state.kind === "auth" ? (
              <PrimaryButton onPress={() => void signOut()}>Sign in again</PrimaryButton>
            ) : (
              <PrimaryButton onPress={() => void retry()}>Try again</PrimaryButton>
            )}
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} />
          }
        >
          {notice ? (
            <Text style={styles.notice} accessibilityRole="alert">
              {notice}
            </Text>
          ) : null}
          <HomeContent home={state.home} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function HomeContent({ home }: { home: MobileHome }) {
  const { currency } = home;
  const money = (n: number) => formatMoney(n, currency);
  const over = home.moneyLeft < 0;
  const negativeRate = home.savingsRate !== null && home.savingsRate < 0;
  const budgets = home.categories.filter((c) => c.budget > 0 || c.actual > 0);

  return (
    <View style={styles.content}>
      <Text style={styles.month}>{formatMonthLabel(home.month)}</Text>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Money Left</Text>
        <Text style={[styles.heroAmount, over && { color: colors.neg }]} accessibilityRole="header">
          {money(home.moneyLeft)}
        </Text>
        <Text style={styles.heroLine}>
          {money(home.leftToSpend)} left of {money(home.budgeted)} budgeted ·{" "}
          <Text style={negativeRate ? styles.heroNegative : undefined}>
            {home.savingsRate === null
              ? "no income this month"
              : `${formatSavingsRate(home.savingsRate)} saved this month`}
            {negativeRate ? " — spent more than you earned" : ""}
          </Text>
        </Text>
        <Text style={styles.heroNote}>
          Based on income minus spending — doesn&apos;t measure savings-account balances.
        </Text>
      </View>

      <View style={styles.tiles}>
        <Tile label="Income" value={money(home.income)} />
        <Tile label="Spending" value={money(home.spent)} />
      </View>

      <Section title="Budgets">
        {budgets.length === 0 ? (
          <Text style={styles.empty}>No budgets set for this month yet.</Text>
        ) : (
          <View style={styles.card}>
            {budgets.map((c, i) => (
              <CategoryRow key={c.id} category={c} money={money} last={i === budgets.length - 1} />
            ))}
          </View>
        )}
      </Section>

      <Section title="Recent activity">
        {home.recent.length === 0 ? (
          <Text style={styles.empty}>No activity yet.</Text>
        ) : (
          <View style={styles.card}>
            {home.recent.map((a, i) => (
              <ActivityRow key={a.id} item={a} money={money} last={i === home.recent.length - 1} />
            ))}
          </View>
        )}
      </Section>

      {home.savings ? (
        <View style={[styles.card, styles.savings]}>
          <Text style={styles.sectionTitle}>Savings goals</Text>
          <Text style={styles.savingsAmount}>{money(home.savings.totalSaved)} kept</Text>
          <Text style={styles.muted}>
            {money(home.savings.totalSaved)} of {money(home.savings.totalTarget)} toward your{" "}
            {home.savings.activeCount === 1 ? "goal" : "goals"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.card, styles.tile]}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const STATE_COLOR = { under: colors.pos, near: colors.fillNear, over: colors.neg } as const;

function CategoryRow({
  category: c,
  money,
  last,
}: {
  category: HomeCategory;
  money: (n: number) => string;
  last: boolean;
}) {
  // Width only — `pctUsed` is computed server-side; this clamps it to the track.
  const width = `${Math.max(0, Math.min(100, c.pctUsed))}%` as `${number}%`;
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={styles.rowTop}>
        <View style={styles.categoryName}>
          <View style={[styles.dot, { backgroundColor: c.color }]} />
          <Text style={styles.rowTitle} numberOfLines={1}>
            {c.name}
          </Text>
        </View>
        <Text style={[styles.muted, c.state === "over" && { color: colors.neg }]}>
          {money(c.actual)} of {money(c.budget)}
        </Text>
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.min(100, c.pctUsed) }}
      >
        <View style={[styles.fill, { width, backgroundColor: STATE_COLOR[c.state] }]} />
      </View>
    </View>
  );
}

function ActivityRow({
  item,
  money,
  last,
}: {
  item: HomeActivity;
  money: (n: number) => string;
  last: boolean;
}) {
  const credit = item.direction === "credit";
  return (
    <View style={[styles.row, styles.activityRow, !last && styles.rowDivider]}>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.description || "Transaction"}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {formatActivityDay(item.occurredAt)}
          {item.isTransfer ? " · Transfer" : item.category ? ` · ${item.category.name}` : ""}
        </Text>
      </View>
      <Text style={[styles.amount, credit && { color: colors.pos }]}>
        {credit ? "+" : "−"}
        {money(item.amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  mark: { width: 34, height: 32 },
  wordmark: { width: 64, height: 32 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { padding: 20, paddingBottom: 40 },
  content: { gap: 20, width: "100%", maxWidth: 480, alignSelf: "center" },
  notice: { fontFamily: fonts.regular, fontSize: 13, color: colors.neg, marginBottom: 8 },
  month: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  hero: { backgroundColor: colors.heroFill, borderRadius: 24, padding: 18, gap: 4 },
  heroLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  heroAmount: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 42, color: colors.text },
  heroLine: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.text, marginTop: 4 },
  heroNegative: { fontFamily: fonts.medium, color: colors.neg },
  heroNote: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.text, marginTop: 6 },
  tiles: { flexDirection: "row", gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tile: { flex: 1, padding: 14, gap: 2 },
  tileLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  tileValue: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  section: { gap: 8 },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  empty: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  row: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  categoryName: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.text, flexShrink: 1 },
  muted: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  activityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  amount: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  savings: { padding: 14, gap: 2 },
  savingsAmount: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  errorCard: {
    width: "100%",
    maxWidth: 384,
    gap: 12,
    padding: 20,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  errorBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
});
