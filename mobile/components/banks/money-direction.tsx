import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { invalidate } from "../../lib/api/invalidate";
import type { BankAccount, RemovedAnsweredGroup, RemovedBanksHeld, SignCheckSample } from "../../lib/plaid/banks-api";
import type { CommandOutcome, MoneyAnswer } from "../../lib/plaid/bank-commands";
import { removedHeldWords, sampleFigure, signCheckWords } from "../../lib/plaid/bank-view";
import { Button } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { SectionHead } from "../kit/section-head";

/**
 * The money-direction question and its exits (design: docs/specs/2026-10-01-card payments §5, §5a, §5b, §5c), as the web
 * draws them in src/components/plaid/connected-banks.tsx (`SignCheckNotice`, `MoneyDirectionQuestion`, `SignAnswerLine`,
 * `DirectionReviewLine`) and removed-banks-held.tsx (`RemovedBanksHeld`). The answer is the server's to apply; this only
 * asks and sends it.
 */

/**
 * The web's revalidation after a Plaid action: Connected banks reloads (it follows "accounts"), and so does every
 * screen showing money, since a change here can move totals (an answer releases held rows; import on, a sync, a purge).
 */
export const changedEverything = () => invalidate("accounts", "transactions", "budgets", "home");

type Ask = (answer: MoneyAnswer) => Promise<CommandOutcome>;
/** `BankCommands.answerSign`: `change` is false for the first answer (§5), true for a change or a review (§5a, §5b). */
type AskSign = (plaidAccountRowId: string, transactionId: string, a: MoneyAnswer, change: boolean) => Promise<CommandOutcome>;

/**
 * "Was this money going out or coming in?" about one transaction (web `MoneyDirectionQuestion`). After an answer lands
 * the buttons stay disabled until the screen reloads with the new state (the question goes, or the line changes), so a
 * second tap can't answer twice over stale data; `onDone` closes a "Change answer" panel.
 */
export function MoneyDirectionQuestion({
  sample,
  lead,
  ask,
  onDone,
  testID,
}: {
  sample: SignCheckSample;
  lead: string;
  ask: Ask;
  onDone?: () => void;
  testID: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the sample this question answered; a reload brings a new object (or removes the question)
  const [answered, setAnswered] = useState<SignCheckSample | null>(null);
  const busy = pending || answered === sample;

  async function answer(a: MoneyAnswer) {
    setPending(true);
    setError(null);
    const out = await ask(a);
    setPending(false);
    if (out.status === "error") {
      setError(out.message);
      return;
    }
    setAnswered(sample);
    changedEverything();
    onDone?.();
  }

  return (
    <View testID={testID} style={{ gap: 8 }}>
      <Text variant="small" color={COLOR.graphite}>
        {lead}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: 12 }}>
        <Text testID={`${testID}-description`} variant="formLabel" color={ROLE.ink} numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }}>
          {sample.description}
        </Text>
        <Text testID={`${testID}-figure`} variant="small" color={ROLE.ink} style={{ fontVariant: ["tabular-nums"] }}>
          {sampleFigure(sample)}
        </Text>
      </View>
      {error ? (
        <Text testID={`${testID}-error`} variant="small" color={ROLE.neg} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button testID={`${testID}-out`} variant="secondary" disabled={busy} onPress={() => void answer("out")}>
          Going out
        </Button>
        <Button testID={`${testID}-in`} variant="secondary" disabled={busy} onPress={() => void answer("in")}>
          Coming in
        </Button>
      </View>
    </View>
  );
}

/** The band every notice and open question sits in (web `px-band px-1.5 py-1.5 text-sm leading-5 text-ink`). */
function Band({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <PixelFrame testID={testID} frame="px-band" style={{ paddingHorizontal: 6, paddingVertical: 6, gap: 8 }}>
      {children}
    </PixelFrame>
  );
}

/** An inline text button (web `font-medium text-ink underline underline-offset-2`), opening or closing a panel. */
function InlineToggle({ label, open, onPress, testID }: { label: string; open: boolean; onPress: () => void; testID: string }) {
  return (
    <Text
      testID={testID}
      variant="formLabel"
      color={ROLE.ink}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      suppressHighlighting
      style={{ textDecorationLine: "underline" }}
    >
      {label}
    </Text>
  );
}

/**
 * Held transactions never vanish silently (web `SignCheckNotice`), and the exit for an account whose format never
 * settles: one plain question about a held transaction resolves the account and releases every held row (§5).
 */
export function SignCheckNotice({ account, ask }: { account: BankAccount; ask: AskSign }) {
  const words = signCheckWords(account.pendingSignCheckCount);
  const sample = account.signCheckSample;
  return (
    <Band testID={`sign-check-${account.rowId}`}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Icon name="pending" color={COLOR.graphite} />
        <Text variant="small" color={ROLE.ink} style={{ flex: 1 }}>
          {"We're checking this account's transaction format. "}
          <Text variant="smallStrong" color={ROLE.ink}>
            {words.count}
          </Text>
          {` ${words.verb} once it's verified.`}
        </Text>
      </View>
      {sample ? (
        <MoneyDirectionQuestion
          testID={`sign-question-${account.rowId}`}
          sample={sample}
          lead="You can verify it now. Was this money going out or coming in?"
          ask={(a) => ask(account.rowId, sample.transactionId, a, false)}
        />
      ) : null}
    </Band>
  );
}

/**
 * The quiet exit after answering (web `SignAnswerLine`, §5a): "Change answer" asks the same question again; a different
 * answer flips the account's transaction format and corrects the rows that answer set.
 */
export function SignAnswerLine({ account, ask }: { account: BankAccount; ask: AskSign }) {
  const [asking, setAsking] = useState(false);
  const sample = account.signAnswer?.sample ?? null;
  if (!sample) return null;
  return (
    <View testID={`sign-answered-${account.rowId}`} style={{ gap: 8 }}>
      <Text variant="small" color={ROLE.muted}>
        {"Money direction set. "}
        <InlineToggle testID={`sign-change-${account.rowId}`} label="Change answer" open={asking} onPress={() => setAsking((v) => !v)} />
      </Text>
      {asking ? (
        <Band>
          <MoneyDirectionQuestion
            testID={`sign-question-${account.rowId}`}
            sample={sample}
            lead="Was this money going out or coming in?"
            ask={(a) => ask(account.rowId, sample.transactionId, a, true)}
            onDone={() => setAsking(false)}
          />
        </Band>
      ) : null}
    </View>
  );
}

/**
 * The exit for an account the sync resolved from evidence (web `DirectionReviewLine`, §5b): if its amounts look reversed,
 * the user confirms on its latest transaction. An answer that disagrees flips it, exactly like "Change answer".
 */
export function DirectionReviewLine({ account, ask }: { account: BankAccount; ask: AskSign }) {
  const [asking, setAsking] = useState(false);
  const sample = account.directionReview?.sample;
  if (!sample) return null;
  return (
    <View testID={`direction-review-${account.rowId}`} style={{ gap: 8 }}>
      <Text variant="small" color={ROLE.muted}>
        <InlineToggle
          testID={`direction-review-toggle-${account.rowId}`}
          label="Amounts on this account look reversed?"
          open={asking}
          onPress={() => setAsking((v) => !v)}
        />
      </Text>
      {asking ? (
        <Band>
          <Text variant="small" color={ROLE.ink}>
            Check one transaction to confirm. If your answer doesn&apos;t match how Budgts reads this account, every amount on it flips. You can change it back the same way.
          </Text>
          <MoneyDirectionQuestion
            testID={`sign-question-${account.rowId}`}
            sample={sample}
            lead="Was this money going out or coming in?"
            ask={(a) => ask(account.rowId, sample.transactionId, a, true)}
            onDone={() => setAsking(false)}
          />
        </Band>
      ) : null}
    </View>
  );
}

/** One account's money-direction exit, in the web's order: the open question, else the answered line, else the review link. */
export function MoneyDirection({ account, ask }: { account: BankAccount; ask: AskSign }) {
  if (account.pendingSignCheckCount > 0) return <SignCheckNotice account={account} ask={ask} />;
  if (account.signAnswer) return <SignAnswerLine account={account} ask={ask} />;
  if (account.directionReview) return <DirectionReviewLine account={account} ask={ask} />;
  return null;
}

type AskRemoved = (transactionId: string, a: MoneyAnswer, change: boolean) => Promise<CommandOutcome>;

/**
 * Held rows a disconnected bank left behind (web `RemovedBanksHeld`, §5c). Their Plaid account is gone, so no bank card
 * can ask about them; this asks the same plain question under the Budgts account they live in, one group per original
 * bank feed, and keeps "Change answer" for a group already answered. Drawn first on the page, so Home's "Check them" and
 * Activity's "Check it in Connected banks" land on it without scrolling.
 */
export function RemovedBanksHeldCard({ held, ask }: { held: RemovedBanksHeld; ask: AskRemoved }) {
  const { groups, answered } = held;
  if (groups.length === 0 && answered.length === 0) return null;
  const rows = [
    ...groups.map((g) => ({
      key: `held|${g.accountId}|${g.originRef}`,
      node: (
        <View testID={`removed-held-${g.accountId}`} style={{ gap: 8 }}>
          <Text variant="listName" color={ROLE.ink} numberOfLines={1}>
            {g.accountName}
          </Text>
          <Band>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Icon name="pending" color={COLOR.graphite} />
              <Text variant="small" color={ROLE.ink} style={{ flex: 1 }}>
                {"A bank you disconnected left "}
                <Text variant="smallStrong" color={ROLE.ink}>
                  {removedHeldWords(g.count).count}
                </Text>
                {` here before Budgts could check its transaction format. ${removedHeldWords(g.count).tail}`}
              </Text>
            </View>
            <MoneyDirectionQuestion
              testID={`removed-question-${g.accountId}`}
              sample={g.sample}
              lead="Was this money going out or coming in?"
              ask={(a) => ask(g.sample.transactionId, a, false)}
            />
          </Band>
        </View>
      ),
    })),
    ...answered.map((a) => ({ key: `answered|${a.accountId}|${a.originRef}`, node: <AnsweredLine group={a} ask={ask} /> })),
  ];
  return (
    <PixelFrame testID="removed-banks-held" frame="px-card-raised" style={{ padding: 8, gap: 16 }}>
      <SectionHead title="From removed banks" />
      <View>
        {rows.map((r, i) => (
          <View
            key={r.key}
            style={[
              { paddingTop: i === 0 ? 8 : 16, paddingBottom: i === rows.length - 1 ? 0 : 16 },
              i > 0 ? { borderTopWidth: 1, borderTopColor: COLOR.divider } : null,
            ]}
          >
            {r.node}
          </View>
        ))}
      </View>
    </PixelFrame>
  );
}

function AnsweredLine({ group, ask }: { group: RemovedAnsweredGroup; ask: AskRemoved }) {
  const [asking, setAsking] = useState(false);
  return (
    <View testID={`removed-answered-${group.accountId}`} style={{ gap: 8 }}>
      <Text variant="small" color={ROLE.muted}>
        <Text variant="formLabel" color={ROLE.ink}>
          {group.accountName}
        </Text>
        {". Money direction set. "}
        <InlineToggle testID={`removed-change-${group.accountId}`} label="Change answer" open={asking} onPress={() => setAsking((v) => !v)} />
      </Text>
      {asking ? (
        <Band>
          <MoneyDirectionQuestion
            testID={`removed-question-${group.accountId}`}
            sample={group.sample}
            lead="Was this money going out or coming in?"
            ask={(a) => ask(group.sample.transactionId, a, true)}
            onDone={() => setAsking(false)}
          />
        </Band>
      ) : null}
    </View>
  );
}
