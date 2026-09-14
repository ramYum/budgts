"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

function ArchiveButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("id", id);
          fd.set("archived", "1");
          await setGoalArchived({}, fd);
          router.refresh();
        })
      }
      className="text-xs text-muted hover:text-text disabled:opacity-50"
    >
      Archive
    </button>
  );
}

function GoalCard({
  g,
  currency,
  onOpen,
}: {
  g: GoalProgress;
  currency: string;
  onOpen: (s: OverlayState) => void;
}) {
  return (
    <li className="card space-y-2 rounded-2xl border border-hairline p-4">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
        <span className="tnum shrink-0 text-muted">
          {formatMoney(g.saved, currency)} / {formatMoney(g.target, currency)}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-track">
        <div
          className="h-full rounded-full bg-fill-under"
          style={{ width: `${g.pct}%` }}
          aria-hidden
        />
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <p className="tnum text-xs text-muted">
          {g.complete ? "Reached 🎉" : `${formatMoney(g.remaining, currency)} to go`}
          {g.targetDate ? ` · by ${g.targetDate}` : ""}
        </p>
        <span className="tnum text-xs text-muted">{g.pct}%</span>
      </div>

      <div className="flex gap-3 pt-1 text-xs">
        <button type="button" onClick={() => onOpen({ kind: "add", goal: g })} className="font-medium text-text hover:underline">
          + Add
        </button>
        <button type="button" onClick={() => onOpen({ kind: "withdraw", goal: g })} className="text-muted hover:text-text">
          Withdraw
        </button>
        <button type="button" onClick={() => onOpen({ kind: "edit", goal: g })} className="text-muted hover:text-text">
          Edit
        </button>
        <ArchiveButton id={g.id} />
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

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Savings goals</h1>
        <button
          type="button"
          onClick={() => setOverlay({ kind: "new" })}
          className="rounded-full bg-primary-btn px-3 py-1.5 text-sm font-medium text-on-primary-btn"
        >
          + Add goal
        </button>
      </div>

      {summary.activeCount > 0 ? (
        <p className="tnum text-xs text-muted">
          {formatMoney(summary.totalSaved, currency)} of{" "}
          {formatMoney(summary.totalTarget, currency)} saved across {summary.activeCount}{" "}
          {summary.activeCount === 1 ? "goal" : "goals"}
          {summary.completeCount > 0 ? ` · ${summary.completeCount} reached` : ""}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Mascot mood="curious" size={64} />
          <p className="text-sm text-muted">
            No goals yet. Add one with <span className="font-medium text-text">+ Add goal</span> to
            start tracking — small steps add up.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((g) => (
            <GoalCard key={g.id} g={g} currency={currency} onOpen={setOverlay} />
          ))}
        </ul>
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
