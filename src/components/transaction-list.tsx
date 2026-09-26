"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { formatMoney } from "@/lib/budget/money";
import { deleteTransaction, updateTransaction } from "@/server/transactions";
import { Overlay } from "./overlay";
import { Mascot } from "./mascot";
import { Icon } from "./icon";
import { Button, CategoryIcon, SegmentedControl } from "./ui";
import {
  TransactionForm,
  type AccountOption,
  type CategoryOption,
  type TransactionInitial,
} from "./transaction-form";

export type TxnListItem = {
  id: string;
  amount: number;
  direction: "debit" | "credit";
  occurred_at: string;
  description: string;
  note: string | null;
  is_transfer: boolean;
  category_id: string | null;
  account_id: string;
  category: { name: string; color: string } | null;
  account: { name: string } | null;
};

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fullDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A day's net for its band: money in minus money out across that day's
 * listed rows. Display only; each row keeps its own amount. */
function signedTotal(minor: number, currency: string) {
  return `${minor > 0 ? "+" : minor < 0 ? "−" : ""}${formatMoney(Math.abs(minor), currency)}`;
}

/** Rows rendered at first, and added each time the reader nears the end. A
 * heavy bank feed has 1,000+ rows a month; rendering every one up front made
 * each tap and keystroke on this screen wait on the whole list. Search and
 * the filters still cover every row. */
const SLICE = 60;

/** The rendered rows, grouped by day under a pixel band with the day's net.
 * Memoized so opening a transaction's sheet (state in the parent) doesn't
 * re-render the list behind it. */
const TxnDays = memo(function TxnDays({
  rows,
  dayTotals,
  kinds,
  currency,
  onOpen,
}: {
  rows: TxnListItem[];
  /** each day's net across every matching row, not just the rendered slice */
  dayTotals: Map<string, number>;
  /** category id -> kind, to mark a refund (money back into a spending category) */
  kinds: Map<string, "expense" | "income">;
  currency: string;
  onOpen: (item: TxnListItem) => void;
}) {
  const groups = new Map<string, TxnListItem[]>();
  for (const it of rows) {
    const key = it.occurred_at.slice(0, 10);
    const bucket = groups.get(key);
    if (bucket) bucket.push(it);
    else groups.set(key, [it]);
  }
  return [...groups.entries()].map(([day, dayRows]) => (
    <section key={day}>
      <h3 className="flex items-center justify-between gap-3 bg-surface-2 px-3 py-2.5 md:px-4">
        <span className="px-tag text-graphite">{dayLabel(day)}</span>
        <span className="px-tag tnum tracking-normal text-graphite">
          {signedTotal(dayTotals.get(day) ?? 0, currency)}
        </span>
      </h3>
      <ul className="px-rows px-3 md:px-4">
        {dayRows.map((it) => {
          const needsCategory = !it.is_transfer && !it.category_id;
          const refund =
            !it.is_transfer && it.direction === "credit" && !!it.category_id && kinds.get(it.category_id) === "expense";
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onOpen(it)}
                aria-labelledby={`txn-${it.id}-title`}
                aria-describedby={`txn-${it.id}-meta txn-${it.id}-amount`}
                className="press group flex w-full items-center gap-3 py-3 text-left md:gap-4"
              >
                <CategoryIcon name={it.is_transfer ? "Transfer" : (it.category?.name ?? "")} />
                <span className="min-w-0 flex-1">
                  <span
                    id={`txn-${it.id}-title`}
                    className="block truncate text-[15px] font-medium leading-6 text-ink group-hover:underline"
                  >
                    {it.description || it.category?.name || "Transaction"}
                  </span>
                  <span
                    id={`txn-${it.id}-meta`}
                    className={`block truncate text-sm leading-5 ${needsCategory ? "text-warn" : "text-muted"}`}
                  >
                    {it.is_transfer ? "Transfer" : needsCategory ? "Needs a category" : it.category?.name}
                    {refund ? " · Refund" : ""}
                  </span>
                </span>
                <span
                  id={`txn-${it.id}-amount`}
                  className={`tnum shrink-0 text-[15px] font-semibold leading-6 ${
                    it.direction === "credit" ? "text-pos" : "text-ink"
                  }`}
                >
                  {it.direction === "debit" ? "−" : "+"}
                  {formatMoney(it.amount, currency)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  ));
});

/** The end of the rendered rows. It adds the next slice when it scrolls
 * within reach (well before it is on screen), or when tapped. The observer
 * is rebuilt after every slice, so a screen tall enough to still show it
 * keeps filling without a scroll. */
function MoreRows({ remaining, onMore }: { remaining: number; onMore: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onMore();
      },
      { rootMargin: "0px 0px 600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onMore, remaining]);
  return (
    <Button ref={ref} variant="secondary" onClick={onMore} className="w-full" iconAfter="chevron-down">
      Show {Math.min(remaining, SLICE)} more
    </Button>
  );
}

/** A label/value line in the transaction sheet. */
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

export function TransactionList({
  items,
  currency,
  accounts,
  categories,
}: {
  items: TxnListItem[];
  currency: string;
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [viewing, setViewing] = useState<TxnListItem | null>(null);
  const [editing, setEditing] = useState<TxnListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [transferPending, startTransferTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "spending" | "income" | "transfers">("all");
  const [shown, setShown] = useState(SLICE);
  const showMore = useCallback(() => setShown((n) => n + SLICE), []);
  const kinds = useMemo(() => new Map(categories.map((c) => [c.id, c.kind])), [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (q) {
        const haystack = `${it.description} ${it.category?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (kindFilter === "transfers") return it.is_transfer;
      if (kindFilter === "income") return !it.is_transfer && it.direction === "credit";
      if (kindFilter === "spending") return !it.is_transfer && it.direction === "debit";
      return true;
    });
  }, [items, search, kindFilter]);
  const visible = useMemo(() => filtered.slice(0, shown), [filtered, shown]);
  const dayTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const it of filtered) {
      const day = it.occurred_at.slice(0, 10);
      totals.set(day, (totals.get(day) ?? 0) + (it.direction === "credit" ? it.amount : -it.amount));
    }
    return totals;
  }, [filtered]);

  /** Flips `isTransfer` via the same `updateTransaction` action the edit form
   * uses — a one-tap toggle from the Detail view (design spec §22) rather than
   * requiring a full edit-form round trip for this one field. */
  const toggleTransfer = (item: TxnListItem) => {
    setTransferError(null);
    startTransferTransition(async () => {
      const fd = new FormData();
      fd.set("accountId", item.account_id);
      fd.set("categoryId", item.category_id ?? "");
      fd.set("amount", (item.amount / 100).toFixed(2));
      fd.set("direction", item.direction);
      fd.set("occurredAt", item.occurred_at.slice(0, 10));
      fd.set("description", item.description);
      fd.set("note", item.note ?? "");
      fd.set("isTransfer", item.is_transfer ? "" : "on");
      fd.set("id", item.id);
      const res = await updateTransaction({}, fd);
      if (res.error || res.fieldErrors) {
        setTransferError(res.error ?? "Could not update this transaction.");
        return;
      }
      setViewing({ ...item, is_transfer: !item.is_transfer });
    });
  };

  if (items.length === 0) {
    return (
      <div className="px-card flex flex-col items-start gap-2 p-4 md:p-6">
        <Mascot mood="sleepy" size={60} />
        <p className="mt-2 text-[15px] font-medium leading-6 text-ink">No transactions this month yet.</p>
        <p className="text-sm leading-5 text-muted">
          Add your first with <span className="font-semibold text-ink">Add</span>, or connect a bank and they arrive
          on their own.
        </p>
      </div>
    );
  }

  const searchBar = (
    <div className="space-y-3">
      <label className="px-search flex h-[46px] items-center gap-2 px-2 text-graphite">
        <Icon name="search" />
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShown(SLICE);
          }}
          placeholder="Search transactions"
          aria-label="Search transactions"
          className="min-w-0 flex-1 bg-transparent text-base leading-6 text-ink outline-none placeholder:text-muted"
        />
      </label>
      <SegmentedControl
        label="Show"
        value={kindFilter}
        onChange={(v) => {
          setKindFilter(v);
          setShown(SLICE);
        }}
        options={[
          { value: "all", label: "All" },
          { value: "spending", label: "Spending" },
          { value: "income", label: "Income" },
          { value: "transfers", label: "Transfers" },
        ]}
      />
    </div>
  );

  if (filtered.length === 0) {
    return (
      <div className="space-y-6">
        {searchBar}
        <p className="px-card p-4 text-center text-[15px] leading-6 text-muted md:p-6">No matching transactions.</p>
      </div>
    );
  }

  /** Deletes, then runs `onDeleted` only if the server actually removed a row.
   * On failure the editor stays open so the message has somewhere to show. */
  const remove = (id: string, onDeleted: () => void) => {
    if (!confirm("Delete this transaction?")) return;
    startTransition(async () => {
      const result = await deleteTransaction(id);
      if (result?.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteError(null);
      onDeleted();
    });
  };

  return (
    <div className="space-y-6">
      {searchBar}
      <div className="reveal px-card pb-1" style={{ ["--i" as string]: 1 }}>
        <TxnDays rows={visible} dayTotals={dayTotals} kinds={kinds} currency={currency} onOpen={setViewing} />
      </div>
      {filtered.length > visible.length ? (
        <MoreRows remaining={filtered.length - visible.length} onMore={showMore} />
      ) : null}

      {viewing ? (
        <Overlay title="Transaction" onClose={() => setViewing(null)}>
          <div className="flex items-center gap-3">
            <CategoryIcon name={viewing.is_transfer ? "Transfer" : (viewing.category?.name ?? "")} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium leading-6 text-ink">
                {viewing.description || viewing.category?.name || "Transaction"}
              </p>
              {viewing.note ? <p className="text-sm leading-5 text-muted">{viewing.note}</p> : null}
            </div>
          </div>
          <dl className="px-card px-rows mt-4 p-3 text-[15px] leading-6">
            <Detail label="Date">{fullDateLabel(viewing.occurred_at)}</Detail>
            <Detail label="Category">
              {viewing.is_transfer ? "Transfer" : (viewing.category?.name ?? "Needs a category")}
            </Detail>
            <Detail label="Account">{viewing.account?.name}</Detail>
            <Detail label="Amount">
              <span className={`tnum font-semibold ${viewing.direction === "credit" ? "text-pos" : ""}`}>
                {viewing.direction === "debit" ? "−" : "+"}
                {formatMoney(viewing.amount, currency)}
              </span>
            </Detail>
          </dl>
          {transferError ? <p className="mt-2 text-sm text-neg">{transferError}</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              icon="edit"
              className="flex-1"
              onClick={() => {
                setEditing(viewing);
                setViewing(null);
              }}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              icon="transfer"
              className="flex-1"
              disabled={transferPending}
              onClick={() => toggleTransfer(viewing)}
            >
              {viewing.is_transfer ? "Remove transfer" : "Mark as transfer"}
            </Button>
          </div>
        </Overlay>
      ) : null}

      {editing ? (
        <Overlay
          title="Edit transaction"
          onClose={() => {
            setEditing(null);
            setDeleteError(null);
          }}
        >
          <TransactionForm
            action={updateTransaction}
            accounts={accounts}
            categories={categories}
            defaultDate={editing.occurred_at.slice(0, 10)}
            initial={toInitial(editing)}
            onDone={() => setEditing(null)}
            submitLabel="Save changes"
          />
          <Button
            variant="danger"
            className="mt-3 w-full"
            disabled={pending}
            onClick={() => remove(editing.id, () => setEditing(null))}
          >
            Delete transaction
          </Button>
          {deleteError ? <p className="mt-2 text-sm text-neg">{deleteError}</p> : null}
        </Overlay>
      ) : null}
    </div>
  );
}

function toInitial(it: TxnListItem): TransactionInitial {
  return {
    id: it.id,
    amount: it.amount,
    direction: it.direction,
    occurredAt: it.occurred_at,
    description: it.description,
    note: it.note,
    isTransfer: it.is_transfer,
    accountId: it.account_id,
    categoryId: it.category_id,
  };
}
