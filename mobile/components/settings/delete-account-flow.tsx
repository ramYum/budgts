import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, View } from "react-native";
import { COLOR, ROLE, type IconName } from "../../lib/brand/shared";
import type { DeleteOutcome } from "../../lib/account/delete-account";
import {
  APPLE_MANAGE_URL,
  DELETION_SUBSCRIPTION_NOTICE,
  ERROR_COPY,
  GOOGLE_MANAGE_URL,
  STAGE_TITLE,
  firstStage,
  stageAfter,
  type DeleteScreen,
  type ErrorKind,
  type FlowStage,
  type ReauthLinkResult,
} from "../../lib/account/delete-screen";
import { CONFIRM_WORD, REAUTH_WINDOW_MINUTES, confirmWordMatches } from "../../lib/shared";
import { Button, Field, IconTile, Rule, TextButton } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { Skeleton } from "../feedback/skeleton";
import { BackButton } from "../kit/page-header";

/** What the flow asks of the app: the endpoint, the fresh sign-ins, and where each way out goes. */
export type DeleteFlowActions = {
  /** `POST /api/account/delete` (lib/account/delete-account.ts) */
  deleteAccount: () => Promise<DeleteOutcome>;
  /** the account is gone: sign out and land on the account-deleted screen */
  onDeleted: (storeSubscriptionMayBeActive: boolean) => void;
  sendReauthLink: () => Promise<ReauthLinkResult>;
  /** the Google fresh sign-in, in place; its failure in words, or null (signed in, or cancelled) */
  reauthWithGoogle: () => Promise<string | null>;
  /** back to Settings ("Keep my account", "Back to Settings", the back arrow) */
  onKeep: () => void;
  onConnectedBanks: () => void;
  /** the session ended: sign out, and sign-in brings the user back */
  onSignInAgain: () => void;
  /** a store's page, the support address, or budgts.com's deletion page */
  openUrl: (url: string) => void;
  /** budgts.com's "how deletion works" page, when the legal pages are live */
  deletionPageUrl: string | null;
  /** true while the server works: the screen holds the back gesture, as the web warns before unload */
  onBusy?: (busy: boolean) => void;
};

/** A line of reading text on a card (web 15/24 graphite). */
function Para({ children, color = COLOR.graphite, testID }: { children: ReactNode; color?: string; testID?: string }) {
  return (
    <Text testID={testID} variant="body" color={color}>
      {children}
    </Text>
  );
}

/** The account's address: ink, medium. */
function Email({ email }: { email: string }) {
  return (
    <Text variant="listName" color={ROLE.ink}>
      {email}
    </Text>
  );
}

/** A link inside a line (web `font-medium underline`). */
function InlineLink({ children, onPress, testID }: { children: string; onPress: () => void; testID?: string }) {
  return (
    <Text testID={testID} variant="listName" color={ROLE.ink} accessibilityRole="link" onPress={onPress} style={{ textDecorationLine: "underline" }}>
      {children}
    </Text>
  );
}

/** A notice on the warm wash (web `px-warn flex items-start gap-3 p-3`). */
function Warn({ children, role, testID }: { children: ReactNode; role?: "alert"; testID?: string }) {
  return (
    <PixelFrame testID={testID} frame="px-warn" accessibilityRole={role} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 }}>
      <Icon name="warning" color={ROLE.warn} />
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </PixelFrame>
  );
}

/** A tile beside its words, on a card (web `px-card flex items-start gap-3 p-2`). */
function TileCard({ icon, children, testID }: { icon: IconName; children: ReactNode; testID?: string }) {
  return (
    <PixelFrame testID={testID} frame="px-card" style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 8 }}>
      <IconTile name={icon} />
      <View style={{ flex: 1, minWidth: 0, paddingTop: 4, gap: 4 }}>{children}</View>
    </PixelFrame>
  );
}

function StoreNotice({ lead, openUrl }: { lead: string; openUrl: (url: string) => void }) {
  return (
    <Warn testID="delete-store-notice">
      <Para color={ROLE.ink}>
        {`${DELETION_SUBSCRIPTION_NOTICE} ${lead} in the `}
        <InlineLink onPress={() => openUrl(APPLE_MANAGE_URL)}>App Store</InlineLink>
        {" or "}
        <InlineLink onPress={() => openUrl(GOOGLE_MANAGE_URL)}>Google Play</InlineLink>.
      </Para>
    </Warn>
  );
}

function Fact({ icon, children }: { icon: IconName; children: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <IconTile name={icon} />
      <View style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
        <Para>{children}</Para>
      </View>
    </View>
  );
}

function Intro({ screen, onContinue, a }: { screen: DeleteScreen; onContinue: () => void; a: DeleteFlowActions }) {
  return (
    <>
      {screen.inProgress ? (
        <Warn testID="delete-in-progress">
          <Para color={ROLE.ink}>
            <Text variant="bodyStrong" color={ROLE.ink}>
              Deletion already started.
            </Text>
            {" Your account is read-only until it finishes. Continue to finish it."}
          </Para>
        </Warn>
      ) : null}

      <PixelFrame testID="delete-what-happens" frame="px-card" accessibilityLabel="What happens" style={{ padding: 8, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text variant="tHead" color={ROLE.ink} accessibilityRole="header">
            {"What's deleted"}
          </Text>
          <View style={{ gap: 8 }}>
            <Fact icon="receipt">Your transactions, accounts, categories, budgets and savings goals.</Fact>
            <Fact icon="bank">Every connected bank, disconnected at Plaid.</Fact>
            <Fact icon="sign-out">{"Your sign-in. You're signed out everywhere."}</Fact>
          </View>
        </View>
        <Rule />
        <View style={{ gap: 4 }}>
          <Text variant="tHead" color={ROLE.ink} accessibilityRole="header">
            {"What's kept"}
          </Text>
          <Para testID="delete-kept">
            {screen.keepsRecords
              ? "Only if you ever paid for a subscription: those billing records, with your email and sign-in details removed."
              : "Nothing. Your data is deleted right away."}
          </Para>
        </View>
      </PixelFrame>

      {screen.billing ? <StoreNotice lead="Cancel it first" openUrl={a.openUrl} /> : null}

      <View style={{ gap: 12 }}>
        <Button testID="delete-continue" size="lg" arrow onPress={onContinue}>
          Continue
        </Button>
        <Button testID="delete-keep" variant="secondary" size="lg" onPress={a.onKeep}>
          Keep my account
        </Button>
      </View>
    </>
  );
}

function Reauth({ screen, stale, a }: { screen: DeleteScreen; stale: boolean; a: DeleteFlowActions }) {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (pending) return;
    setPending("email");
    setError(null);
    const result = await a.sendReauthLink();
    setPending(null);
    if (result.sent) setSent(true);
    else setError(result.error);
  }

  async function google() {
    if (pending) return;
    setPending("google");
    setError(null);
    const failure = await a.reauthWithGoogle();
    setPending(null);
    if (failure) setError(failure);
  }

  if (sent) {
    return (
      <TileCard icon="mail" testID="delete-link-sent">
        <Text variant="listName" color={ROLE.ink} accessibilityLiveRegion="polite">
          Check your email
        </Text>
        <Para>
          {"We sent a sign-in link to "}
          <Email email={screen.email} />
          {". Open it on this device and you'll come straight back here to confirm."}
        </Para>
        {error ? (
          <Text variant="meta" color={ROLE.neg} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={{ alignSelf: "flex-start" }}>
          <TextButton testID="delete-send-again" icon="sync" disabled={pending !== null} onPress={() => void send()}>
            {pending === "email" ? "Sending…" : "Send it again"}
          </TextButton>
        </View>
      </TileCard>
    );
  }

  return (
    <>
      {stale ? (
        <Warn role="alert" testID="delete-stale">
          <Para color={ROLE.ink}>{`It's been more than ${REAUTH_WINDOW_MINUTES} minutes since you signed in. Nothing was deleted.`}</Para>
        </Warn>
      ) : null}

      <TileCard icon="key">
        <Para>
          {`Deleting your account needs a sign-in from the last ${REAUTH_WINDOW_MINUTES} minutes. We'll email a link to `}
          <Email email={screen.email} />
          {" that brings you back here."}
        </Para>
      </TileCard>

      {error ? (
        <Text testID="delete-reauth-error" variant="small" color={ROLE.neg} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <View style={{ gap: 12 }}>
        <Button testID="delete-send-link" size="lg" arrow loading={pending === "email"} disabled={pending !== null} onPress={() => void send()}>
          {pending === "email" ? "Sending…" : "Email me a sign-in link"}
        </Button>
        {screen.google ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Rule style={{ flex: 1 }} />
              <Text variant="caption" color={ROLE.muted}>
                or
              </Text>
              <Rule style={{ flex: 1 }} />
            </View>
            <Button testID="delete-google" variant="secondary" size="lg" icon="google" disabled={pending !== null} onPress={() => void google()}>
              Continue with Google
            </Button>
          </>
        ) : null}
        <Button testID="delete-keep" variant="secondary" size="lg" onPress={a.onKeep}>
          Keep my account
        </Button>
      </View>
    </>
  );
}

function Confirm({ screen, onDelete, a }: { screen: DeleteScreen; onDelete: () => void; a: DeleteFlowActions }) {
  const [typed, setTyped] = useState("");
  const ready = confirmWordMatches(typed);
  return (
    <>
      <PixelFrame frame="px-card" style={{ padding: 8, gap: 16 }}>
        <Para>
          {screen.inProgress ? "Finish deleting" : "You're about to permanently delete"}
          {" the Budgts account for "}
          <Email email={screen.email} />
          {". This can't be undone."}
        </Para>
        <Field
          testID="delete-confirm-word"
          label={
            <>
              {"Type "}
              <Text testID="delete-confirm-word-strong" variant="smallStrong" color={ROLE.ink}>
                {CONFIRM_WORD}
              </Text>
              {" to confirm"}
            </>
          }
          accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`}
          value={typed}
          onChangeText={setTyped}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (ready) onDelete();
          }}
        />
      </PixelFrame>
      <View style={{ gap: 12 }}>
        <Button testID="delete-submit" size="lg" icon="trash" disabled={!ready} onPress={onDelete}>
          Delete my account
        </Button>
        <Button testID="delete-keep" variant="secondary" size="lg" onPress={a.onKeep}>
          Keep my account
        </Button>
      </View>
    </>
  );
}

function Deleting() {
  return (
    <PixelFrame testID="delete-deleting" frame="px-card" accessibilityRole="progressbar" accessibilityState={{ busy: true }} style={{ padding: 8, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <IconTile name="pending" />
        <View style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          <Para>Disconnecting your banks and removing your data. This can take up to a minute, so keep this screen open.</Para>
        </View>
      </View>
      <Skeleton width="100%" height={12} />
    </PixelFrame>
  );
}

function Failure({ kind, screen, onRetry, a }: { kind: ErrorKind; screen: DeleteScreen; onRetry: () => void; a: DeleteFlowActions }) {
  return (
    <>
      <PixelFrame testID="delete-error" frame="px-wash" accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 }}>
        <Icon name="warning" color={COLOR.signal} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Para color={ROLE.ink}>{ERROR_COPY[kind].body}</Para>
        </View>
      </PixelFrame>

      {/* A bank Plaid won't remove: disconnecting it is the next step, retrying comes after. */}
      <View style={{ gap: 12 }}>
        {kind === "plaid" ? (
          <Button testID="delete-connected-banks" size="lg" icon="bank" onPress={a.onConnectedBanks}>
            Connected banks
          </Button>
        ) : null}
        <Button testID="delete-retry" size="lg" icon="sync" variant={kind === "plaid" ? "secondary" : "primary"} onPress={onRetry}>
          Try again
        </Button>
        {kind === "plaid" || kind === "incomplete" ? null : (
          <Button testID="delete-back-to-settings" variant="secondary" size="lg" onPress={a.onKeep}>
            Back to Settings
          </Button>
        )}
      </View>

      {screen.supportEmail ? (
        <Text variant="meta" color={ROLE.muted}>
          {"Still stuck? Email "}
          <Text variant="metaStrong" color={ROLE.ink} accessibilityRole="link" onPress={() => a.openUrl(`mailto:${screen.supportEmail}`)} style={{ textDecorationLine: "underline" }}>
            {screen.supportEmail}
          </Text>
          .
        </Text>
      ) : null}
    </>
  );
}

function SignedOut({ a }: { a: DeleteFlowActions }) {
  const url = a.deletionPageUrl;
  return (
    <>
      <TileCard icon="security">
        <Para>{"Your session ended, so nothing was deleted. Sign in again and you'll come back here."}</Para>
      </TileCard>
      <Button testID="delete-sign-in-again" size="lg" arrow onPress={a.onSignInAgain}>
        Sign in again
      </Button>
      {url ? (
        <Text variant="meta" color={ROLE.muted}>
          {"Or read "}
          <Text variant="metaStrong" color={ROLE.ink} accessibilityRole="link" onPress={() => a.openUrl(url)} style={{ textDecorationLine: "underline" }}>
            how deletion works
          </Text>
          .
        </Text>
      ) : null}
    </>
  );
}

/**
 * Delete account (web src/components/account/delete-account-flow.tsx): what
 * happens → a fresh sign-in when the last one is over 10 minutes old → type
 * DELETE → progress → the account-deleted screen, signed out. Every answer
 * the endpoint can give has its own state with a way out. When the screen's
 * state is re-read after a fresh sign-in (`screen` changes), a flow waiting
 * on the sign-in moves on to confirm.
 */
export function DeleteAccountFlow({ screen, step, actions: a }: { screen: DeleteScreen; step: "intro" | "confirm"; actions: DeleteFlowActions }) {
  const [stage, setStage] = useState<FlowStage>(() => firstStage(step, screen.recent));
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<ErrorKind>("failed");

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (screen.recent) {
      setStale(false);
      setStage((s) => (s === "reauth" ? "confirm" : s));
    }
  }, [screen]);

  const subtitle = stage === "error" ? ERROR_COPY[error].title : STAGE_TITLE[stage];

  // Each stage change is spoken (VoiceOver ignores live regions), never the first render.
  const announced = useRef(false);
  useEffect(() => {
    if (!announced.current) {
      announced.current = true;
      return;
    }
    AccessibilityInfo.announceForAccessibility(subtitle);
  }, [subtitle]);

  const onBusy = a.onBusy;
  useEffect(() => {
    onBusy?.(stage === "deleting");
  }, [stage, onBusy]);

  async function runDeletion() {
    setStage("deleting");
    const outcome = await a.deleteAccount();
    if (outcome.status === "deleted") {
      a.onDeleted(outcome.storeSubscriptionMayBeActive);
      return;
    }
    const next = stageAfter(outcome);
    if (next.stale) setStale(true);
    if (next.error) setError(next.error);
    setStage(next.stage);
  }

  return (
    <View testID="delete-account-view" style={{ gap: 24 }}>
      <View style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8 }}>
        {/* no way back while the server works (the answer would be lost), but the title keeps its place */}
        {stage === "deleting" ? <View style={{ width: 36, height: 36 }} /> : <BackButton onPress={a.onKeep} />}
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text testID="page-title" variant="pxTitle" color={ROLE.ink} accessibilityRole="header">
            Delete account
          </Text>
          <Text testID="delete-stage" variant="body" color={ROLE.muted} accessibilityLiveRegion="polite" style={{ marginTop: 4, lineHeight: 20 }}>
            {subtitle}
          </Text>
        </View>
      </View>

      {stage === "intro" ? <Intro screen={screen} a={a} onContinue={() => setStage(screen.recent ? "confirm" : "reauth")} /> : null}
      {stage === "reauth" ? <Reauth screen={screen} stale={stale} a={a} /> : null}
      {stage === "confirm" ? <Confirm screen={screen} a={a} onDelete={() => void runDeletion()} /> : null}
      {stage === "deleting" ? <Deleting /> : null}
      {stage === "error" ? <Failure kind={error} screen={screen} a={a} onRetry={() => void runDeletion()} /> : null}
      {stage === "signed_out" ? <SignedOut a={a} /> : null}
    </View>
  );
}
