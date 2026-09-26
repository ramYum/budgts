import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { formatMoney, formatSavingsRate } from "@/lib/budget/money";
import type { DashboardBar, DashboardView as DV } from "@/lib/budget/dashboard";
import type { MonthSpend } from "@/lib/budget/spend-trend";
import type { GoalsSummary } from "@/lib/budget/savings";
import { pickSuggestion } from "@/lib/insights/suggestion";
import { displayName } from "@/lib/user/display-name";
import { BudgetOverAlert } from "./budget-over-alert";
import { MonthNav } from "./month-nav";
import { AddIncome } from "./income-tile";
import { AddTransaction } from "./add-transaction";
import { RollingAmount } from "./rolling-amount";
import { Greeting } from "./local-time";
import { CrystalPerch } from "./crystal-perch";
import { Mascot } from "./mascot";
import { Reveal } from "./reveal";
import { Icon, type IconName } from "./icon";
import { PageHeader } from "./page-header";
import {
  Badge,
  CategoryIcon,
  Chevron,
  IconTile,
  LinkButton,
  ProgressBar,
  SectionHead,
  categoryIcon,
  figureSize,
} from "./ui";
import { SpendingBreakdownCard, SpendingTrendCard } from "./spending-overview";
import type { AccountOption, CategoryOption } from "./transaction-form";

/** An entrance's start, for `.rise` / `.pop` / `.lamp` (globals.css). */
const at = (ms: number) => ({ "--at": `${ms}ms` }) as CSSProperties;

export type RecentActivityItem = {
  id: string;
  amount: number;
  direction: "debit" | "credit";
  occurredAt: string;
  description: string;
  isTransfer: boolean;
  category: { name: string; color: string } | null;
};

/** What Home's "Get set up" steps need beyond the month's figures. */
export type SetupState = {
  /** a bank is connected; null when bank connections are switched off */
  bankConnected: boolean | null;
};

function signed(value: number, currency: string, direction: "in" | "out") {
  if (value === 0) return formatMoney(0, currency);
  return `${direction === "in" ? "+" : "−"}${formatMoney(value, currency)}`;
}

/** One "Where it went" row: name and amount, the cells, then what's left (or
 * over) against the plan. The row opens that category's transactions; "Set
 * budget" opens its budget instead. */
function WhereRow({ b, month, currency, row }: { b: DashboardBar; month: string; currency: string; row: number }) {
  const unplanned = b.budget <= 0 && b.actual > 0;
  const over = b.state === "over" && b.budget > 0;

  return (
    <li className="rise relative py-3 first:pt-0 last:pb-0 md:py-4" style={at(row * 60 + 240)}>
      <div className="flex items-center gap-3 md:gap-4">
        <CategoryIcon name={b.name} tone={unplanned || over ? "wash" : "gray"} />
        <div className="min-w-0 flex-1 space-y-1.5 md:space-y-2">
          <div className="flex items-baseline justify-between gap-3 text-[15px] leading-6">
            <Link
              href={`/transactions?m=${month}&category=${b.categoryId}`}
              className="truncate font-medium text-ink after:absolute after:inset-0 after:content-['']"
            >
              {b.name}
            </Link>
            <span className="tnum shrink-0 font-semibold text-ink">{formatMoney(b.actual, currency)}</span>
          </div>
          <ProgressBar pct={b.pctUsed} tone={b.state} start={row * 3} />
          <div className="flex items-baseline justify-between gap-3 text-[13px] leading-5 md:text-sm">
            {unplanned ? (
              <span className="font-medium text-neg">No budget, all unplanned</span>
            ) : over ? (
              <span className="tnum font-medium text-neg">Over by {formatMoney(b.actual - b.budget, currency)}</span>
            ) : b.budget > 0 ? (
              <span className="tnum text-ink">
                {formatMoney(b.remaining, currency)} <span className="text-muted">left</span>
              </span>
            ) : (
              <span className="text-muted">No budget set</span>
            )}
            {b.budget > 0 ? (
              <span className="tnum shrink-0 text-muted">of {formatMoney(b.budget, currency)}</span>
            ) : (
              <Link
                href={`/budgets?m=${month}&edit=${b.categoryId}`}
                className={`relative z-[1] shrink-0 font-semibold hover:underline ${unplanned ? "text-neg" : "text-ink"}`}
              >
                Set budget
              </Link>
            )}
          </div>
        </div>
        <Chevron className="hidden sm:block" />
      </div>
    </li>
  );
}

/** A step of "Get set up": what to do, why, and one button (or done). */
function SetupStep({
  icon,
  title,
  body,
  done,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  done: boolean;
  action: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-4 first:pt-0 last:pb-0 md:gap-4">
      <IconTile name={done ? "check" : icon} tone={done ? "growth" : "gray"} />
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] font-medium leading-6 ${done ? "text-muted" : "text-ink"}`}>{title}</p>
        <p className="text-sm leading-5 text-muted">{body}</p>
      </div>
      {done ? <Badge tone="growth">Done</Badge> : action}
    </li>
  );
}

export function DashboardView({
  view,
  prevView,
  trend,
  currency,
  month,
  accounts,
  categories,
  defaultDate,
  savings,
  recent,
  userEmail,
  setup,
}: {
  view: DV;
  prevView: DV;
  trend: MonthSpend[];
  currency: string;
  month: string;
  accounts: AccountOption[];
  categories: CategoryOption[];
  defaultDate: string;
  savings: GoalsSummary;
  recent: RecentActivityItem[];
  userEmail: string;
  setup: SetupState;
}) {
  const { tiles, bars } = view;
  const name = displayName(userEmail);
  const negative = tiles.netSavings < 0;
  // nothing in or out yet this month: a new account, or a month just begun
  const quiet = tiles.income === 0 && tiles.spent === 0;
  const suggestion = pickSuggestion(bars, prevView.bars, tiles.spent);
  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const moneyLeft = formatMoney(tiles.netSavings, currency);
  const keptPct = tiles.savingsRate === null ? 0 : Math.max(0, tiles.savingsRate * 100);

  // Entrance: the greeting rises word by word as Crystal flutters down onto
  // the hero, then each block below rises a beat after the one above (--i);
  // blocks below the fold wait and play as they scroll into view (reveal.tsx).
  let order = 1;
  const next = () => order++;

  const steps: { key: string; done: boolean; node: ReactNode }[] = [];
  if (setup.bankConnected !== null) {
    steps.push({
      key: "bank",
      done: setup.bankConnected,
      node: (
        <SetupStep
          key="bank"
          icon="bank"
          title="Connect your bank"
          body="Purchases import on their own."
          done={setup.bankConnected}
          action={<LinkButton href="/connected-banks">Connect</LinkButton>}
        />
      ),
    });
  }
  steps.push({
    key: "income",
    done: tiles.income > 0,
    node: (
      <SetupStep
        key="income"
        icon="coins"
        title="Add this month's income"
        body="Gives Money Left a starting point."
        done={tiles.income > 0}
        action={
          <AddIncome
            accounts={accounts}
            categories={categories}
            defaultDate={defaultDate}
            // the first open step carries the one primary action
            variant={setup.bankConnected === false ? "secondary" : "primary"}
          />
        }
      />
    ),
  });
  steps.push({
    key: "budget",
    done: tiles.budgeted > 0,
    node: (
      <SetupStep
        key="budget"
        icon="budgets"
        title="Give categories a budget"
        body={`${expenseCategories.length} ${expenseCategories.length === 1 ? "category is" : "categories are"} ready to plan.`}
        done={tiles.budgeted > 0}
        action={
          <LinkButton href={`/budgets?m=${month}`} variant="secondary">
            Set
          </LinkButton>
        }
      />
    ),
  });
  const stepsDone = steps.filter((s) => s.done).length;

  const whereItWent = (
    <section className="space-y-3">
      <SectionHead title="Where it went" href={`/budgets?m=${month}`} action="Budgets" />
      {tiles.budgeted > 0 && tiles.spent > 0 ? (
        tiles.leftToSpend < 0 ? (
          <p className="tnum flex items-center gap-2 text-[15px] leading-6 text-ink">
            <Icon name="warning" className="text-signal" />
            <span>
              <span className="font-semibold text-neg">{formatMoney(-tiles.leftToSpend, currency)} over</span> your{" "}
              {formatMoney(tiles.budgeted, currency)} budget
            </span>
          </p>
        ) : (
          <p className="tnum text-[15px] leading-6 text-muted">
            <span className="font-semibold text-ink">{formatMoney(tiles.leftToSpend, currency)} left</span> of your{" "}
            {formatMoney(tiles.budgeted, currency)} budget
          </p>
        )
      ) : null}
      {tiles.spent === 0 ? (
        <div className="px-card p-2 md:p-4">
          <Mascot mood="sleepy" size={60} />
          <p className="mt-4 text-[15px] font-medium leading-6 text-ink">No spending yet this month</p>
          <p className="text-sm leading-5 text-muted">Your categories are ready. Spending shows up here as it happens.</p>
          {expenseCategories.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Your categories">
              {expenseCategories.map((c) => (
                <li key={c.id} className="px-badge inline-flex h-8 items-center gap-1.5 px-1.5 text-sm text-graphite">
                  <Icon name={categoryIcon(c.name)} size={12} />
                  {c.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : bars.length === 0 ? (
        <div className="px-card p-3 text-[15px] leading-6 text-muted md:p-4">
          Set a budget on the{" "}
          <Link href="/budgets" className="font-medium text-ink underline underline-offset-2">
            Budgets
          </Link>{" "}
          screen to see how you&apos;re tracking.
        </div>
      ) : (
        <ul className="px-card px-rows p-2 md:p-4">
          {bars.map((b, row) => (
            <WhereRow key={b.categoryId} b={b} month={month} currency={currency} row={row} />
          ))}
        </ul>
      )}
    </section>
  );

  const change = suggestion ? (
    <Link
      href={
        suggestion.kind === "unbudgeted"
          ? `/budgets?m=${month}&edit=${suggestion.categoryId}`
          : `/transactions?m=${month}&category=${suggestion.categoryId}`
      }
      className="px-wash press flex items-center gap-3 p-2 md:gap-4 md:p-4"
    >
      {/* the idea lamp switches on */}
      <span className="lamp" style={at(380)}>
        <IconTile name="idea" tone="accent" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-label-strong block text-signal-ink">What can I change?</span>
        {suggestion.kind === "unbudgeted" ? (
          <>
            <span className="block text-[15px] font-medium leading-6 text-ink">Give {suggestion.name} a budget</span>
            <span className="tnum block text-sm leading-5 text-graphite">
              {formatMoney(suggestion.amount, currency)} this month, {suggestion.share}% of spending.
            </span>
          </>
        ) : (
          <>
            <span className="block text-[15px] font-medium leading-6 text-ink">{suggestion.name}</span>
            <span className="tnum block text-sm leading-5 text-graphite">
              {formatMoney(suggestion.amount, currency)} this month,{" "}
              <span className="text-neg">up {formatMoney(suggestion.delta, currency)} vs. last month</span>
            </span>
          </>
        )}
      </span>
      <Chevron />
    </Link>
  ) : null;

  const savingsCard =
    savings.activeCount > 0 ? (
      <section className="space-y-3">
        <SectionHead title="Savings" href="/goals" action="Goals" />
        <div className="px-card p-2 md:p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="t-num-lg text-ink">
              <RollingAmount value={savings.totalSaved} currency={currency} />
            </p>
            {savings.totalTarget > 0 ? (
              <Badge tone="growth">{Math.round((savings.totalSaved / savings.totalTarget) * 100)}%</Badge>
            ) : null}
          </div>
          <ProgressBar
            className="mt-4"
            pct={savings.totalTarget > 0 ? (savings.totalSaved / savings.totalTarget) * 100 : 0}
            tone="growth"
          />
          <p className="tnum mt-4 text-sm leading-5 text-muted">
            Kept toward {formatMoney(savings.totalTarget, currency)} across {savings.activeCount}{" "}
            {savings.activeCount === 1 ? "goal" : "goals"}
          </p>
        </div>
      </section>
    ) : null;

  const recentCard = (
    <section className="space-y-3">
      <SectionHead title="Recent activity" href="/transactions" action="See all" />
      {recent.length === 0 ? (
        <div className="px-card p-2 md:p-4">
          <IconTile name="receipt" />
          <p className="mt-4 text-[15px] font-medium leading-6 text-ink">Nothing recorded yet</p>
          <p className="text-sm leading-5 text-muted">
            {setup.bankConnected ? "Purchases from your bank land here on their own." : "Connected purchases land here on their own."}
          </p>
          <div className="mt-2">
            <AddTransaction accounts={accounts} categories={categories} defaultDate={defaultDate} variant="text" />
          </div>
        </div>
      ) : (
        <ul className="px-card px-rows p-2 md:p-4">
          {recent.map((r, k) => (
            <li key={r.id} className="rise flex items-center gap-3 py-3 md:gap-4 first:pt-0 last:pb-0" style={at(k * 60 + 200)}>
              <CategoryIcon name={r.isTransfer ? "Transfer" : (r.category?.name ?? "")} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium leading-6 text-ink">
                  {r.description || r.category?.name || "Transaction"}
                </p>
                <p className="truncate text-sm leading-5 text-muted">
                  {r.isTransfer ? "Transfer" : (r.category?.name ?? "Uncategorized")}
                </p>
              </div>
              <span
                className={`tnum shrink-0 text-[15px] font-semibold leading-6 ${r.direction === "credit" ? "text-pos" : "text-ink"}`}
              >
                {r.direction === "debit" ? "−" : "+"}
                {formatMoney(r.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div>
      <PageHeader
        title={<Greeting name={name} />}
        month={<MonthNav base="/" month={month} />}
        subtitle={
          <span className="rise inline-block" style={at(340)}>
            {quiet
              ? "Let's get your month set up."
              : tiles.savingsRate !== null && tiles.savingsRate >= 0
                ? "You're doing well this month."
                : "Let's see where things stand."}
          </span>
        }
      />

      {tiles.budgeted > tiles.income && !quiet ? (
        <Reveal i={next()} className="mb-10">
          <BudgetOverAlert month={month} budgeted={tiles.budgeted} income={tiles.income} currency={currency} />
        </Reveal>
      ) : null}

      {/* the hero: one number, stated plainly; Crystal perches on its frame */}
      <Reveal i={next()}>
        <section className="relative mt-12 md:mt-0" aria-labelledby="home-money-left">
          <CrystalPerch
            name={name}
            savingsRate={tiles.savingsRate}
            className="absolute inset-x-4 bottom-[calc(100%-2px)] md:inset-x-10"
          />
          <div className="px-card-raised p-2 md:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:gap-10">
              <div className="min-w-0 flex-1">
                <h2 id="home-money-left" className="text-sm font-medium leading-5 text-muted">
                  Money left
                </h2>
                <p className={`${figureSize(moneyLeft)} tnum mt-3 ${negative ? "text-neg" : "text-ink"}`}>
                  <RollingAmount value={tiles.netSavings} currency={currency} />
                </p>
                <p
                  className={`rise tnum mt-2 text-[15px] leading-6 ${negative ? "text-neg" : "text-muted"}`}
                  style={at(560)}
                >
                  {quiet ? (
                    "Add income or connect a bank and your month appears here."
                  ) : tiles.savingsRate === null ? (
                    "No income yet this month."
                  ) : negative ? (
                    <>
                      <span className="font-semibold">{formatMoney(-tiles.netSavings, currency)}</span> more went out
                      than came in.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-ink">{formatSavingsRate(tiles.savingsRate)}</span> of this
                      month&apos;s income kept.
                    </>
                  )}
                </p>
                <ProgressBar className="mt-4 max-w-[444px]" pct={keptPct} tone={negative ? "over" : "under"} cellHeight={12} />
              </div>
              <div className="px-rule md:hidden" aria-hidden />
              <div className="px-rule-v hidden md:block" aria-hidden />
              <dl className="grid grid-cols-2 gap-4 md:w-48 md:grid-cols-1 md:content-center md:gap-5">
                <div>
                  <dt className="flex min-h-7 items-center gap-1 text-sm leading-5 text-muted">
                    Came in
                    <AddIncome accounts={accounts} categories={categories} defaultDate={defaultDate} variant="icon" />
                  </dt>
                  <dd className={`t-num ${tiles.income > 0 ? "text-pos" : "text-ink"}`}>
                    {signed(tiles.income, currency, "in")}
                  </dd>
                </div>
                <div>
                  <dt className="flex min-h-7 items-center text-sm leading-5 text-muted">Went out</dt>
                  <dd className="t-num text-ink">{signed(tiles.spent, currency, "out")}</dd>
                </div>
              </dl>
            </div>
            <div className="px-rule mt-5" aria-hidden />
            <p className="rise mt-4 flex items-start gap-2 text-[13px] leading-5 text-muted md:text-sm" style={at(760)}>
              <Icon name="info" size={12} className="mt-1" />
              Income minus spending. Not your savings balance.
            </p>
          </div>
        </section>
      </Reveal>

      <div className="mt-8 flex flex-col gap-8 md:mt-10 md:gap-10 xl:grid xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start xl:gap-6">
        {/* phones read one column in priority order; wide screens split it in two */}
        <div className="contents xl:flex xl:flex-col xl:gap-10">
          {quiet && stepsDone < steps.length ? (
            <Reveal i={next()} className="order-1 xl:order-none">
              <section className="space-y-3">
                <SectionHead
                  title="Get set up"
                  aside={
                    <span className="flex items-center gap-2">
                      <span className="t-label tnum text-muted">
                        {stepsDone} of {steps.length}
                      </span>
                      <ProgressBar
                        pct={(stepsDone / steps.length) * 100}
                        cells={steps.length}
                      />
                    </span>
                  }
                />
                <ol className="px-card px-rows p-2 md:p-4">{steps.map((s) => s.node)}</ol>
              </section>
            </Reveal>
          ) : null}
          <Reveal i={next()} className="order-2 xl:order-none">
            {whereItWent}
          </Reveal>
          {!quiet ? (
            <Reveal i={next()} className="order-6 xl:order-none">
              <section className="space-y-3">
                <SectionHead title="Spending · 6 months" />
                <SpendingTrendCard trend={trend} currency={currency} />
              </section>
            </Reveal>
          ) : null}
        </div>
        <div className="contents xl:flex xl:flex-col xl:gap-10">
          {change ? (
            <Reveal i={next()} className="order-3 xl:order-none">
              {change}
            </Reveal>
          ) : null}
          {savingsCard ? (
            <Reveal i={next()} className="order-4 xl:order-none">
              {savingsCard}
            </Reveal>
          ) : null}
          <Reveal i={next()} className="order-5 xl:order-none">
            {recentCard}
          </Reveal>
          {tiles.spent > 0 ? (
            <Reveal i={next()} className="order-7 xl:order-none">
              <section className="space-y-3">
                <SectionHead title="Where your money goes" />
                <SpendingBreakdownCard bars={view.bars} totalSpent={tiles.spent} currency={currency} />
              </section>
            </Reveal>
          ) : null}
        </div>
      </div>
    </div>
  );
}
