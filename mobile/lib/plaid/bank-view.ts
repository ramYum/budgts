import type { BankAccount, ConnectedBank } from "./banks-api";

/**
 * How Connected banks words a bank and its accounts: the web's own helpers in
 * `src/components/plaid/connected-banks.tsx` (`bankName`, `whenLabel`,
 * `accountName`, the importing / not imported split), as pure functions.
 * Presentation only: every state they read comes from `/api/mobile/plaid/banks`.
 */

/** "First Platypus Bank (Sandbox)" → the bank's name and a Sandbox flag (the web shows a gray "Sandbox" badge). */
export function bankName(raw: string | null): { name: string; sandbox: boolean } {
  const name = raw ?? "Bank";
  const m = name.match(/^(.*?)\s*\(Sandbox\)$/i);
  return m ? { name: m[1]!, sandbox: true } : { name, sandbox: false };
}

/** "Synced …" wording after the web hydrates: just now, N min ago, N hr ago, then the month and day. */
export function whenLabel(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const syncedLabel = (bank: Pick<ConnectedBank, "lastSyncedAt">, now: number): string =>
  bank.lastSyncedAt ? `Synced ${whenLabel(bank.lastSyncedAt, now)}` : "Not synced yet";

/** "Plaid Checking ••0000" (the web's `accountName`: the Plaid name, never the official name). */
export const accountName = (a: Pick<BankAccount, "name" | "mask">): string => `${a.name ?? "Account"}${a.mask ? ` ••${a.mask}` : ""}`;

/** The bank card's two lists: accounts importing now, and the rest (paused, skipped or not set up). */
export function splitAccounts(accounts: BankAccount[]): { importing: BankAccount[]; notImporting: BankAccount[] } {
  return {
    importing: accounts.filter((a) => a.linkState === "mapped"),
    notImporting: accounts.filter((a) => a.linkState !== "mapped"),
  };
}

/**
 * Which switch a not-imported account gets (web `BankCard`): a paused account that still points at its Budgts
 * account resumes it (the import switch); anything never mapped connects into a new account (the connect switch).
 */
export const resumesExisting = (a: Pick<BankAccount, "linkState" | "mappedAccountName">): boolean =>
  a.linkState === "ignored" && !!a.mappedAccountName;

/** The line under a not-imported account's name. */
export function notImportedNote(a: Pick<BankAccount, "linkState" | "mappedAccountName">): string | null {
  if (a.linkState === "unmapped") return "not set up";
  return a.mappedAccountName ? `paused · was ${a.mappedAccountName}` : null;
}

/** The sign-check line's counted words (web `SignCheckNotice`). */
export const signCheckWords = (count: number): { count: string; verb: string } => ({
  count: `${count} ${count === 1 ? "transaction" : "transactions"}`,
  verb: count === 1 ? "appears" : "appear",
});
