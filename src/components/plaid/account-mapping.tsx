"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/validation/account";
import { mapAccounts, type PlaidActionState } from "@/server/plaid/actions";

export type MappableAccount = {
  plaidAccountId: string;
  name: string | null;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  currentBalance: number | null;
  isoCurrencyCode: string | null;
};

type BudgtsAccount = { id: string; name: string };
type Mode = "new" | "existing" | "ignore";
type Row = { mode: Mode; name: string; type: AccountType; existingAccountId: string };

const field =
  "w-full rounded-xl border border-hairline bg-surface px-3.5 py-3 text-sm outline-none transition-colors focus:border-ink";

/** Shared with ConnectToggle (connected-banks.tsx) — the minimal shape both
 * the bulk mapping form and the per-account quick-connect switch need to
 * guess a sensible default name/type for a brand-new Budgts account. */
export type GuessableAccount = Pick<MappableAccount, "name" | "officialName" | "mask" | "type" | "subtype">;

export function guessType(a: GuessableAccount): AccountType {
  if (a.subtype === "savings") return "savings";
  if (a.type === "credit") return "credit";
  return "checking";
}

export function accountLabel(a: GuessableAccount): string {
  const base = a.name?.trim() || a.officialName?.trim() || "Account";
  return a.mask ? `${base} ••${a.mask}` : base;
}

/**
 * Account-mapping screen (design §11). One row per linked Plaid account: create
 * a new Budgts account (default), point at an existing one, or skip it. On
 * submit the mapping is saved and the first sync runs.
 */
export function AccountMapping({
  plaidItemId,
  plaidAccounts,
  budgtsAccounts,
  onDone,
}: {
  plaidItemId: string;
  plaidAccounts: MappableAccount[];
  budgtsAccounts: BudgtsAccount[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<PlaidActionState, FormData>(mapAccounts, {});
  const [rows, setRows] = useState<Row[]>(() =>
    plaidAccounts.map((a) => ({
      mode: "new" as Mode,
      name: accountLabel(a),
      type: guessType(a),
      existingAccountId: budgtsAccounts[0]?.id ?? "",
    })),
  );

  useEffect(() => {
    if (state.ok && !state.warning) onDone();
  }, [state.ok, state.warning, onDone]);

  const entries = useMemo(
    () =>
      plaidAccounts.map((a, i) => {
        const r = rows[i];
        return {
          plaidAccountId: a.plaidAccountId,
          mode: r.mode,
          ...(r.mode === "new" ? { name: r.name.trim(), type: r.type } : {}),
          ...(r.mode === "existing" ? { existingAccountId: r.existingAccountId } : {}),
        };
      }),
    [plaidAccounts, rows],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (state.ok && state.warning) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">{state.warning}</p>
        <button
          type="button"
          onClick={onDone}
          className="w-full press rounded-xl bg-primary-btn px-4 py-3 text-sm font-medium text-on-primary-btn"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="plaidItemId" value={plaidItemId} />
      <input type="hidden" name="entries" value={JSON.stringify(entries)} readOnly />

      <p className="text-sm text-muted">
        Each account can become a new Budgts account, feed one you already have, or be left out.
      </p>

      <ul className="space-y-3">
        {plaidAccounts.map((a, i) => {
          const r = rows[i];
          return (
            <li key={a.plaidAccountId} className="card space-y-2 rounded-xl border border-hairline p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{accountLabel(a)}</span>
                <span className="shrink-0 text-xs text-muted">{a.subtype ?? a.type ?? "account"}</span>
              </div>

              <label className="block space-y-1 text-xs font-medium text-muted">
                Import as
                <select
                  className={field}
                  value={r.mode}
                  onChange={(e) => update(i, { mode: e.target.value as Mode })}
                >
                  <option value="new">A new Budgts account</option>
                  <option value="existing" disabled={budgtsAccounts.length === 0}>
                    An existing account
                  </option>
                  <option value="ignore">Don&apos;t import this one</option>
                </select>
              </label>

              {r.mode === "new" ? (
                <div className="flex gap-2">
                  <input
                    className={`${field} min-w-0 flex-1`}
                    value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    maxLength={40}
                    aria-label="New account name"
                  />
                  <select
                    className={`${field} w-28 shrink-0`}
                    value={r.type}
                    onChange={(e) => update(i, { type: e.target.value as AccountType })}
                    aria-label="New account type"
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {r.mode === "existing" ? (
                <select
                  className={field}
                  value={r.existingAccountId}
                  onChange={(e) => update(i, { existingAccountId: e.target.value })}
                  aria-label="Existing account"
                >
                  {budgtsAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </li>
          );
        })}
      </ul>

      {state.fieldError || state.error ? (
        <p className="text-sm text-neg">{state.fieldError ?? state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full press rounded-xl bg-primary-btn px-4 py-3 text-sm font-medium text-on-primary-btn disabled:opacity-50"
      >
        {pending ? "Saving…" : "Import transactions"}
      </button>
    </form>
  );
}
