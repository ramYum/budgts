"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/accounts/account-types";
import {
  accountHint,
  accountLabel,
  existingChoices,
  mappingStart,
  previousAccountNote,
  suggestAccount,
  type MappingSuggestion,
} from "@/lib/accounts/account-suggestion";
import { mapAccounts, mappingSuggestionsAction, type PlaidActionState } from "@/server/plaid/actions";
import { buttonClass, fieldClass as field, labelClass } from "@/components/ui";

// Defined beside the shared read (connected-banks-read.ts), used by the web and the native API.
export type { MappableAccount } from "@/lib/plaid/connected-banks-read";
import type { MappableAccount } from "@/lib/plaid/connected-banks-read";

type BudgtsAccount = { id: string; name: string };
type Mode = "new" | "existing" | "ignore";
type Row = { mode: Mode; name: string; type: AccountType; existingAccountId: string };

type Props = {
  plaidItemId: string;
  plaidAccounts: MappableAccount[];
  budgtsAccounts: BudgtsAccount[];
  onDone: () => void;
};

type SuggestionLoad =
  | { status: "loading" }
  | { status: "ready"; suggestions: Record<string, MappingSuggestion> }
  | { status: "failed" };

/**
 * Account-mapping screen (design §11). One row per linked Plaid account: create
 * a new Budgts account, point at an existing one, or skip it. Each row starts
 * from `suggestAccount` (a new account of a guessed type, or "Don't import" for
 * an HSA, investment or loan) and the user can change any of them. On
 * submit the mapping is saved and the first sync runs.
 *
 * A bank account connected before starts on the Budgts account its history is
 * in (owner decision 2026-10-02): reconnect adoption re-attaches that history
 * only there, so the server's suggestions (`mappingSuggestionsAction`) are read
 * before the rows are shown, and saving waits for them.
 */
export function AccountMapping(props: Props) {
  const { plaidItemId } = props;
  const [load, setLoad] = useState<SuggestionLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    mappingSuggestionsAction(plaidItemId).then(
      (r) => alive && setLoad(r.ok ? { status: "ready", suggestions: r.suggestions } : { status: "failed" }),
      () => alive && setLoad({ status: "failed" }),
    );
    return () => {
      alive = false;
    };
  }, [plaidItemId, attempt]);

  if (load.status === "loading") {
    return <p className="text-sm text-muted" data-testid="account-mapping-loading">Checking your accounts…</p>;
  }
  if (load.status === "failed") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neg" data-testid="account-mapping-load-error">Couldn&apos;t load your accounts. Try again.</p>
        <button
          type="button"
          data-testid="account-mapping-retry"
          className={buttonClass("primary", "w-full")}
          onClick={() => {
            setLoad({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }
  return <MappingForm {...props} suggestions={load.suggestions} />;
}

function MappingForm({
  plaidItemId,
  plaidAccounts,
  budgtsAccounts,
  onDone,
  suggestions,
}: Props & { suggestions: Record<string, MappingSuggestion> }) {
  const [state, formAction, pending] = useActionState<PlaidActionState, FormData>(mapAccounts, {});
  const [rows, setRows] = useState<Row[]>(() =>
    plaidAccounts.map((a) => {
      const { mode, type } = suggestAccount(a);
      const suggestion = suggestions[a.plaidAccountId];
      const start = mappingStart(suggestion, budgtsAccounts);
      return {
        mode: start?.mode ?? mode,
        name: accountLabel(a),
        type,
        existingAccountId: start?.existingAccountId ?? existingChoices(budgtsAccounts, suggestion)[0]?.id ?? "",
      };
    }),
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
        <p className="text-sm text-muted" data-testid="account-mapping-warning">{state.warning}</p>
        <button
          type="button"
          onClick={onDone}
          data-testid="account-mapping-done"
          className={buttonClass("primary", "w-full")}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" data-testid="account-mapping">
      <input type="hidden" name="plaidItemId" value={plaidItemId} />
      <input type="hidden" name="entries" value={JSON.stringify(entries)} readOnly />

      <p className="text-sm text-muted">
        Each account can become a new Budgts account, feed one you already have, or be left out.
      </p>

      <ul className="space-y-3">
        {plaidAccounts.map((a, i) => {
          const r = rows[i];
          const hint = accountHint(a);
          const suggestion = suggestions[a.plaidAccountId];
          const previous = mappingStart(suggestion, budgtsAccounts) && suggestion?.kind === "previous" ? suggestion : null;
          return (
            <li key={a.plaidAccountId} className="px-card space-y-3 p-3" data-testid={`account-mapping-row-${i}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] font-medium leading-6 text-ink">{accountLabel(a)}</span>
                <span className="shrink-0 text-sm text-muted">{a.subtype ?? a.type ?? "account"}</span>
              </div>
              {previous ? (
                <p className="text-sm text-muted" data-testid={`account-mapping-previous-${i}`}>
                  {previousAccountNote(previous.accountName)}
                </p>
              ) : null}
              {hint ? <p className="text-sm text-muted">{hint}</p> : null}

              <label className={labelClass}>
                Import as
                <select
                  className={field}
                  data-testid={`account-mapping-mode-${i}`}
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
                    data-testid={`account-mapping-name-${i}`}
                    value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    maxLength={40}
                    aria-label="New account name"
                  />
                  <select
                    className={`${field} w-28 shrink-0`}
                    data-testid={`account-mapping-type-${i}`}
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
                  data-testid={`account-mapping-existing-${i}`}
                  value={r.existingAccountId}
                  onChange={(e) => update(i, { existingAccountId: e.target.value })}
                  aria-label="Existing account"
                >
                  {existingChoices(budgtsAccounts, suggestion).map((b) => (
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
        <p className="text-sm text-neg" data-testid="account-mapping-error">{state.fieldError ?? state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        data-testid="account-mapping-save"
        className={buttonClass("primary", "w-full")}
      >
        {pending ? "Saving…" : "Import transactions"}
      </button>
    </form>
  );
}
