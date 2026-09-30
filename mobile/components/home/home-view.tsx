import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { MobileHome } from "../../lib/home/contract";
import { homeBlocks, showsOverAlert, subtitle } from "../../lib/home/view";
import { Reveal } from "../motion/reveal";
import { SpendingBreakdownCard } from "../charts/spending-breakdown-card";
import { SpendingTrendCard } from "../charts/spending-trend-card";
import { SectionHead } from "../kit/section-head";
import { ChangeCard, RecentActivity, SavingsCard } from "./cards";
import { GetSetUp } from "./setup";
import { PageHeader } from "../kit/page-header";
import { MonthNav } from "../kit/month-nav";
import { Greeting, GreetingSubtitle } from "./greeting";
import { MoneyLeftCard } from "./money-left";
import { BudgetOverAlert, useOverAlertDismissed } from "./over-alert";
import { RefreshNotice } from "./refresh-notice";
import { WhereItWent } from "./where-it-went";

/**
 * Home (web src/components/dashboard-view.tsx at phone width): the greeting
 * and month, the budgets-over-income warning, Money left, then one column in
 * the web's phone order: Get set up, Where it went, What can I change?,
 * Savings, Recent activity, Spending · 6 months, Where your money goes. Every figure is the server's (`MobileHome`); this only lays them
 * out. Each block rises with the web's own cascade number (`homeBlocks`).
 */
export function HomeView({
  home,
  name,
  hour,
  go,
  onMonth,
  onAddIncome,
  onAddTransaction,
  notice = null,
  onRefresh,
  awake = true,
}: {
  home: MobileHome;
  /** a refresh failed while these numbers were on screen */
  notice?: string | null;
  onRefresh?: () => void;
  /** Home is the screen in front and the app is active */
  awake?: boolean;
  name: string;
  hour: number;
  go: (href: Href) => void;
  onMonth: (month: string) => void;
  onAddIncome: () => void;
  onAddTransaction: () => void;
}) {
  const i = homeBlocks(home);
  const dismissed = useOverAlertDismissed(home.month);
  const alert = showsOverAlert(home) && !dismissed;

  // phone reading order: the web's `order-*` classes
  const column: { key: string; i: number; node: ReactNode }[] = [];
  if (i.setup !== null)
    column.push({ key: "setup", i: i.setup, node: <GetSetUp home={home} go={go} onAddIncome={onAddIncome} /> });
  column.push({ key: "where", i: i.where, node: <WhereItWent home={home} go={go} /> });
  if (home.suggestion && i.change !== null)
    column.push({
      key: "change",
      i: i.change,
      node: <ChangeCard suggestion={home.suggestion} month={home.month} currency={home.currency} go={go} />,
    });
  if (home.savings && i.savings !== null)
    column.push({ key: "savings", i: i.savings, node: <SavingsCard savings={home.savings} currency={home.currency} go={go} /> });
  column.push({ key: "recent", i: i.recent, node: <RecentActivity home={home} go={go} onAddTransaction={onAddTransaction} /> });
  if (i.trend !== null)
    column.push({
      key: "trend",
      i: i.trend,
      node: (
        <View testID="home-trend" style={{ gap: 12 }}>
          <SectionHead title="Spending · 6 months" />
          <SpendingTrendCard trend={home.trend} change={home.trendChange} currency={home.currency} />
        </View>
      ),
    });
  if (i.breakdown !== null)
    column.push({
      key: "breakdown",
      i: i.breakdown,
      node: (
        <View testID="home-breakdown" style={{ gap: 12 }}>
          <SectionHead title="Where your money goes" />
          <SpendingBreakdownCard breakdown={home.breakdown} totalSpent={home.spent} currency={home.currency} />
        </View>
      ),
    });

  return (
    <View testID="home-view">
      {notice && onRefresh ? (
        <View style={{ marginBottom: 20 }}>
          <RefreshNotice message={notice} onRetry={onRefresh} />
        </View>
      ) : null}
      <PageHeader
        title={<Greeting hour={hour} name={name} />}
        subtitle={<GreetingSubtitle text={subtitle(home)} />}
        month={<MonthNav month={home.month} onChange={onMonth} />}
      />

      {/* the web's margins collapse here: the header's 20px before the warning, 48px (Crystal's ledge) above the hero in all */}
      {alert && i.overAlert !== null ? (
        <Reveal i={i.overAlert}>
          <BudgetOverAlert
            month={home.month}
            budgeted={home.budgeted}
            income={home.income}
            currency={home.currency}
            onReview={() => go({ pathname: "/budgets" })}
          />
        </Reveal>
      ) : null}

      <Reveal i={i.hero} style={{ marginTop: alert ? 48 : 28 }}>
        <MoneyLeftCard home={home} name={name} awake={awake} onAddIncome={onAddIncome} />
      </Reveal>

      <View style={{ marginTop: 32, gap: 32 }}>
        {column.map((b) => (
          <Reveal key={b.key} i={b.i}>
            {b.node}
          </Reveal>
        ))}
      </View>
    </View>
  );
}
