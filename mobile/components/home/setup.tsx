import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { ROLE, type IconName } from "../../lib/brand/shared";
import type { MobileHome } from "../../lib/home/contract";
import { setupCount, setupDone } from "../../lib/home/view";
import { Button, IconTile } from "../brand/controls";
import { Text } from "../brand/text";
import { ProgressBar } from "../kit/progress-bar";
import { SectionHead } from "../kit/section-head";
import { Badge } from "../kit/tiles";
import { CardRows } from "./card-rows";

/** A step of "Get set up" (web `SetupStep`): what to do, why, and one button, or done. */
function SetupStep({
  icon,
  title,
  body,
  done,
  action,
  testID,
}: {
  icon: IconName;
  title: string;
  body: string;
  done: boolean;
  action: ReactNode;
  testID: string;
}) {
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <IconTile name={done ? "check" : icon} tone={done ? "growth" : "gray"} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="listName" color={done ? ROLE.muted : ROLE.ink}>
          {title}
        </Text>
        <Text variant="small" color={ROLE.muted}>
          {body}
        </Text>
      </View>
      {done ? <Badge tone="growth">Done</Badge> : action}
    </View>
  );
}

/**
 * "Get set up" (web dashboard-view.tsx `steps`), shown on a month with nothing
 * in or out while a step is open: connect a bank (only while bank connections
 * are on), add this month's income, give categories a budget, each with the
 * web's one button, and a count with a cell per step.
 */
export function GetSetUp({
  home,
  go,
  onAddIncome,
}: {
  home: MobileHome;
  go: (href: Href) => void;
  onAddIncome: () => void;
}) {
  const n = setupCount(home);
  const done = setupDone(home);
  const expense = home.expenseCategories.length;
  const steps: { key: string; node: ReactNode }[] = [];

  if (home.bankConnected !== null)
    steps.push({
      key: "bank",
      node: (
        <SetupStep
          testID="home-setup-bank"
          icon="bank"
          title="Connect your bank"
          body="Purchases import on their own."
          done={home.bankConnected}
          action={
            <Button testID="home-setup-connect" onPress={() => go({ pathname: "/connected-banks" })}>
              Connect
            </Button>
          }
        />
      ),
    });
  steps.push({
    key: "income",
    node: (
      <SetupStep
        testID="home-setup-income"
        icon="coins"
        title="Add this month's income"
        body="Gives Money Left a starting point."
        done={home.income > 0}
        action={
          // the first open step carries the one primary action
          <Button testID="home-setup-add-income" variant={home.bankConnected === false ? "secondary" : "primary"} onPress={onAddIncome}>
            Add
          </Button>
        }
      />
    ),
  });
  steps.push({
    key: "budget",
    node: (
      <SetupStep
        testID="home-setup-budget"
        icon="budgets"
        title="Give categories a budget"
        body={`${expense} ${expense === 1 ? "category is" : "categories are"} ready to plan.`}
        done={home.budgeted > 0}
        action={
          <Button testID="home-setup-set-budget" variant="secondary" onPress={() => go({ pathname: "/budgets", params: { m: home.month } })}>
            Set
          </Button>
        }
      />
    ),
  });

  return (
    <View testID="home-setup" style={{ gap: 12 }}>
      <SectionHead
        title="Get set up"
        aside={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text variant="tLabel" color={ROLE.muted} style={{ fontVariant: ["tabular-nums"] }}>
              {`${done} of ${n}`}
            </Text>
            <ProgressBar pct={(done / n) * 100} cells={n} />
          </View>
        }
      />
      <CardRows testID="home-setup-steps" paddingY={16} rows={steps} />
    </View>
  );
}
