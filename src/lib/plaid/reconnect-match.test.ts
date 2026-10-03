import { describe, expect, it } from "vitest";
import { matchPreviousAccounts, type BankIdentity, type MatchableAccount } from "./reconnect-match";

const ME = "user-me";
const OTHER = "user-other";
const INST = "ins_chase";

const acct = (id: string, name: string, over: Partial<MatchableAccount> = {}): MatchableAccount => ({
  id,
  userId: ME,
  name,
  isArchived: false,
  ...over,
});
const ident = (accountId: string, over: Partial<BankIdentity> = {}): BankIdentity => ({
  userId: ME,
  accountId,
  institutionId: INST,
  mask: "1234",
  type: "depository",
  subtype: "checking",
  ...over,
});
const checking1234 = { plaidAccountId: "pa-new-1", mask: "1234", type: "depository", subtype: "checking" };

const run = (over: Partial<Parameters<typeof matchPreviousAccounts>[0]>) =>
  matchPreviousAccounts({
    userId: ME,
    institutionId: INST,
    newAccounts: [checking1234],
    identities: [],
    accounts: [],
    liveLinkedAccountIds: new Set(),
    ...over,
  });

describe("matchPreviousAccounts", () => {
  it("suggests the one Budgts account the same bank account fed before", () => {
    expect(run({ identities: [ident("a1")], accounts: [acct("a1", "Chase checking")] })).toEqual({
      "pa-new-1": { kind: "previous", accountId: "a1", accountName: "Chase checking" },
    });
  });

  it("compares type and subtype without case or surrounding spaces, and a missing subtype equals ''", () => {
    const out = run({
      newAccounts: [{ plaidAccountId: "pa-new-1", mask: " 1234 ", type: "Depository ", subtype: null }],
      identities: [ident("a1", { subtype: "" })],
      accounts: [acct("a1", "Chase")],
    });
    expect(out["pa-new-1"]).toEqual({ kind: "previous", accountId: "a1", accountName: "Chase" });
  });

  it("suggests nothing when institution, last 4, type or subtype differ", () => {
    const accounts = [acct("a1", "Chase")];
    expect(run({ identities: [ident("a1", { institutionId: "ins_other" })], accounts })).toEqual({});
    expect(run({ identities: [ident("a1", { mask: "9999" })], accounts })).toEqual({});
    expect(run({ identities: [ident("a1", { type: "credit" })], accounts })).toEqual({});
    expect(run({ identities: [ident("a1", { subtype: "savings" })], accounts })).toEqual({});
  });

  it("suggests nothing when the new account has no last 4 or the connection no institution", () => {
    const base = { identities: [ident("a1")], accounts: [acct("a1", "Chase")] };
    expect(run({ ...base, newAccounts: [{ ...checking1234, mask: null }] })).toEqual({});
    expect(run({ ...base, newAccounts: [{ ...checking1234, mask: "  " }] })).toEqual({});
    expect(run({ ...base, institutionId: null })).toEqual({});
  });

  it("lists every candidate, by name, and picks none when the match is ambiguous", () => {
    const out = run({
      identities: [ident("a2"), ident("a1")],
      accounts: [acct("a2", "Zeta"), acct("a1", "Alpha")],
    });
    expect(out).toEqual({ "pa-new-1": { kind: "ambiguous", accountIds: ["a1", "a2"] } });
  });

  it("never suggests an account another bank account still feeds (a live link, paused included)", () => {
    expect(run({ identities: [ident("a1")], accounts: [acct("a1", "Chase")], liveLinkedAccountIds: new Set(["a1"]) })).toEqual({});
    // With one of two candidates live, the other is the only match.
    expect(
      run({
        identities: [ident("a1"), ident("a2")],
        accounts: [acct("a1", "Chase"), acct("a2", "Chase old")],
        liveLinkedAccountIds: new Set(["a1"]),
      }),
    ).toEqual({ "pa-new-1": { kind: "previous", accountId: "a2", accountName: "Chase old" } });
  });

  it("never suggests an archived account (mapping refuses one as a target)", () => {
    expect(run({ identities: [ident("a1")], accounts: [acct("a1", "Chase", { isArchived: true })] })).toEqual({});
  });

  it("never suggests another user's account, even with an identical identity", () => {
    expect(
      run({
        identities: [ident("theirs", { userId: OTHER })],
        accounts: [acct("theirs", "Their Chase", { userId: OTHER })],
      }),
    ).toEqual({});
    // An identity row of mine pointing at an account that is not mine is ignored too.
    expect(run({ identities: [ident("theirs")], accounts: [acct("theirs", "Their Chase", { userId: OTHER })] })).toEqual({});
  });

  it("an account with several identities counts once, and two new accounts can both point at one merged account", () => {
    const out = run({
      newAccounts: [checking1234, { plaidAccountId: "pa-new-2", mask: "5678", type: "depository", subtype: "checking" }],
      identities: [ident("a1"), ident("a1", { mask: "5678" })],
      accounts: [acct("a1", "Joint")],
    });
    expect(out).toEqual({
      "pa-new-1": { kind: "previous", accountId: "a1", accountName: "Joint" },
      "pa-new-2": { kind: "previous", accountId: "a1", accountName: "Joint" },
    });
  });
});
