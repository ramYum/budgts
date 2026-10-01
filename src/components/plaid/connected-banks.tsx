"use client";

import { useActionState, useCallback, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Overlay } from "@/components/overlay";
import { Icon } from "@/components/icon";
import { Badge, Button, SectionHead } from "@/components/ui";
import {
  answerSignCheckAction,
  changeSignAnswerAction,
  clearAccountReview,
  disconnectBank,
  mapAccounts,
  setAccountCalculationExclusionAction,
  setAccountImportingAction,
  syncConnection,
  type PlaidActionState,
} from "@/server/plaid/actions";
import { accountLabel, notImportedHint, suggestAccount } from "@/lib/accounts/account-suggestion";
import { formatMoney } from "@/lib/display/money";
import { AccountMapping } from "./account-mapping";
import { ReconnectButton } from "./reconnect-button";

// The shapes are defined beside the shared read (connected-banks-read.ts), used by the web and the native API.
export type { ConnectedBank, ConnectedBankAccount } from "@/lib/plaid/connected-banks-read";
import type { ConnectedBank, ConnectedBankAccount } from "@/lib/plaid/connected-banks-read";
import { formatSyncedAgo } from "@/lib/display/dates";

const NEEDS_ATTENTION: ConnectedBank["status"][] = ["login_required", "pending_expiration", "revoked", "error"];

/**
 * "Last synced" wording. A relative label depends on the clock and the viewer's time zone, and the
 * server renders in UTC a moment before the browser hydrates — so rendering it during SSR/hydration
 * causes a text mismatch (React #418). Until hydrated, show the stable UTC calendar date instead.
 */
function whenLabel(iso: string, hydrated: boolean): string {
  if (!hydrated) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  return formatSyncedAgo(iso, Date.now());
}

const subscribeNever = () => () => {};

/** false during SSR and the hydration render, true afterwards (no setState-in-effect). */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

/** "First Platypus Bank (Sandbox)" -> the bank's name and a sandbox flag. */
function bankName(raw: string | null): { name: string; sandbox: boolean } {
  const name = raw ?? "Bank";
  const m = name.match(/^(.*?)\s*\(Sandbox\)$/i);
  return m ? { name: m[1]!, sandbox: true } : { name, sandbox: false };
}

const accountName = (a: ConnectedBankAccount) => `${a.name ?? "Account"}${a.mask ? ` ••${a.mask}` : ""}`;

/** The pixel switch's square knob (the button itself carries the stepped track). */
function SwitchKnob({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`block h-3 w-3 transition-transform motion-reduce:transition-none ${
        on ? "translate-x-5 bg-white" : "translate-x-0 bg-silver"
      }`}
    />
  );
}

const switchClass =
  "px-switch press flex h-6 w-11 shrink-0 items-center px-0.5 disabled:cursor-not-allowed disabled:opacity-60";

export function ConnectedBanks({
  banks,
  budgtsAccounts,
}: {
  banks: ConnectedBank[];
  budgtsAccounts: { id: string; name: string }[];
}) {
  return (
    <ul className="space-y-6">
      {banks.map((bank) => (
        <BankCard key={bank.id} bank={bank} budgtsAccounts={budgtsAccounts} />
      ))}
    </ul>
  );
}

function BankCard({
  bank,
  budgtsAccounts,
}: {
  bank: ConnectedBank;
  budgtsAccounts: { id: string; name: string }[];
}) {
  const hydrated = useHydrated();
  const [syncing, startSync] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [choosing, setChoosing] = useState(false);

  const needsAttention = NEEDS_ATTENTION.includes(bank.status);
  const hasUnmapped = bank.unmappedAccounts.length > 0;
  const { name, sandbox } = bankName(bank.institutionName);
  const importing = bank.accounts.filter((a) => a.linkState === "mapped");
  const notImporting = bank.accounts.filter((a) => a.linkState !== "mapped");

  const runSync = () =>
    startSync(async () => {
      setSyncMsg(null);
      const res = await syncConnection(bank.itemId);
      if (res.error) setSyncMsg(res.error);
      else if (res.warning) setSyncMsg(res.warning);
      else setSyncMsg("Synced.");
    });

  const tid = `bank-${bank.id}`;
  return (
    <li className="px-card-raised p-2 md:p-6" data-testid={tid}>
      <div className="flex items-start gap-4">
        <span className="px-tile flex h-14 w-14 shrink-0 items-center justify-center text-ink" aria-hidden>
          <Icon name="bank" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate text-base font-medium leading-6 text-ink" data-testid={`${tid}-name`}>{name}</p>
          <div className="flex flex-wrap items-center gap-2">
            {needsAttention ? (
              <Badge tone="wash" icon="warning" testId={`${tid}-status`}>
                Needs attention
              </Badge>
            ) : (
              <Badge tone="growth" icon="check" testId={`${tid}-status`}>
                Connected
              </Badge>
            )}
            {sandbox ? <Badge tone="gray">Sandbox</Badge> : null}
            <span className="flex items-center gap-1 text-sm leading-5 text-muted" data-testid={`${tid}-synced`}>
              <Icon name="sync" size={12} />
              {bank.lastSyncedAt ? `Synced ${whenLabel(bank.lastSyncedAt, hydrated)}` : "Not synced yet"}
            </span>
          </div>
        </div>
      </div>

      {needsAttention ? (
        <div className="px-band mt-5 space-y-3 p-2" data-testid={`${tid}-attention`}>
          <p className="text-[15px] leading-6 text-ink">
            {bank.status === "revoked"
              ? "Access to this bank was revoked. Reconnect to keep it syncing, or disconnect it."
              : "This connection needs you to sign in with your bank again."}
          </p>
          <ReconnectButton itemId={bank.itemId} testId={`${tid}-reconnect`} />
        </div>
      ) : null}

      {importing.length > 0 ? (
        <section className="mt-6 space-y-2">
          <SectionHead as="h3" title="Importing" count={importing.length} />
          <ul className="px-rows">
            {importing.map((a) => (
              <li key={a.rowId} className="space-y-3 py-4 first:pt-2 last:pb-0" data-testid={`account-${a.rowId}`}>
                <div className="flex items-start gap-4">
                  <ImportToggle account={a} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium leading-6 text-ink">{accountName(a)}</p>
                    <p className="truncate text-sm leading-5 text-muted">
                      Imports into {a.mappedAccountName ?? "a Budgts account"}
                    </p>
                  </div>
                </div>
                {a.pendingSignCheckCount > 0 ? <SignCheckNotice account={a} /> : null}
                {a.pendingSignCheckCount === 0 && a.signAnswer ? <SignAnswerLine account={a} /> : null}
                {a.pendingSignCheckCount === 0 && !a.signAnswer && a.directionReview ? (
                  <DirectionReviewLine account={a} />
                ) : null}
                {a.needsReview || a.excludedFromCalculations ? <AccountReviewNotice account={a} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {notImporting.length > 0 ? (
        <section className="mt-8 space-y-3">
          <SectionHead
            as="h3"
            title="Not imported"
            count={notImporting.length}
            aside={<span className="text-sm leading-5 text-muted">Switch on to import</span>}
          />
          <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {notImporting.map((a) => (
              <li key={a.rowId} className="min-w-0 space-y-2" data-testid={`account-${a.rowId}`}>
                <div className="flex items-center gap-4">
                  {a.linkState === "ignored" && a.mappedAccountName ? (
                    <ImportToggle account={a} />
                  ) : (
                    <ConnectToggle account={a} plaidItemId={bank.id} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] leading-6 text-ink">{accountName(a)}</span>
                    {a.linkState === "unmapped" ? (
                      <span className="block text-sm leading-5 text-muted">not set up</span>
                    ) : a.mappedAccountName ? (
                      <span className="block truncate text-sm leading-5 text-muted">
                        paused · was {a.mappedAccountName}
                      </span>
                    ) : null}
                  </span>
                </div>
                {notImportedHint(a) ? (
                  <p className="text-sm leading-5 text-muted md:ml-[60px]">{notImportedHint(a)}</p>
                ) : null}
                {a.pendingSignCheckCount > 0 ? <SignCheckNotice account={a} /> : null}
                {a.pendingSignCheckCount === 0 && a.signAnswer ? <SignAnswerLine account={a} /> : null}
                {a.pendingSignCheckCount === 0 && !a.signAnswer && a.directionReview ? (
                  <DirectionReviewLine account={a} />
                ) : null}
                {a.needsReview || a.excludedFromCalculations ? <AccountReviewNotice account={a} /> : null}
              </li>
            ))}
          </ul>
          {hasUnmapped ? (
            <Button variant="secondary" icon="list" onClick={() => setChoosing(true)} data-testid={`${tid}-choose`}>
              Choose accounts to import
            </Button>
          ) : null}
        </section>
      ) : null}

      <div className="px-rule mt-6" aria-hidden />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon="sync" onClick={runSync} disabled={syncing} data-testid={`${tid}-sync`}>
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
        <Button variant="danger" icon="disconnect" onClick={() => setConfirming(true)} data-testid={`${tid}-disconnect`}>
          Disconnect
        </Button>
        {syncMsg ? (
          <span className="text-sm leading-5 text-muted" role="status" data-testid={`${tid}-sync-message`}>
            {syncMsg}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-5 text-muted">
        Disconnecting a bank keeps every transaction it already imported. They stay in Budgts as history.
      </p>

      {confirming ? (
        <Overlay title={`Disconnect ${name}?`} onClose={() => setConfirming(false)}>
          <DisconnectConfirm itemId={bank.itemId} bankName={name} onClose={() => setConfirming(false)} />
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
            }}
          />
        </Overlay>
      ) : null}
    </li>
  );
}

/**
 * Import on/off switch for one already-mapped Plaid account (design
 * 2026-09-15). Non-destructive: turning off never touches `account_id`, so
 * turning back on resumes the same Budgts account with no re-mapping step —
 * the whole point of making this reversible instead of a one-way "stop
 * importing" action.
 */
function ImportToggle({ account }: { account: ConnectedBankAccount }) {
  const [state, formAction, pending] = useActionState<PlaidActionState, FormData>(
    setAccountImportingAction,
    {},
  );
  const importing = account.linkState === "mapped";

  return (
    <form action={formAction} className="inline-flex shrink-0 flex-col gap-1">
      <input type="hidden" name="plaidAccountRowId" value={account.rowId} />
      <input type="hidden" name="importing" value={importing ? "0" : "1"} />
      <button
        type="submit"
        role="switch"
        aria-checked={importing}
        aria-label={`Importing ${account.name ?? "Account"}`}
        data-testid={`import-${account.rowId}`}
        disabled={pending}
        title={
          importing
            ? "Importing. Tap to pause. New transactions from a paused account aren't recovered later."
            : "Paused. Tap to resume importing new transactions from now on."
        }
        className={switchClass}
      >
        <SwitchKnob on={importing} />
      </button>
      {state.error ? <span className="text-sm text-neg">{state.error}</span> : null}
    </form>
  );
}

/**
 * Connect switch for one Plaid account that was never mapped to a Budgts
 * account — "not set up" (linkState "unmapped") or previously declined via
 * "Don't import this one" (linkState "ignored", no mappedAccountName).
 * Always renders OFF (by construction: BankCard only mounts this component
 * for a non-mapped account — see the row it's rendered from below) and one
 * tap turns it on. Reuses the same `mapAccounts` action the bulk "Choose
 * accounts to import" screen uses, in "new" mode with a guessed name/type
 * (accountLabel/suggestAccount, the same defaults that screen pre-fills; a tap
 * is the user's choice to import, so an account that screen would leave out
 * still connects, with the type it would start from), so
 * this is a shortcut through that flow, not a second code path.
 *
 * Once connected, `linkState` becomes "mapped" and — after the
 * `mapAccounts` action's revalidation re-renders the row — this same switch position
 * renders as the ordinary ImportToggle instead, which is what actually
 * offers the reversible on/off from then on (pause/resume, never a second
 * "ignore" mapping call from here).
 */
function ConnectToggle({ account, plaidItemId }: { account: ConnectedBankAccount; plaidItemId: string }) {
  const [state, formAction, pending] = useActionState<PlaidActionState, FormData>(mapAccounts, {});

  const entries = [
    {
      plaidAccountId: account.plaidAccountId,
      mode: "new",
      name: accountLabel(account),
      type: suggestAccount(account).type,
    },
  ];

  return (
    <form action={formAction} className="inline-flex shrink-0 flex-col gap-1">
      <input type="hidden" name="plaidItemId" value={plaidItemId} />
      <input type="hidden" name="entries" value={JSON.stringify(entries)} />
      <button
        type="submit"
        role="switch"
        aria-checked={false}
        aria-label={`Connect ${account.name ?? "Account"}`}
        data-testid={`connect-${account.rowId}`}
        disabled={pending}
        title="Not connected. Tap to start importing this account into a new Budgts account."
        className={switchClass}
      >
        <SwitchKnob on={false} />
      </button>
      {state.error || state.fieldError ? (
        <span className="text-sm text-neg">{state.error ?? state.fieldError}</span>
      ) : null}
    </form>
  );
}

/**
 * Design: 2026-09-12 North Star §2. `sign_convention` is never exposed to the
 * user by name (internal-only concept) — this is the ONLY thing shown while
 * an account's convention is still unresolved, so held transactions never
 * just silently disappear from every total with no explanation.
 */
function SignCheckNotice({ account }: { account: ConnectedBankAccount }) {
  const count = account.pendingSignCheckCount;
  const sample = account.signCheckSample;
  return (
    <div className="px-band space-y-2 px-1.5 py-1.5 text-sm leading-5 text-ink md:ml-[60px] md:px-2 md:py-2 md:text-[15px] md:leading-6">
      <p className="flex items-start gap-2">
        <Icon name="pending" className="text-graphite" />
        <span>
          We&apos;re checking this account&apos;s transaction format.{" "}
          <span className="font-semibold">
            {count} {count === 1 ? "transaction" : "transactions"}
          </span>{" "}
          {count === 1 ? "appears" : "appear"} once it&apos;s verified.
        </span>
      </p>
      {sample ? (
        // The exit for an account whose format never settles (design: 2026-10-01 card payments §5): one plain
        // question about a held transaction resolves the account and releases every held row.
        <MoneyDirectionQuestion
          account={account}
          sample={sample}
          action={answerSignCheckAction}
          lead="You can verify it now. Was this money going out or coming in?"
        />
      ) : null}
    </div>
  );
}

/** The one plain question, about one transaction; the answer goes to `action` with the account and transaction. */
function MoneyDirectionQuestion({
  account,
  sample,
  action,
  lead,
  onDone,
}: {
  account: ConnectedBankAccount;
  sample: NonNullable<ConnectedBankAccount["signCheckSample"]>;
  action: (prev: PlaidActionState, formData: FormData) => Promise<PlaidActionState>;
  lead: string;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<PlaidActionState, FormData>(action, {});
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok, onDone]);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="plaidAccountRowId" value={account.rowId} />
      <input type="hidden" name="transactionId" value={sample.transactionId} />
      <p className="text-graphite">{lead}</p>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="min-w-0 truncate font-medium">{sample.description}</span>
        <span className="tabular-nums">
          {formatMoney(sample.amount, sample.currency)} ·{" "}
          {new Date(sample.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
        </span>
      </p>
      {state.error ? <p className="text-neg">{state.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="answer" value="out" variant="secondary" disabled={pending}>
          Going out
        </Button>
        <Button type="submit" name="answer" value="in" variant="secondary" disabled={pending}>
          Coming in
        </Button>
      </div>
    </form>
  );
}

/**
 * The quiet exit after answering (design: 2026-10-01 card payments §5a): a wrong answer must not leave the account
 * resolved the wrong way for good. "Change answer" asks the same question again; a different answer flips the
 * account's transaction format and corrects the rows that answer set.
 */
function SignAnswerLine({ account }: { account: ConnectedBankAccount }) {
  const [asking, setAsking] = useState(false);
  const sample = account.signAnswer?.sample ?? null;
  const close = useCallback(() => setAsking(false), []);
  if (!sample) return null;
  return (
    <div className="space-y-2 text-sm leading-5 text-muted md:ml-[60px]">
      <p>
        Money direction set.{" "}
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
            account={account}
            sample={sample}
            action={changeSignAnswerAction}
            lead="Was this money going out or coming in?"
            onDone={close}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The exit for an account the sync resolved from evidence (design: 2026-10-01 card payments §5b): if its amounts look
 * reversed, the user confirms by answering the same plain question about its latest transaction. An answer that
 * disagrees with the account flips it, exactly like "Change answer"; one that agrees changes nothing.
 */
function DirectionReviewLine({ account }: { account: ConnectedBankAccount }) {
  const [asking, setAsking] = useState(false);
  const close = useCallback(() => setAsking(false), []);
  const sample = account.directionReview?.sample;
  if (!sample) return null;
  return (
    <div className="space-y-2 text-sm leading-5 text-muted md:ml-[60px]">
      <p>
        <button
          type="button"
          className="font-medium text-ink underline underline-offset-2"
          aria-expanded={asking}
          onClick={() => setAsking((v) => !v)}
        >
          Amounts on this account look reversed?
        </button>
      </p>
      {asking ? (
        <div className="px-band space-y-2 px-1.5 py-1.5 text-ink md:px-2 md:py-2 md:text-[15px] md:leading-6">
          <p>
            Check one transaction to confirm. If your answer doesn&apos;t match how Budgts reads this account, every
            amount on it flips. You can change it back the same way.
          </p>
          <MoneyDirectionQuestion
            account={account}
            sample={sample}
            action={changeSignAnswerAction}
            lead="Was this money going out or coming in?"
            onDone={close}
          />
        </div>
      ) : null}
    </div>
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
  const [reviewState, reviewAction, reviewPending] = useActionState<PlaidActionState, FormData>(
    clearAccountReview,
    {},
  );
  const [exclusionState, exclusionAction, exclusionPending] = useActionState<PlaidActionState, FormData>(
    setAccountCalculationExclusionAction,
    {},
  );

  if (account.excludedFromCalculations) {
    return (
      <div className="px-badge-wash space-y-2 p-2 text-sm leading-5 text-ink md:ml-[60px]" data-testid={`excluded-${account.rowId}`}>
        <p>
          <span className="font-semibold text-signal-ink">Excluded from totals.</span> This account&apos;s bank feed
          showed unreliable data, so its transactions no longer count toward Money Left, budgets, or spending.
          Nothing was deleted. Every transaction is still here in your history.
        </p>
        {exclusionState.error ? <p className="text-neg">{exclusionState.error}</p> : null}
        <form action={exclusionAction}>
          <input type="hidden" name="plaidAccountRowId" value={account.rowId} />
          <input type="hidden" name="excluded" value="0" />
          <Button type="submit" variant="secondary" disabled={exclusionPending} data-testid={`include-${account.rowId}`}>
            {exclusionPending ? "Saving…" : "Include again"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="px-warn space-y-2 p-2 text-sm leading-5 text-ink md:ml-[60px]" data-testid={`review-${account.rowId}`}>
      <p className="flex items-start gap-2">
        <Icon name="warning" className="-my-0.5 text-warn" />
        <span>{account.reviewReason}</span>
      </p>
      {reviewState.error ? <p className="text-neg">{reviewState.error}</p> : null}
      {exclusionState.error ? <p className="text-neg">{exclusionState.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <form action={reviewAction}>
          <input type="hidden" name="plaidAccountRowId" value={account.rowId} />
          <Button type="submit" variant="secondary" disabled={reviewPending} data-testid={`mark-reviewed-${account.rowId}`}>
            {reviewPending ? "Saving…" : "Mark reviewed"}
          </Button>
        </form>
        {account.needsReview ? (
          <form action={exclusionAction}>
            <input type="hidden" name="plaidAccountRowId" value={account.rowId} />
            <input type="hidden" name="excluded" value="1" />
            <Button type="submit" variant="danger" disabled={exclusionPending} data-testid={`exclude-${account.rowId}`}>
              {exclusionPending ? "Saving…" : "Exclude from totals"}
            </Button>
          </form>
        ) : null}
      </div>
      <p className="text-graphite">
        Excluding keeps every transaction visible in your history. It only stops this account from affecting Money
        Left, budgets, and spending totals.
      </p>
    </div>
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
  const [state, formAction, pending] = useActionState<PlaidActionState, FormData>(disconnectBank, {});
  const [purge, setPurge] = useState(false);

  useEffect(() => {
    if (state.ok) {
      onClose();
    }
  }, [state.ok, onClose]);

  return (
    <form action={formAction} className="space-y-4" data-testid="disconnect-confirm">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="purge" value={purge ? "1" : "0"} />

      <p className="text-[15px] leading-6 text-muted">
        Budgts stops syncing {bankName}. The transactions it already imported stay in your history and keep
        counting toward budgets.
      </p>

      <label className="px-badge-wash flex items-start gap-2 p-2 text-[15px] leading-6 text-ink" data-testid="disconnect-purge-box">
        <input
          type="checkbox"
          data-testid="disconnect-purge"
          checked={purge}
          onChange={(e) => setPurge(e.target.checked)}
          className="mt-1 h-4 w-4 accent-[var(--signal-ink)]"
        />
        <span>Also delete the {bankName} transactions Budgts imported. This can&apos;t be undone.</span>
      </label>

      {state.error ? <p className="text-sm text-neg" data-testid="disconnect-error">{state.error}</p> : null}

      <div className="flex gap-3 pt-1">
        <Button type="submit" variant="danger" disabled={pending} className="flex-1" data-testid="disconnect-submit">
          {pending ? "Disconnecting…" : purge ? "Disconnect and delete" : "Disconnect"}
        </Button>
        <Button variant="secondary" onClick={onClose} data-testid="disconnect-cancel">
          Cancel
        </Button>
      </div>
    </form>
  );
}
