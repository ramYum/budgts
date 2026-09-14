"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/budget/money";

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
    <div className="relative rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 pr-8 text-sm text-warn">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-1.5 top-1.5 rounded-full p-1 text-warn/70 hover:bg-warn/15 hover:text-warn"
      >
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
          <path
            d="M5 5l10 10M15 5L5 15"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <p>
        This month&apos;s budgets add up to {formatMoney(budgeted, currency)}, more than the{" "}
        {formatMoney(income, currency)} you&apos;ve brought in so far.{" "}
        <Link href="/budgets" className="underline underline-offset-2">
          Review your budgets
        </Link>
        .
      </p>
    </div>
  );
}
