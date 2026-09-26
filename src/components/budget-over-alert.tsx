"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/budget/money";
import { Icon } from "./icon";

/**
 * Dismissal is per browser tab session, not per-view: switching tabs and
 * coming back must NOT bring the banner back, but relaunching the app
 * (a fresh tab/session) should. sessionStorage gives us exactly that — it
 * survives for the life of the tab but is cleared when the tab/app closes.
 *
 * Reads sessionStorage via useSyncExternalStore (not state-in-effect) so the
 * server-rendered markup (which can't know about browser storage) doesn't
 * mismatch on hydration — getServerSnapshot always reports "not dismissed".
 */
const DISMISS_EVENT = "budget-over-alert-dismiss";

function storageKey(month: string): string {
  return `budget-over-alert-dismissed:${month}`;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(DISMISS_EVENT, callback);
  return () => window.removeEventListener(DISMISS_EVENT, callback);
}

function getServerSnapshot(): boolean {
  return false;
}

export function BudgetOverAlert({
  month,
  budgeted,
  income,
  currency,
}: {
  month: string;
  budgeted: number;
  income: number;
  currency: string;
}) {
  const getSnapshot = useCallback(() => {
    try {
      return window.sessionStorage.getItem(storageKey(month)) === "1";
    } catch {
      return false;
    }
  }, [month]);

  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (dismissed) return null;

  function dismiss() {
    try {
      window.sessionStorage.setItem(storageKey(month), "1");
    } catch {
      // sessionStorage unavailable (e.g. private browsing) — dismissal just won't persist
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }

  return (
    <div className="px-warn relative flex items-start gap-3 p-3 pr-12 text-[15px] leading-6 text-ink md:p-4 md:pr-14">
      <Icon name="warning" className="text-warn" />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="press absolute right-2 top-2 flex h-9 w-9 items-center justify-center text-muted hover:text-ink"
      >
        <Icon name="close" />
      </button>
      <p className="tnum">
        This month&apos;s budgets add up to {formatMoney(budgeted, currency)}, more than the{" "}
        {formatMoney(income, currency)} you&apos;ve brought in so far.{" "}
        <Link href="/budgets" className="font-medium underline underline-offset-2">
          Review your budgets
        </Link>
        .
      </p>
    </div>
  );
}
