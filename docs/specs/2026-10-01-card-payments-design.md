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

## 4. Sign-convention evidence on cards

On a credit-type account, `LOAN_PAYMENTS` is expected to flow **in**, and `INCOME` does not vote (gig-economy charges
such as rides arrive labelled `INCOME` on cards). Depository accounts keep the original rules.

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
  convention meanwhile. While a sync holds it the answer is refused with "This bank is syncing right now. Try again in
  a moment." and nothing is written.
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
  it if it still matches). The partner keeps its own direction and role;
- records the change in `plaid_sign_answers` with every changed row's old values (and each unlinked partner's old
  link). Changing the answer back is the undo, recorded the same way.

Rules (`changeSignConventionAnswer`, `sign-answer.ts`): the user comes from the session; the account and transaction
must be theirs and the account must have been resolved by an answer (an account resolved from evidence has no "Change
answer"). An answer matching the account changes nothing (idempotent). It holds the bank's sync lease, and the
convention flips only from the value it read, under the row lock of a conditional UPDATE: of two racing changes, the
first wins and the second writes nothing.

### Native API contract (`GET /api/mobile/plaid/banks`, version 1)

Each account carries, beside the existing fields (the native UI and POST routes are a later Phase 3 branch):

- `signCheckSample`: `{ transactionId, description, occurredAt, amount, currency } | null`. Present while
  `pendingSignCheckCount > 0`: the transaction to ask about. `amount` is unsigned minor units.
- `signAnswer`: `{ answeredAt, sample: <same shape> | null } | null`. Present when the user resolved the account by
  answering: show "Money direction set. Change answer", and re-ask about `sample`.

The native POST routes will take `{ plaidAccountRowId, transactionId, answer: "out" | "in" }` (the web schema,
`answerSignCheckSchema`) and call `resolveSignConventionFromAnswer` / `changeSignConventionAnswer`.

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

New rows resolve on landing; stored rows are never changed by this code. `tools/card-payment-remediation.ts` (dry run by
default) plans two remediations with the app's own functions:

- **A.** Backfill `CARD_PAYMENT` on confirmed rows with no role that resolve to it now. Rows the user categorized are
  listed, never changed.
- **B.** Release held rows whose account has a convention, or can get one from the current evidence.

It prints before/after spend, income and Money Left per user and month with `rollup`. `--apply` needs the exact
project ref, writes an audit file with every old value, and `--revert` restores them. A row changed since the apply is
reported, not overwritten. Production runs only after the owner approves the exact rows and totals.
