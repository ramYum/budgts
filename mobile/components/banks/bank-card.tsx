import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { useReducedMotion } from "../motion/reduced-motion";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { invalidate } from "../../lib/api/invalidate";
import { statusNeedsAttention, type BankAccount, type ConnectedBank } from "../../lib/plaid/banks-api";
import type { BankCommands, CommandOutcome } from "../../lib/plaid/bank-commands";
import { accountName, bankName, notImportedNote, resumesExisting, signCheckWords, splitAccounts, syncedLabel } from "../../lib/plaid/bank-view";
import { reconnectBank, type ReconnectDeps } from "../../lib/plaid/link-flow";
import { accountLabel, guessType, type MappingChoices } from "../../lib/plaid/mapping";
import type { PlaidLinkClient } from "../../lib/plaid/plaid-link";
import { currentPlatform } from "../../lib/plaid/plaid-link-native";
import { Button, IconTile, Rule } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { Checkbox } from "../kit/checkbox";
import { Badge } from "../kit/tiles";
import { SectionHead } from "../kit/section-head";
import { AccountMappingSheet } from "./account-mapping";
import { Overlay } from "../kit/overlay";
import { pressStyle } from "../kit/press";

/** What a bank card needs to act: the server commands, the Link ports and client, and the mapping choices. */
export type BankActions = {
  commands: BankCommands;
  ports: Pick<ReconnectDeps, "fetchLinkToken" | "sync">;
  link: PlaidLinkClient;
  choices: MappingChoices;
};

/**
 * The web's revalidation after a Plaid action: Connected banks reloads (it follows "accounts"), and so does every
 * screen showing money, since a change here can move totals (import on, exclusion, a sync, a purge).
 */
const changedEverything = () => invalidate("accounts", "transactions", "budgets", "home");

/**
 * One connected bank (web `BankCard`, src/components/plaid/connected-banks.tsx):
 * its status and last sync, a reconnect when it needs one, the accounts it
 * imports and the ones it doesn't with their switches, the review and
 * sign-check notices, Sync now, Disconnect (a confirm sheet), and the mapping
 * sheet for accounts not set up yet.
 */
export function BankCard({ bank, actions, now }: { bank: ConnectedBank; actions: BankActions; now: number }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [choosing, setChoosing] = useState(false);

  const needsAttention = statusNeedsAttention(bank.status);
  const { name, sandbox } = bankName(bank.institutionName);
  const { importing, notImporting } = splitAccounts(bank.accounts);
  const id = `bank-${bank.id}`;

  async function runSync() {
    setSyncing(true);
    setSyncMsg(null);
    const out = await actions.commands.sync(bank.itemId);
    setSyncing(false);
    setSyncMsg(out.status === "error" ? out.message : (out.warning ?? "Synced."));
    changedEverything();
  }

  return (
    <PixelFrame testID={id} frame="px-card-raised" style={{ padding: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <IconTile name="bank" size={56} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Text testID={`${id}-name`} variant="listNameLg" color={ROLE.ink} numberOfLines={1}>
            {name}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {needsAttention ? (
              <Badge testID={`${id}-status`} tone="wash" icon="warning">
                Needs attention
              </Badge>
            ) : (
              <Badge testID={`${id}-status`} tone="growth" icon="check">
                Connected
              </Badge>
            )}
            {sandbox ? <Badge tone="gray">Sandbox</Badge> : null}
            <View testID={`${id}-synced`} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="sync" size={12} color={ROLE.muted} />
              <Text variant="small" color={ROLE.muted}>
                {syncedLabel(bank, now)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {needsAttention ? (
        <PixelFrame testID={`${id}-attention`} frame="px-band" style={{ marginTop: 20, padding: 8, gap: 12 }}>
          <Text variant="body" color={ROLE.ink}>
            {bank.status === "revoked"
              ? "Access to this bank was revoked. Reconnect to keep it syncing, or disconnect it."
              : "This connection needs you to sign in with your bank again."}
          </Text>
          <ReconnectButton itemId={bank.itemId} actions={actions} testID={`${id}-reconnect`} />
        </PixelFrame>
      ) : null}

      {importing.length > 0 ? (
        <View style={{ marginTop: 24, gap: 8 }}>
          <SectionHead title="Importing" count={importing.length} />
          <View>
            {importing.map((a, i) => (
              <View
                key={a.rowId}
                testID={`account-${a.rowId}`}
                style={[
                  { gap: 12, paddingTop: i === 0 ? 8 : 16, paddingBottom: i === importing.length - 1 ? 0 : 16 },
                  i > 0 ? { borderTopWidth: 1, borderTopColor: COLOR.divider } : null,
                ]}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
                  <ImportToggle account={a} actions={actions} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="listName" color={ROLE.ink} numberOfLines={1}>
                      {accountName(a)}
                    </Text>
                    <Text variant="small" color={ROLE.muted} numberOfLines={1}>
                      {`Imports into ${a.mappedAccountName ?? "a Budgts account"}`}
                    </Text>
                  </View>
                </View>
                {a.pendingSignCheckCount > 0 ? <SignCheckNotice count={a.pendingSignCheckCount} /> : null}
                {a.needsReview || a.excludedFromCalculations ? <AccountReviewNotice account={a} actions={actions} /> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {notImporting.length > 0 ? (
        <View style={{ marginTop: 32, gap: 12 }}>
          <SectionHead
            title="Not imported"
            count={notImporting.length}
            aside={
              <Text variant="small" color={ROLE.muted}>
                Switch on to import
              </Text>
            }
          />
          <View style={{ gap: 12 }}>
            {notImporting.map((a) => {
              const note = notImportedNote(a);
              return (
                <View key={a.rowId} testID={`account-${a.rowId}`} style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                    {resumesExisting(a) ? <ImportToggle account={a} actions={actions} /> : <ConnectToggle account={a} plaidItemId={bank.id} actions={actions} />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="body" color={ROLE.ink} numberOfLines={1}>
                        {accountName(a)}
                      </Text>
                      {note ? (
                        <Text variant="small" color={ROLE.muted} numberOfLines={1}>
                          {note}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {a.pendingSignCheckCount > 0 ? <SignCheckNotice count={a.pendingSignCheckCount} /> : null}
                  {a.needsReview || a.excludedFromCalculations ? <AccountReviewNotice account={a} actions={actions} /> : null}
                </View>
              );
            })}
          </View>
          {bank.unmappedAccounts.length > 0 ? (
            <Button testID={`${id}-choose`} variant="secondary" icon="list" onPress={() => setChoosing(true)} style={{ alignSelf: "flex-start" }}>
              Choose accounts to import
            </Button>
          ) : null}
        </View>
      ) : null}

      <Rule style={{ marginTop: 24 }} />
      <View style={{ marginTop: 20, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <Button testID={`${id}-sync`} variant="secondary" icon="sync" onPress={() => void runSync()} loading={syncing}>
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
        <Button testID={`${id}-disconnect`} variant="danger" icon="disconnect" onPress={() => setConfirming(true)}>
          Disconnect
        </Button>
        {syncMsg ? (
          <Text testID={`${id}-sync-message`} variant="small" color={ROLE.muted} accessibilityLiveRegion="polite">
            {syncMsg}
          </Text>
        ) : null}
      </View>
      <Text variant="small" color={ROLE.muted} style={{ marginTop: 12 }}>
        Disconnecting a bank keeps every transaction it already imported. They stay in Budgts as history.
      </Text>

      {confirming ? (
        <Overlay title={`Disconnect ${name}?`} onClose={() => setConfirming(false)}>
          <DisconnectConfirm itemId={bank.itemId} bankName={name} actions={actions} onClose={() => setConfirming(false)} />
        </Overlay>
      ) : null}

      {choosing ? (
        <AccountMappingSheet
          plaidItemId={bank.id}
          plaidAccounts={bank.unmappedAccounts}
          choices={actions.choices}
          onDone={() => setChoosing(false)}
          onClose={() => setChoosing(false)}
        />
      ) : null}
    </PixelFrame>
  );
}

/** Reconnect (web `ReconnectButton`): Link in update mode on the same bank, then a sync that flips it back to connected. */
function ReconnectButton({ itemId, actions, testID }: { itemId: string; actions: BankActions; testID: string }) {
  const [phase, setPhase] = useState<"idle" | "starting" | "linking" | "finishing">("idle");
  const [error, setError] = useState<string | null>(null);

  // One run at a time, decided synchronously: two taps in the same frame both land before the disabled button renders.
  const running = useRef(false);
  async function start() {
    if (running.current) return;
    running.current = true;
    setError(null);
    setPhase("starting");
    let syncing = false;
    try {
      const out = await reconnectBank(
        {
          fetchLinkToken: actions.ports.fetchLinkToken,
          link: {
            isAvailable: () => actions.link.isAvailable(),
            open: (token) => {
              setPhase("linking");
              return actions.link.open(token);
            },
          },
          sync: (id) => {
            syncing = true;
            setPhase("finishing");
            return actions.ports.sync(id);
          },
        },
        itemId,
        currentPlatform(),
      );
      if (out.status === "unavailable") setError("Bank connections aren't available in this build yet.");
      // the web shows only a failed start; a sync that didn't finish shows on the card as its status
      else if (out.status === "error" && !syncing) setError(out.message);
      if (out.status === "ok" || out.status === "error") {
        changedEverything();
      }
    } catch {
      // a port that threw rather than answering: the button never sticks, and the user hears it didn't start
      if (!syncing) setError("Couldn't start the reconnect. Try again.");
      else changedEverything();
    } finally {
      running.current = false;
      setPhase("idle");
    }
  }

  // The web's Link opens over the page at once; native Link can take a while to appear after `open`, so the button
  // stays on "Opening…", disabled, until Link closes.
  const busy = phase !== "idle";
  return (
    <View style={{ gap: 4 }}>
      <Button testID={testID} onPress={() => void start()} loading={busy} style={{ alignSelf: "flex-start" }}>
        {phase === "starting" || phase === "linking" ? "Opening…" : phase === "finishing" ? "Finishing…" : "Reconnect"}
      </Button>
      {error ? (
        <Text testID={`${testID}-error`} variant="small" color={ROLE.neg} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const SWITCH_SLIDE_MS = 150;

/** The pixel switch (web `.px-switch` + `SwitchKnob`): a stepped track, ink when on, a square knob that slides over. */
function PixelSwitch({
  on,
  label,
  hint,
  onPress,
  disabled,
  testID,
}: {
  on: boolean;
  label: string;
  /** the web's `title`: what a tap does (and, for pausing, what it costs) */
  hint: string;
  onPress: () => void;
  disabled: boolean;
  testID: string;
}) {
  const reduced = useReducedMotion();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
    >
      {({ pressed }) => (
        <PixelFrame
          frame="px-switch"
          state={on ? "[aria-checked='true']" : ""}
          style={[{ width: 44, height: 24, paddingHorizontal: 2, justifyContent: "center", opacity: disabled ? 0.6 : 1 }, pressStyle(pressed)]}
        >
          <Animated.View
            style={[
              { width: 12, height: 12, backgroundColor: on ? COLOR.white : COLOR.silver, transform: [{ translateX: on ? 20 : 0 }] },
              reduced ? null : { transitionProperty: "transform", transitionDuration: SWITCH_SLIDE_MS },
            ]}
          />
        </PixelFrame>
      )}
    </Pressable>
  );
}

/**
 * A command on one account row. After it succeeds the control stays disabled, showing the state it asked for, until
 * the row itself changes (the reload landed with a new row). If that reload fails, the screen's refresh notice says so
 * with a retry; the control never turns back on over stale data.
 */
function useRowCommand<T>(row: object) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landed, setLanded] = useState<{ row: object; target: T } | null>(null);
  const awaiting = landed && landed.row === row ? landed : null;
  const run = async (command: () => Promise<CommandOutcome>, target: T) => {
    setPending(true);
    setError(null);
    const out = await command();
    setPending(false);
    if (out.status === "error") {
      setError(out.message);
      return;
    }
    setLanded({ row, target });
    changedEverything();
  };
  return { busy: pending || awaiting !== null, target: awaiting ? awaiting.target : null, error, run };
}

function ErrorLine({ message, testID }: { message: string | null; testID?: string }) {
  return message ? (
    <Text testID={testID} variant="small" color={ROLE.neg} accessibilityRole="alert">
      {message}
    </Text>
  ) : null;
}

/** Pause or resume one mapped account (web `ImportToggle`): reversible, the same Budgts account resumes. */
function ImportToggle({ account, actions }: { account: BankAccount; actions: BankActions }) {
  const cmd = useRowCommand<boolean>(account);
  const importing = cmd.target ?? account.linkState === "mapped";
  return (
    <View style={{ gap: 4, flexShrink: 0 }}>
      <PixelSwitch
        testID={`import-${account.rowId}`}
        on={importing}
        label={`Importing ${account.name ?? "Account"}`}
        hint={
          importing
            ? "Importing. Tap to pause. New transactions from a paused account aren't recovered later."
            : "Paused. Tap to resume importing new transactions from now on."
        }
        disabled={cmd.busy}
        onPress={() => void cmd.run(() => actions.commands.setImporting(account.rowId, !importing), !importing)}
      />
      <ErrorLine message={cmd.error} />
    </View>
  );
}

/** Start importing an account never set up (web `ConnectToggle`): the mapping's "new account" with its guessed name and type. */
function ConnectToggle({ account, plaidItemId, actions }: { account: BankAccount; plaidItemId: string; actions: BankActions }) {
  const cmd = useRowCommand<true>(account);
  return (
    <View style={{ gap: 4, flexShrink: 0 }}>
      <PixelSwitch
        testID={`connect-${account.rowId}`}
        on={cmd.target ?? false}
        label={`Connect ${account.name ?? "Account"}`}
        hint="Not connected. Tap to start importing this account into a new Budgts account."
        disabled={cmd.busy}
        onPress={() =>
          void cmd.run(
            () => actions.commands.mapAccounts(plaidItemId, [{ plaidAccountId: account.plaidAccountId, mode: "new", name: accountLabel(account), type: guessType(account) }]),
            true,
          )
        }
      />
      <ErrorLine message={cmd.error} />
    </View>
  );
}

/** Held transactions never vanish silently (web `SignCheckNotice`). */
function SignCheckNotice({ count }: { count: number }) {
  const words = signCheckWords(count);
  return (
    <PixelFrame frame="px-band" style={{ paddingHorizontal: 6, paddingVertical: 6, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <Icon name="pending" color={COLOR.graphite} />
      <Text variant="small" color={ROLE.ink} style={{ flex: 1 }}>
        {"We're checking this account's transaction format. "}
        <Text variant="smallStrong" color={ROLE.ink}>
          {words.count}
        </Text>
        {` ${words.verb} once it's verified.`}
      </Text>
    </PixelFrame>
  );
}

/** The review warning and the exclusion controls (web `AccountReviewNotice`); neither touches a transaction. */
function AccountReviewNotice({ account, actions }: { account: BankAccount; actions: BankActions }) {
  const review = useRowCommand<"reviewed">(account);
  const exclusion = useRowCommand<boolean>(account);
  // one change at a time on a row: either one's reload brings the new row
  const busy = review.busy || exclusion.busy;

  if (account.excludedFromCalculations) {
    return (
      <PixelFrame testID={`excluded-${account.rowId}`} frame="px-badge-wash" style={{ padding: 8, gap: 8 }}>
        <Text variant="small" color={ROLE.ink}>
          <Text variant="smallStrong" color={COLOR.signalInk}>
            Excluded from totals.
          </Text>
          {
            " This account's bank feed showed unreliable data, so its transactions no longer count toward Money Left, budgets, or spending. Nothing was deleted. Every transaction is still here in your history."
          }
        </Text>
        <ErrorLine message={exclusion.error} />
        <Button
          testID={`include-${account.rowId}`}
          variant="secondary"
          loading={busy}
          onPress={() => void exclusion.run(() => actions.commands.setExcluded(account.rowId, false), false)}
          style={{ alignSelf: "flex-start" }}
        >
          {busy ? "Saving…" : "Include again"}
        </Button>
      </PixelFrame>
    );
  }

  return (
    <PixelFrame testID={`review-${account.rowId}`} frame="px-warn" style={{ padding: 8, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ marginVertical: -2 }}>
          <Icon name="warning" color={ROLE.warn} />
        </View>
        <Text variant="small" color={ROLE.ink} style={{ flex: 1 }}>
          {account.reviewReason ?? ""}
        </Text>
      </View>
      <ErrorLine message={review.error} />
      <ErrorLine message={exclusion.error} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button
          testID={`mark-reviewed-${account.rowId}`}
          variant="secondary"
          loading={busy}
          onPress={() => void review.run(() => actions.commands.clearReview(account.rowId), "reviewed")}
        >
          {review.busy ? "Saving…" : "Mark reviewed"}
        </Button>
        {account.needsReview ? (
          <Button
            testID={`exclude-${account.rowId}`}
            variant="danger"
            loading={busy}
            onPress={() => void exclusion.run(() => actions.commands.setExcluded(account.rowId, true), true)}
          >
            {exclusion.busy ? "Saving…" : "Exclude from totals"}
          </Button>
        ) : null}
      </View>
      <Text variant="small" color={COLOR.graphite}>
        Excluding keeps every transaction visible in your history. It only stops this account from affecting Money Left, budgets, and spending totals.
      </Text>
    </PixelFrame>
  );
}

/** Disconnect's confirm (web `DisconnectConfirm`): history kept by default; deleting the imported transactions is an explicit extra choice. */
function DisconnectConfirm({ itemId, bankName: name, actions, onClose }: { itemId: string; bankName: string; actions: BankActions; onClose: () => void }) {
  const [purge, setPurge] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const out = await actions.commands.disconnect(itemId, purge);
    setPending(false);
    if (out.status === "error") {
      setError(out.message);
      return;
    }
    onClose();
    changedEverything();
  }
  return (
    <View style={{ gap: 16 }} testID="disconnect-confirm">
      <Text variant="body" color={ROLE.muted}>
        {`Budgts stops syncing ${name}. The transactions it already imported stay in your history and keep counting toward budgets.`}
      </Text>

      <PixelFrame testID="disconnect-purge-box" frame="px-badge-wash" style={{ padding: 8, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ marginTop: 4 }}>
          <Checkbox
            testID="disconnect-purge"
            tone="accent"
            checked={purge}
            onChange={setPurge}
            accessibilityLabel={`Also delete the ${name} transactions Budgts imported. This can't be undone.`}
          />
        </View>
        {/* the web's <label> wraps the box and its sentence: tapping the sentence ticks it too */}
        <Pressable
          style={{ flex: 1 }}
          onPress={() => setPurge((p) => !p)}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text variant="body" color={ROLE.ink}>
            {`Also delete the ${name} transactions Budgts imported. This can't be undone.`}
          </Text>
        </Pressable>
      </PixelFrame>

      <ErrorLine message={error} testID="disconnect-error" />

      <View style={{ flexDirection: "row", gap: 12, paddingTop: 4 }}>
        <Button
          testID="disconnect-submit"
          variant="danger"
          loading={pending}
          style={{ flex: 1 }}
          onPress={() => void submit()}
        >
          {pending ? "Disconnecting…" : purge ? "Disconnect and delete" : "Disconnect"}
        </Button>
        <Button testID="disconnect-cancel" variant="secondary" onPress={onClose}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

