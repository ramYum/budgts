/**
 * Which Budgts account a newly linked Plaid account fed before (owner decision 2026-10-02). Reconnect adoption
 * (`reconnect-adoption.ts`) re-attaches a reconnected bank's re-sent history only when the new Plaid account is mapped
 * onto the SAME Budgts account the kept history lives in; any other choice imports the overlap (up to 60 days) twice.
 * So the mapping step suggests that account, and this is the rule for it (pure, deterministic):
 *
 * - The signal is `account_bank_identities` (migration 0027): the institution, last 4, type and subtype of every Plaid
 *   account ever mapped onto a Budgts account. It survives the disconnect that deletes `plaid_accounts`.
 * - A candidate is one of the caller's own accounts with an identity equal to the new account's, on the same
 *   institution. Type and subtype compare trimmed and lower-cased, a missing one as ''. No last 4 or no institution:
 *   nothing can be recognised, so nothing is suggested.
 * - Excluded: an archived account (mapping refuses it as a target, `readOwnOpenAccount`, and the user retired it), and
 *   an account any Plaid account still links to (a live link, paused included): its history is not detached, so it is
 *   not what a reconnect left behind, and adoption could not re-attach anything there.
 * - Exactly one candidate: `previous`, which the mapping step preselects. Several: `ambiguous`, listed first (by
 *   name) and none preselected. None: no entry.
 *
 * `userId` is checked on every identity and account, on top of RLS, so another user's rows can never be suggested.
 */
import type { MappingSuggestion } from "@/lib/accounts/account-suggestion";

export type BankIdentity = {
  userId: string;
  accountId: string;
  institutionId: string;
  mask: string;
  type: string;
  subtype: string;
};

export type MatchableAccount = { id: string; userId: string; name: string; isArchived: boolean };

export type NewPlaidAccount = { plaidAccountId: string; mask: string | null; type: string | null; subtype: string | null };

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

export function matchPreviousAccounts(input: {
  userId: string;
  institutionId: string | null;
  newAccounts: NewPlaidAccount[];
  identities: BankIdentity[];
  accounts: MatchableAccount[];
  liveLinkedAccountIds: ReadonlySet<string>;
}): Record<string, MappingSuggestion> {
  const { userId, institutionId, newAccounts, identities, accounts, liveLinkedAccountIds } = input;
  const out: Record<string, MappingSuggestion> = {};
  if (!institutionId) return out;

  const eligible = new Map(
    accounts
      .filter((a) => a.userId === userId && !a.isArchived && !liveLinkedAccountIds.has(a.id))
      .map((a) => [a.id, a] as const),
  );

  for (const pa of newAccounts) {
    const mask = (pa.mask ?? "").trim();
    if (!mask) continue;
    const ids = new Set(
      identities
        .filter(
          (i) =>
            i.userId === userId &&
            i.institutionId === institutionId &&
            i.mask.trim() === mask &&
            norm(i.type) === norm(pa.type) &&
            norm(i.subtype) === norm(pa.subtype) &&
            eligible.has(i.accountId),
        )
        .map((i) => i.accountId),
    );
    const candidates = [...ids]
      .map((id) => eligible.get(id)!)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (candidates.length === 1) {
      out[pa.plaidAccountId] = { kind: "previous", accountId: candidates[0].id, accountName: candidates[0].name };
    } else if (candidates.length > 1) {
      out[pa.plaidAccountId] = { kind: "ambiguous", accountIds: candidates.map((c) => c.id) };
    }
  }
  return out;
}
