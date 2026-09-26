"use client";

import { useState, useTransition } from "react";
import { formatMoney } from "@/lib/budget/money";
import type { GoalProgress, GoalsSummary } from "@/lib/budget/savings";
import {
  addContribution,
  createGoal,
  setGoalArchived,
  updateGoal,
  withdrawFromGoal,
} from "@/server/savings";
import { Overlay } from "./overlay";
import { GoalForm, type GoalInitial } from "./goal-form";
import { ContributionForm } from "./contribution-form";
import { Mascot } from "./mascot";
import { Icon } from "./icon";
import { PageHeader } from "./page-header";
import { RowMenu } from "./row-menu";
import { Badge, Button, IconTile, ProgressBar, SectionHead, TextButton, figureSize } from "./ui";

type OverlayState =
  | null
  | { kind: "new" }
  | { kind: "edit" | "add" | "withdraw"; goal: GoalProgress };

function toInitial(g: GoalProgress): GoalInitial {
  return {
    id: g.id,
    name: g.name,
    targetAmount: (g.target / 100).toFixed(2),
    targetDate: g.targetDate,
  };
}

/** "2027-04-01" -> "Apr 2027" (a calendar date, so read in UTC); short
 * enough to share the "to go" line on a narrow card. */
function formatTargetDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function GoalCard({
  g,
  currency,
  index,
  onOpen,
}: {
  g: GoalProgress;
  currency: string;
  index: number;
  onOpen: (s: OverlayState) => void;
}) {
  const [archiving, startArchive] = useTransition();
  const archive = () =>
    startArchive(async () => {
      const fd = new FormData();
      fd.set("id", g.id);
      fd.set("archived", "1");
      await setGoalArchived({}, fd);
    });

  return (
    <li className="reveal px-card flex flex-col p-3 md:p-4" style={{ ["--i" as string]: index + 2 }}>
      <div className="flex items-start gap-3">
        <IconTile name="goals" tone={g.complete ? "growth" : "gray"} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-6 text-ink">{g.name}</p>
          <p className="tnum text-sm leading-5 text-muted">
            {g.complete ? "Reached" : `${formatMoney(g.remaining, currency)} to go`}
            {g.targetDate ? ` · by ${formatTargetDate(g.targetDate)}` : ""}
          </p>
        </div>
        <Badge tone="growth">{g.pct}%</Badge>
      </div>

      <p className="tnum mt-5 text-[15px] leading-6 text-muted">
        <span className="font-semibold text-ink">{formatMoney(g.saved, currency)}</span> of{" "}
        {formatMoney(g.target, currency)}
      </p>
      <ProgressBar className="mt-2" pct={g.pct} tone="growth" cellHeight={16} start={index * 3} />

      <div className="mt-5 flex items-center gap-3">
        <Button variant="secondary" icon="plus" onClick={() => onOpen({ kind: "add", goal: g })}>
          Add money
        </Button>
        <TextButton onClick={() => onOpen({ kind: "withdraw", goal: g })}>Withdraw</TextButton>
        <span className="-mr-2 ml-auto">
          <RowMenu
            label={`More for ${g.name}`}
            items={[
              { label: "Edit", icon: "edit", onSelect: () => onOpen({ kind: "edit", goal: g }) },
              { label: "Archive", icon: "archive", onSelect: archive, disabled: archiving },
            ]}
          />
        </span>
      </div>
    </li>
  );
}

export function GoalsView({
  items,
  summary,
  currency,
}: {
  items: GoalProgress[];
  summary: GoalsSummary;
  currency: string;
}) {
  const [overlay, setOverlay] = useState<OverlayState>(null);
  const close = () => setOverlay(null);
  const saved = formatMoney(summary.totalSaved, currency);
  const pct = summary.totalTarget > 0 ? Math.round((summary.totalSaved / summary.totalTarget) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Savings goals"
        back="/more"
        backOnDesktop={false}
        action={
          <Button icon="plus" onClick={() => setOverlay({ kind: "new" })} aria-label="Add goal">
            <span className="md:hidden">Add</span>
            <span className="hidden md:inline">Add goal</span>
          </Button>
        }
      />

      {items.length === 0 ? (
        <div className="px-card-ink flex flex-col items-start gap-3 p-4 md:flex-row md:items-center md:gap-6 md:p-6">
          <Mascot mood="curious" size={72} />
          <div>
            <p className="px-figure text-ink">No goals yet</p>
            <p className="mt-1 text-[15px] leading-6 text-muted">
              A trip, a cushion, a big buy: add one with <span className="font-semibold text-ink">Add goal</span> and
              watch it fill, cell by cell.
            </p>
          </div>
        </div>
      ) : (
        <>
          <section className="reveal px-card-ink relative p-3 md:p-6" style={{ ["--i" as string]: 1 }}>
            <div className="flex items-center gap-6">
              <div className="min-w-0 flex-1">
                <h2 className="px-tag text-ink">Total saved</h2>
                <p className={`${figureSize(saved)} tnum mt-3 text-ink`}>{saved}</p>
                <ProgressBar className="mt-3 max-w-[616px]" pct={pct} tone="growth" />
                <p className="tnum mt-3 text-[15px] leading-6 text-muted">
                  {pct}% of <span className="font-semibold text-ink">{formatMoney(summary.totalTarget, currency)}</span>{" "}
                  across {summary.activeCount} {summary.activeCount === 1 ? "goal" : "goals"}
                  {summary.completeCount > 0 ? ` · ${summary.completeCount} reached` : ""}
                </p>
              </div>
              <div className="hidden shrink-0 flex-col items-center md:flex" aria-hidden>
                <Mascot mood="happy" size={104} />
                <span className="-mt-1 h-1 w-16 bg-hairline" />
              </div>
            </div>
          </section>

          <section className="mt-10 space-y-3">
            <SectionHead title="Goals" count={items.length} />
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
              {items.map((g, i) => (
                <GoalCard key={g.id} g={g} currency={currency} index={i} onOpen={setOverlay} />
              ))}
              <li className="hidden md:block">
                <button
                  type="button"
                  onClick={() => setOverlay({ kind: "new" })}
                  className="px-card-quiet press flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 p-4 text-center"
                >
                  <Icon name="plus" className="text-ink" />
                  <span className="text-[15px] font-medium leading-6 text-ink">Start a new goal</span>
                  <span className="text-sm leading-5 text-muted">A trip, a cushion, a big buy.</span>
                </button>
              </li>
            </ul>
          </section>
        </>
      )}

      {overlay?.kind === "new" ? (
        <Overlay title="New goal" onClose={close}>
          <GoalForm action={createGoal} onDone={close} submitLabel="Create goal" />
        </Overlay>
      ) : null}

      {overlay?.kind === "edit" ? (
        <Overlay title="Edit goal" onClose={close}>
          <GoalForm
            action={updateGoal}
            initial={toInitial(overlay.goal)}
            onDone={close}
            submitLabel="Save changes"
          />
        </Overlay>
      ) : null}

      {overlay?.kind === "add" ? (
        <Overlay title={`Add to ${overlay.goal.name}`} onClose={close}>
          <ContributionForm
            action={addContribution}
            goalId={overlay.goal.id}
            submitLabel="Add contribution"
            onDone={close}
          />
        </Overlay>
      ) : null}

      {overlay?.kind === "withdraw" ? (
        <Overlay title={`Withdraw from ${overlay.goal.name}`} onClose={close}>
          <ContributionForm
            action={withdrawFromGoal}
            goalId={overlay.goal.id}
            submitLabel="Withdraw"
            hint="Use this to take money out or fix a mistake. It's recorded as a negative entry."
            onDone={close}
          />
        </Overlay>
      ) : null}
    </div>
  );
}
