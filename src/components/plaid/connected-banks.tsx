"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Overlay } from "@/components/overlay";
import {
  clearAccountReview,
  disconnectBank,
  mapAccounts,
  setAccountCalculationExclusionAction,
  syncConnection,
  type PlaidActionState,
} from "@/server/plaid/actions";
import { AccountMapping, type MappableAccount } from "./account-mapping";
import { ReconnectButton } from "./reconnect-button";

export type ConnectedBankAccount = {
  rowId: string;
  plaidAccountId: string;
  name: string | null;
  mask: string | null;
  linkState: "mapped" | "ignored" | "unmapped";
  mappedAccountName: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  excludedFromCalculations: boolean;
};

export type ConnectedBank = {
  id: string;
  itemId: string;
  institutionName: string | null;
  status: "active" | "login_required" | "pending_expiration" | "revoked" | "error";
  lastSyncedAt: string | null;
  accounts: ConnectedBankAccount[];
  unmappedAccounts: MappableAccount[];
};

const NEEDS_ATTENTION: ConnectedBank["status"][] = ["login_required", "pending_expiration", "revoked", "error"];

function whenLabel(iso: string | null): string {
  if (!iso) return "not yet";
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ConnectedBanks({
  banks,
  budgtsAccounts,
}: {
  banks: ConnectedBank[];
  budgtsAccounts: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {banks.map((bank) => (
          <BankCard key={bank.id} bank={bank} budgtsAccounts={budgtsAccounts} />
        ))}
      </ul>
      <p className="text-xs text-muted">
        Disconnecting a bank keeps every transaction it already imported — they stay in Budgts as history.
      </p>
    </div>
  );
}

function BankCard({
  bank,
  budgtsAccounts,
}: {
  bank: ConnectedBank;
  budgtsAccounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [syncing, startSync] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [stopping, setStopping] = useState<ConnectedBankAccount | null>(null);

  const needsAttention = NEEDS_ATTENTION.includes(bank.status);
  const hasUnmapped = bank.unmappedAccounts.length > 0;

  const runSync = () =>
    startSync(async () => {
      setSyncMsg(null);
      const res = await syncConnection(bank.itemId);
      if (res.error) setSyncMsg(res.error);
      else if (res.warning) setSyncMsg(res.warning);
      else setSyncMsg("Synced.");
      router.refresh();
    });

  return (
    <li className="card space-y-3 rounded-2xl border border-hairline p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{bank.institutionName ?? "Bank"}</p>
          <p className="text-xs text-muted">Last synced {whenLabel(bank.lastSyncedAt)}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            needsAttention ? "bg-neg/10 text-neg" : "bg-tint text-pine"
          }`}
        >
          {needsAttention ? "Needs attention" : "Connected"}
        </span>
      </div>

      {needsAttention ? (
        <div className="space-y-2 rounded-lg border border-neg/30 bg-neg/5 p-3">
          <p className="text-sm text-text">
            {bank.status === "revoked"
              ? "Access to this bank was revoked. Reconnect to keep it syncing, or disconnect it."
              : "This connection needs you to sign in with your bank again."}
          </p>
          <ReconnectButton itemId={bank.itemId} />
        </div>
      ) : null}

      <ul className="space-y-1 text-sm">
        {bank.accounts.map((a, i) => (
          <li key={i} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-muted">
                {a.name ?? "Account"}
                {a.mask ? ` ••${a.mask}` : ""}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                {a.linkState === "mapped"
                  ? `→ ${a.mappedAccountName ?? "linked"}`
                  : a.linkState === "ignored"
                    ? "not imported"
                    : "not set up"}
                {a.linkState === "mapped" ? (
                  <button
                    type="button"
                    onClick={() => setStopping(a)}
                    className="rounded-md border border-border px-1.5 py-0.5 font-medium hover:bg-surface-2"
                  >
                    Stop importing
                  </button>
                ) : null}
              </span>
            </div>
            {a.needsReview || a.excludedFromCalculations ? <AccountReviewNotice account={a} /> : null}
          </li>
        ))}
      </ul>

      {hasUnmapped ? (
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
        >
          Choose accounts to import
        </button>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runSync}
          disabled={syncing}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-neg/40 px-3 py-1.5 text-sm font-medium text-neg hover:bg-neg/5"
        >
          Disconnect
        </button>
        {syncMsg ? <span className="text-xs text-muted">{syncMsg}</span> : null}
      </div>

      {confirming ? (
        <Overlay title={`Disconnect ${bank.institutionName ?? "this bank"}?`} onClose={() => setConfirming(false)}>
          <DisconnectConfirm
            itemId={bank.itemId}
            bankName={bank.institutionName ?? "this bank"}
            onClose={() => setConfirming(false)}
          />
        </Overlay>
      ) : null}

      {choosing ? (
        <Overlay title="Choose which accounts to import" onClose={() => setChoosing(false)}>
          <AccountMapping
            plaidItemId={bank.id}
            plaidAccounts={bank.unmappedAccounts}
            budgtsAccounts={budgtsAccounts}
            onDone={() => {
              setChoosing(false);
              router.refresh();
            }}
          />
        </Overlay>
      ) : null}

      {stopping ? (
        <Overlay title={`Stop importing ${stopping.name ?? "this account"}?`} onClose={() => setStopping(null)}>
          <StopImportingConfirm
            plaidItemId={bank.id}
            account={stopping}
            onClose={() => setStopping(null)}
          />
        </Overlay>
      ) : null}
    </li>
  );
}

/**
 * Per-account anomaly-review warning (design: 2026-09-12), plus the
 * calculation-exclusion controls (design: 2026-09-13 Advancial containment).
 * Never hidden by default — the reason and the "Mark reviewed" action are
 * the ONLY way the review half goes away, so the owner always sees why
 * totals might be off before dismissing it. Neither action ever touches a
 * transaction row.
 *
 * "Exclude from totals" only ever renders while `needsReview` is true —
 * the server also enforces this (never trust client-supplied state), but
 * not offering the button for a healthy account is the first line of
 * defense against excluding one by mistake.
 */
function AccountReviewNotice({ account }: { account: ConnectedBankAccount }) {
  const router = useRouter();
  const [reviewState, reviewAction, reviewPending] = useActionState<PlaidActionState, FormData>(
    clearAccountReview,
    {},
  );
  const [exclusionState, exclusionAction, exclusionPending] = useActionState<PlaidActionState, FormData>(
    setAccountCalculationExclusionAction,
    {},
  );

  useEffect(() => {
    if (reviewState.ok || exclusionState.ok) router.refresh();
  }, [reviewState.ok, exclusionState.ok, router]);

  if (account.excludedFromCalculations) {
    return (
      <div className="space-y-1.5 rounded-lg border border-neg/40 bg-neg/5 p-2.5 text-xs text-neg">
        <p>
          <span className="font-medium">Excluded from totals.</span> This account&apos;s bank feed showed
          unreliable data, so its transactions no longer count toward Money Left, budgets, or spending. Nothing was
          deleted — every transaction is still here in your history.
        </p>
        {exclusionState.error ? <p>{exclusionState.error}</p> : null}
        <form action={exclusionAction}>
          <input type="hidden" name="plaidAccountRowId" value={account.rowId} />
          <input type="hidden" name="excluded" value="0" />
          <button
            type="submit"
            disabled={exclusionPending}
            className="rounded-md border border-neg/50 px-1.5 py-0.5 font-medium hover:bg-neg/10 disabled:opacity-50"
          >
            {exclusionPending ? "Saving…" : "Include again"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-warn/40 bg-warn/10 p-2.5 text-xs text-warn">
      <p>{account.reviewReason}</p>
      {reviewState.error ? <p className="text-neg">{reviewState.error}</p> : null}
      {exclusionState.error ? <p className="text-neg">{exclusionState.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <form action={reviewAction}>
          <input type="hidden" name="plaidAccountRowId" value={account.rowId} />
          <button
            type="submit"
            disabled={reviewPending}
            className="rounded-md border border-warn/50 px-1.5 py-0.5 font-medium hover:bg-warn/10 disabled:opacity-50"
          >
            {reviewPending ? "Saving…" : "Mark reviewed"}
          </button>
        </form>
        {account.needsReview ? (
          <form action={exclusionAction}>
            <input type="hidden" name="plaidAccountRowId" value={account.rowId} />
            <input type="hidden" name="excluded" value="1" />
            <button
              type="submit"
              disabled={exclusionPending}
              className="rounded-md border border-warn/50 px-1.5 py-0.5 font-medium hover:bg-warn/10 disabled:opacity-50"
            >
              {exclusionPending ? "Saving…" : "Exclude from totals"}
            </button>
          </form>
        ) : null}
      </div>
      <p className="text-[11px] text-warn/80">
        Excluding keeps every transaction visible in your history — it only stops this account from affecting Money
        Left, budgets, and spending totals.
      </p>
    </div>
  );
}

function StopImportingConfirm({
  plaidItemId,
  account,
  onClose,
}: {
  plaidItemId: string;
  account: ConnectedBankAccount;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<PlaidActionState, FormData>(mapAccounts, {});

  useEffect(() => {
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  const entries = [{ plaidAccountId: account.plaidAccountId, mode: "ignore" }];

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="plaidItemId" value={plaidItemId} />
      <input type="hidden" name="entries" value={JSON.stringify(entries)} readOnly />

      <p className="text-sm text-muted">
        Budgts stops importing new transactions from {account.name ?? "this account"}. Transactions already
        imported stay in your history and keep counting toward budgets.
      </p>

      {state.error ? <p className="text-sm text-neg">{state.error}</p> : null}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-neg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Stop importing"}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function DisconnectConfirm({
  itemId,
  bankName,
  onClose,
}: {
  itemId: string;
  bankName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<PlaidActionState, FormData>(disconnectBank, {});
  const [purge, setPurge] = useState(false);

  useEffect(() => {
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="purge" value={purge ? "1" : "0"} />

      <p className="text-sm text-muted">
        Budgts stops syncing {bankName}. The transactions it already imported stay in your history and keep
        counting toward budgets.
      </p>

      <label className="flex items-start gap-2 rounded-lg border border-neg/30 bg-neg/5 p-3 text-sm">
        <input
          type="checkbox"
          checked={purge}
          onChange={(e) => setPurge(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Also delete the {bankName} transactions Budgts imported. This can&apos;t be undone.
        </span>
      </label>

      {state.error ? <p className="text-sm text-neg">{state.error}</p> : null}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-neg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Disconnecting…" : purge ? "Disconnect and delete" : "Disconnect"}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
