# Card payments: never spending, from either side (2026-10-01)

Owner-approved 2026-10-01 ("approve the card payment fixes"). Amends the Event Role design
(`2026-09-12-event-role-design.md` §3, §5, §7), the North Star sign-convention design
(`2026-09-12-north-star-architecture-design.md` §2) and paired-transfer detection (Tier B window). The money rules
themselves are unchanged: a `CARD_PAYMENT` has budget effect `NONE` (budget-effect design §3), and the purchases count
when they are charged to the card.

## 1. What was wrong

The resolver mapped only `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` to `CARD_PAYMENT`. Event Role §7 assumed the card's own
leg of a payment "reliably carries" that label. It doesn't. Production and Plaid Sandbox both send the card-side leg as
`LOAN_PAYMENTS_OTHER_PAYMENT`. A row with no role falls back to the legacy `!isTransfer` rule
(`qualify.ts`), so it counted. A payment *into* a card (direction `credit`) became negative spend, and an
uncategorized payment *out of* checking became new spend. Three more gaps made this worse:

- Rows that landed before Event Role existed have no role and were never backfilled, so even
  `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` rows counted.
- The sign-convention detector expected every `LOAN_PAYMENTS` row to be an outflow. On a card a payment is an inflow,
  so every payment voted "inverted". A card with about one purchase per payment never settled, and its rows stayed held.
- An account whose convention never settles had no exit. Its rows stayed held with nothing the user could do.

## 2. Card-side payments (resolver row 1b)

On a credit-type account (Plaid `type` "credit"), a row with primary `LOAN_PAYMENTS` and direction `credit` is a
`CARD_PAYMENT`, whatever the detailed subtype. The direction is the sign-corrected one, so the rule honours each
account's convention: an inverted card's payment resolves the same way. Account type now reaches the resolver
(`AccountMapEntry.accountType`, `finalizeSignConvention`), superseding Event Role §5's "no account-type threading".

Deliberately not covered (stay unresolved, visible in "Needs a category", never guessed):

- a **debit** `LOAN_PAYMENTS` row other than `..._CREDIT_CARD_PAYMENT` on a card: that's a loan paid *by* card. The
  Sandbox "AUTOMATIC PAYMENT - THANK" row, sent as a positive charge, is this shape. A real feed doesn't send a payment
  that way.
- a credit on a card with no Plaid category: it may be a refund.

## 3. Pairing (Tier B window 1 -> 3 days)

A checking-side payment with no role pairs with its card leg up to 3 days apart (previously only the same or the
next day; Tier A was already 3). A card payment posts on the card one to three days after it leaves checking. Exact
amount, different accounts and opposite effective direction still gate every match, and an ambiguous match still
writes nothing.

**At deploy this changes stored rows.** The sync's candidate read covers every unpaired confirmed bank row, so the
first sync after deploy pairs historical rows up to 3 days apart, and a Tier B pair writes `is_transfer` and
`TRANSFER` on its unresolved leg. The remediation tool's preview C lists every pair the wider window adds, with
before/after totals; deploy only after the owner approves it.

## 4. Sign-convention evidence on cards

On a credit-type account, `LOAN_PAYMENTS` is expected to flow **in**, and `INCOME` does not vote (gig-economy charges
such as rides arrive labelled `INCOME` on cards). Depository accounts keep the original rules.

## 4a. When the sync may resolve an account by itself

The sync judges every still-`unknown` account it brings new rows to. **At deploy that runs the new detector on
existing held rows, and a verdict releases them automatically.** A verdict is acted on only when the feed looks
reliable (`autoResolveBlock`, sync-engine.ts). It is held back, leaving the rows for the user's answer, when:

- the bank needs attention (`plaid_items.status` not `active`, e.g. `login_required`);
- the account is flagged for review;
- it has replayed copies: as many byte-identical live rows as the anomaly threshold (10), the Advancial signature;
- the verdict contradicts rows already confirmed on the account (rows from before conventions existed).

The tool's preview B simulates exactly this for every `unknown` account, and lists Advancial accounts explicitly.

## 5. The exit: one plain question

While an account has held rows, Connected banks shows its most recent held transaction and asks "Was this money going
out or coming in?" (buttons "Going out" / "Coming in"; no internal terms, no em-dashes). The answer, compared with
the immutable raw Plaid sign, sets the convention (`conventionFromAnswer`). Every held row is then released by the
same `finalizeSignConvention` the sync uses. Rules:

- The server derives the user from the session and checks that the account and the sample row belong to them, that
  the row is one of that account's held rows, and that the account is still unknown (`sign-answer.ts`).
- `finalizeSignConvention` resolves only a still-`unknown` account, under the row lock its UPDATE takes. A sync
  verdict and an answer can race: the first wins and the second writes nothing.
- It clears only the "can't confidently determine" review flag, never a flag raised for another reason.
- It holds the bank's sync lease while it writes (`claimItemForSync`), so no sync lands rows under the old
  convention meanwhile. If the lease can't be taken nothing is written, and the reason comes from `claimMissReason`:
  "This bank is syncing right now. Try again in a moment." while a sync runs, or "Finish choosing which accounts to
  import from this bank first." while an account awaits its import choice.
- Every answer is recorded in `plaid_sign_answers` (migration 0025) with the released rows' old values.

## 5a. Changing the answer

A wrong answer must not leave an account resolved the wrong way for good (every state has a reachable exit). After
answering, Connected banks shows under that account a quiet line, "Money direction set. Change answer" (the link
style used elsewhere). "Change answer" asks the same question about the same transaction (the account's most recent
one if that is gone). A different answer:

- flips the account's convention, and re-evaluates every row whose stored direction is exactly what the old convention
  derives from the raw sign (`planConventionChange`): corrected direction, event role recomputed. A row whose direction
  disagrees was set another way (the user's own edit, or a row from before conventions existed) and is left alone;
- unlinks a transfer pair whose leg it re-evaluates (the pair was matched on the old direction; the next sync re-pairs
  it if it still matches). The partner keeps its own direction. A leg that was a transfer only because pairing
  classified it (`is_transfer` and `TRANSFER`, while Plaid's category is not `TRANSFER_IN`/`TRANSFER_OUT` and the
  user never set it) goes back to its own signal: `is_transfer` false, role re-resolved (`undoTierBClassification`);
- records the change in `plaid_sign_answers` with every changed row's old values (and each unlinked partner's old
  link). Changing the answer back is the undo, recorded the same way.

Rules (`changeSignConventionAnswer`, `sign-answer.ts`): the user comes from the session; the account and transaction
must be theirs and the account must be resolved (an account still being checked takes the first answer instead). An
answer matching the account changes nothing (idempotent). It holds the bank's sync lease, and the
convention flips only from the value it read, under the row lock of a conditional UPDATE: of two racing changes, the
first wins and the second writes nothing.

Known limit: a row's direction is compared with what the old convention derives from its raw sign. A row the user
edited to exactly that value can't be told apart from an unedited one, so it is re-evaluated too. A user's edit to
any other value is always kept.

## 5b. An account resolved from evidence

The sync can resolve an account wrongly too. Under an imported account it resolved from evidence (no answer),
Connected banks offers a quiet link, "Amounts on this account look reversed?". Behind it, as the confirmation: "Check
one transaction to confirm. If your answer doesn't match how Budgts reads this account, every amount on it flips. You
can change it back the same way." and the same question about the account's most recent transaction. It runs the
same `changeSignConventionAnswer`: `kind = 'change'`, `from` = the evidence verdict, the same audit, and changing back
is the undo. The internal term is never shown. Web only for now.

## 5c. Held rows a removed bank left behind (owner-approved bug fix, 2026-10-05)

**What was wrong.** Disconnecting a bank deletes its `plaid_items` row (`src/server/plaid/disconnect.ts`), which
cascades its `plaid_accounts`; `transactions.plaid_account_id` is `ON DELETE SET NULL` (migration `0004`), so every row
is kept, detached (design §24). A row still held for `sign_convention_unknown` stayed held, but §5's question and
`finalizeSignConvention` are keyed on the Plaid account, which no longer exists: no screen listed it and nothing could
release it. Found in production: three of the owner's SoFi Checking ••5805 rows (Sep 14–15) held since the SoFi link
was replaced on 2026-09-15; the new link's ••5805 account was never imported, so reconnect adoption never reached them.

**The exit.** Connected banks gets a "From removed banks" card (anchor `#from-removed-banks`, shown only when there is
something to ask) that asks §5's question under the Budgts account the rows live in. A group is one Budgts account
**and** one original bank feed: Plaid's `account_id` in the immutable raw payload. Two feeds mapped into one Budgts
account are never pooled, for the same reason conventions are keyed on the Plaid account (each bank may report signs
its own way). The answer, compared with the asked-about row's raw sign (`conventionFromAnswer`), gives that feed's
convention, and every held row of the group, removed copies included, is released by `planHeldRowRelease`, exactly as
§5 does. "Change answer" (§5a) re-evaluates **only the rows the answer released** (never the account's other
history, such as rows confirmed before conventions existed), through the same `reevaluateUnderConvention` as §5a;
changing back is the undo. Rules (`src/server/plaid/detached-sign-answer.ts`): the user comes from the session; the
row must be theirs, a live detached bank row (held, for a first answer); the group is derived from that row, never from
the client. Writes for one group serialize on a transaction-scoped advisory lock and read rows `FOR UPDATE`, so a
reconnect adopting one of them (it claims only a still-detached row) and an answer cannot both write it. Every answer
and change is recorded in `detached_sign_answers` (migration `0028`, owner read only, cascades with the account or the
user) with the changed rows' old values; `plaid_sign_answers` cannot hold them (its Plaid account is gone). The event
role resolver gets the Budgts account type, whose only use there is recognising a card (`credit`, spelled the same).

**Not chosen: inferring the answer.** Releasing the rows from a resolved Plaid account now mapped into the same Budgts
account would guess: nothing proves that account is the same bank feed (one Budgts account may take several banks).
The question is the only source of a direction here.

**Prevention.** New orphans now land in the "From removed banks" card the moment the bank is disconnected, so none is
left without an exit. Separately, reconnect adoption (`applyPlan`'s rekey) could attach a held kept row to an account
that is already resolved, where no question is asked; it now takes the new account's reading for such a row (same raw
date and amount from the same bank account, so the raw sign means the same thing), and leaves every other row as
before.

**Visibility.** Activity hides rows from a disconnected bank (§24). Released detached rows count, like the rest of that
bank's kept history. `GET /api/mobile/plaid/banks` carries `removedBanksHeld: { groups, answered }` (version 1,
additive): `groups[]` = `{ accountId, accountName, originRef, count, sample }`, `answered[]` = `{ accountId,
accountName, originRef, answeredAt, sample }`. Native POST routes will take `{ transactionId, answer }`.

### Native API contract (`GET /api/mobile/plaid/banks`, version 1)

Each account carries, beside the existing fields (the native UI and POST routes are a later Phase 3 branch):

- `signCheckSample`: `{ transactionId, description, occurredAt, amount, currency } | null`. Present while
  `pendingSignCheckCount > 0`: the transaction to ask about. `amount` is unsigned minor units.
- `signAnswer`: `{ answeredAt, sample: <same shape> | null } | null`. Present when the user resolved the account by
  answering: show "Money direction set. Change answer", and re-ask about `sample`.
- `directionReview`: `{ sample: <same shape> } | null`. Present for an imported account resolved from evidence, with
  no answer: show "Amounts on this account look reversed?" with the confirmation text, and ask about `sample`. The
  answer goes to the same change route.

The native POST routes will take `{ plaidAccountRowId, transactionId, answer: "out" | "in" }` (the web schema,
`answerSignCheckSchema`) and call `resolveSignConventionFromAnswer` / `changeSignConventionAnswer`. Outcomes to map:
`resolved` / `changed` / `unchanged` / `already_resolved` (refresh), `busy` and `setting_up` (the two sentences in §5),
`not_answered` (ask the first question instead), `not_found`.

## 6. Case (c): only checking imported

Unchanged and confirmed (North Star §7): the checking-side payment is excluded, with no pairing needed. The card's
purchases are not in Budgts, so they don't count either. Connected banks says so under a card that isn't imported:
"Card purchases aren't tracked unless this card is imported." (`notImportedHint`, shared with native).

## 7. Cases

| Case | Behaviour |
|---|---|
| a. card and checking imported, amounts match | Card leg `CARD_PAYMENT` (row 1 or 1b). Checking leg `CARD_PAYMENT`/`TRANSFER`, or, with no role, paired by Tier B within 3 days. Neither counts. |
| b. both imported, amounts differ | Never paired. Each leg is judged by its own signal. Real feeds don't produce this; Sandbox fixtures do. |
| c. checking only | Checking leg excluded when labelled; card purchases untracked; hint shown. |
| d. card only | Purchases count. The incoming payment is `CARD_PAYMENT` (1b), whatever Plaid's detailed label. |

## 8. Existing rows

New rows resolve on landing. **Stored rows also change at deploy, by the sync itself, at its first run per bank:**

- **B, automatic:** an `unknown` account whose held rows now give a verdict that passes the gate (§4a) is resolved, and
  its held rows are released.
- **C, automatic:** the 3-day window pairs historical rows; a Tier B pair marks its unresolved leg a transfer (§3).

Neither is written by the tool. `tools/card-payment-remediation.ts` (dry run by default) previews both exactly, with
the app's own functions (detector, gate, candidate read, matcher), and lists Advancial accounts. **Deploy only after
the owner approves the B and C previews.** The tool also plans two remediations that are never automatic:

- **A.** Backfill `CARD_PAYMENT` on confirmed rows with no role that resolve to it now. Rows the user categorized are
  listed, never changed. (Production's 2026-10-01 dry run showed A would worsen the Advancial user's figures, because
  that card's purchases were never sign-corrected; A is not to be applied.)
- **Stragglers.** Held rows on an account that already has a convention. The sync never releases these.

It prints spend, income and Money Left per user and month: now, at deploy (B and C), and with --apply on top. `--apply`
writes only A and the stragglers. It needs the exact project ref, writes an audit file with every old value, and
`--revert` restores them; a row changed since the apply is reported, not overwritten. Production runs only after the
owner approves the exact rows and totals.
