"use client";

import { useCallback, useState } from "react";
import { Icon } from "@/components/icon";
import { SectionHead } from "@/components/ui";
import type { DetachedHeldGroup } from "@/lib/plaid/detached-held";
import type { DetachedAnsweredGroup } from "@/lib/plaid/detached-held-read";
import { answerDetachedHeldAction, changeDetachedHeldAnswerAction } from "@/server/plaid/actions";
import { MoneyDirectionQuestion } from "./connected-banks";

/** The anchor other screens link to (Activity's "Not counted yet", Home's notice). */
export const REMOVED_BANKS_ANCHOR = "from-removed-banks";

/**
 * Held rows a disconnected bank left behind (design: 2026-10-01 card payments §5c). Their Plaid account is gone, so no
 * bank card above can ask about them; this asks the same plain question under the Budgts account they live in, one
 * group per original bank feed, and keeps "Change answer" for a group already answered.
 */
export function RemovedBanksHeld({ groups, answered }: { groups: DetachedHeldGroup[]; answered: DetachedAnsweredGroup[] }) {
  if (groups.length === 0 && answered.length === 0) return null;
  return (
    <section id={REMOVED_BANKS_ANCHOR} className="px-card-raised scroll-mt-6 space-y-4 p-2 md:p-6" data-testid="removed-banks-held">
      <SectionHead as="h3" title="From removed banks" />
      <ul className="px-rows">
        {groups.map((g) => (
          <li
            key={`${g.accountId}|${g.originRef}`}
            className="space-y-2 py-4 first:pt-2 last:pb-0"
            data-testid={`removed-held-${g.accountId}`}
          >
            <p className="truncate text-[15px] font-medium leading-6 text-ink">{g.accountName}</p>
            <div className="px-band space-y-2 px-1.5 py-1.5 text-sm leading-5 text-ink md:px-2 md:py-2 md:text-[15px] md:leading-6">
              <p className="flex items-start gap-2">
                <Icon name="pending" className="text-graphite" />
                <span>
                  A bank you disconnected left{" "}
                  <span className="font-semibold">
                    {g.count} {g.count === 1 ? "transaction" : "transactions"}
                  </span>{" "}
                  here before Budgts could check its transaction format. {g.count === 1 ? "It counts" : "They count"} once
                  you answer.
                </span>
              </p>
              <MoneyDirectionQuestion sample={g.sample} action={answerDetachedHeldAction} lead="Was this money going out or coming in?" />
            </div>
          </li>
        ))}
        {answered.map((a) => (
          <AnsweredLine key={`${a.accountId}|${a.originRef}`} group={a} />
        ))}
      </ul>
    </section>
  );
}

function AnsweredLine({ group }: { group: DetachedAnsweredGroup }) {
  const [asking, setAsking] = useState(false);
  const close = useCallback(() => setAsking(false), []);
  return (
    <li className="space-y-2 py-4 text-sm leading-5 text-muted first:pt-2 last:pb-0" data-testid={`removed-answered-${group.accountId}`}>
      <p>
        <span className="font-medium text-ink">{group.accountName}</span>. Money direction set.{" "}
        <button
          type="button"
          className="font-medium text-ink underline underline-offset-2"
          aria-expanded={asking}
          onClick={() => setAsking((v) => !v)}
        >
          Change answer
        </button>
      </p>
      {asking ? (
        <div className="px-band px-1.5 py-1.5 text-ink md:px-2 md:py-2 md:text-[15px] md:leading-6">
          <MoneyDirectionQuestion
            sample={group.sample}
            action={changeDetachedHeldAnswerAction}
            lead="Was this money going out or coming in?"
            onDone={close}
          />
        </div>
      ) : null}
    </li>
  );
}
