import type { ReactNode } from "react";
import { View } from "react-native";
import type { MobileCategory } from "../../lib/categories/categories-api";
import type { MobileHome } from "../../lib/home/contract";
import { homeBlocks, showsOverAlert, subtitle } from "../../lib/home/view";
import { Reveal } from "../motion/reveal";
import { ChangeCard, RecentActivity, SavingsCard } from "./cards";
import { HomeHeader } from "./home-header";
import { MoneyLeftCard } from "./money-left";
import { BudgetOverAlert, useOverAlertDismissed } from "./over-alert";
import { WhereItWent } from "./where-it-went";

/**
 * Home (web src/components/dashboard-view.tsx at phone width): the greeting
 * and month, the budgets-over-income warning, Money left, then one column in
 * the web's phone order: Where it went, What can I change?, Savings, Recent
 * activity. Every figure is the server's (`MobileHome`); this only lays them
 * out. Each block rises with the web's own cascade number (`homeBlocks`).
 */
export function HomeView({
  home,
  categories,
  name,
  hour,
  go,
  onMonth,
  onAddIncome,
  onAddTransaction,
}: {
  home: MobileHome;
  /** the user's categories, for the chips of a month with no spending; null while they load */
  categories: MobileCategory[] | null;
  name: string;
  hour: number;
  go: (path: string) => void;
  onMonth: (month: string) => void;
  onAddIncome: () => void;
  onAddTransaction: () => void;
}) {
  const i = homeBlocks(home);
  const dismissed = useOverAlertDismissed(home.month);
  const alert = showsOverAlert(home) && !dismissed;

  // phone reading order: the web's `order-*` classes
  const column: { key: string; i: number; node: ReactNode }[] = [];
  column.push({ key: "where", i: i.where, node: <WhereItWent home={home} categories={categories} go={go} /> });
  if (home.suggestion && i.change !== null)
    column.push({
      key: "change",
      i: i.change,
      node: <ChangeCard suggestion={home.suggestion} month={home.month} currency={home.currency} go={go} />,
    });
  if (home.savings && i.savings !== null)
    column.push({ key: "savings", i: i.savings, node: <SavingsCard savings={home.savings} currency={home.currency} go={go} /> });
  column.push({ key: "recent", i: i.recent, node: <RecentActivity home={home} go={go} onAddTransaction={onAddTransaction} /> });

  return (
    <View testID="home-view">
      <HomeHeader hour={hour} name={name} subtitle={subtitle(home)} month={home.month} onMonth={onMonth} />

      {/* the web's margins collapse here: 20px under the header before the warning, 48px (Crystal's ledge) above the hero */}
      {alert && i.overAlert !== null ? (
        <Reveal i={i.overAlert} style={{ marginTop: 20 }}>
          <BudgetOverAlert
            month={home.month}
            budgeted={home.budgeted}
            income={home.income}
            currency={home.currency}
            onReview={() => go("/budgets")}
          />
        </Reveal>
      ) : null}

      <Reveal i={i.hero} style={{ marginTop: 48 }}>
        <MoneyLeftCard home={home} onAddIncome={onAddIncome} />
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
