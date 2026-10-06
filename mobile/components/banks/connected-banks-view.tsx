import { View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import type { ConnectedBank, RemovedBanksHeld } from "../../lib/plaid/banks-api";
import { WarnLine } from "../activity/limited-history-banner";
import { IconTile } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { PageHeader } from "../kit/page-header";
import { BankCard, type BankActions } from "./bank-card";
import { ConnectBank } from "./connect-bank";
import { RemovedBanksHeldCard } from "./money-direction";

/**
 * Connected banks (web `/connected-banks`: `BankConnections` and
 * `ConnectedBanks`, src/components/plaid/): the page title with its way back,
 * then "From removed banks" when a disconnected bank left held rows, then a card per bank (or the empty card explaining what connecting does and
 * what Budgts can't do with the access), then Connect a bank full width under
 * them, in one fixed place so its mapping sheet survives the reload after a
 * save. When bank connections are off on the deployment, the web's note.
 */
/** Web `LAPSE_REMOVAL_MESSAGE` (src/components/plaid/lapse-removal-notice.tsx), word for word. */
export const LAPSE_REMOVAL_MESSAGE =
  "Your bank connections were removed when your subscription ended. Your past transactions are still here. Subscribe again to reconnect.";

const NONE_HELD: RemovedBanksHeld = { groups: [], answered: [] };

/** What shows where "From removed banks" would be when the server couldn't read it. */
export const REMOVED_BANKS_UNAVAILABLE = "Couldn't load transactions from removed banks. Try again later.";

export function ConnectedBanksView({
  enabled,
  banks,
  connectionsRemovedForLapse = false,
  removedBanksHeld = NONE_HELD,
  actions,
  now,
  onBack,
}: {
  enabled: boolean;
  banks: ConnectedBank[];
  /** The server removed the banks when the subscription ended: say so above the list, Connect a bank is the way back. */
  connectionsRemovedForLapse?: boolean;
  /** Held rows a disconnected bank left behind (card payments §5c): "From removed banks", their only exit; null: couldn't load. */
  removedBanksHeld?: RemovedBanksHeld | null;
  actions: BankActions;
  now: number;
  onBack: () => void;
}) {
  if (!enabled) {
    return (
      <View testID="connected-banks-view">
        <PageHeader title="Connected banks" onBack={onBack} />
        <Text testID="connected-banks-off" variant="body" color={ROLE.muted}>
          Bank connections aren't available yet on this deployment. Manual entry works for every account in the meantime: add transactions from Activity.
        </Text>
      </View>
    );
  }

  return (
    <View testID="connected-banks-view">
      <PageHeader title="Connected banks" onBack={onBack} />
      <View style={{ gap: 24 }}>
        {connectionsRemovedForLapse ? <WarnLine testID="lapse-removal-notice">{LAPSE_REMOVAL_MESSAGE}</WarnLine> : null}
        {removedBanksHeld === null ? (
          // the server couldn't read them this time: never a silent gap where their only exit should be
          <WarnLine testID="removed-banks-unavailable">{REMOVED_BANKS_UNAVAILABLE}</WarnLine>
        ) : (
          <RemovedBanksHeldCard held={removedBanksHeld} ask={actions.commands.answerRemovedHeld} />
        )}
        {banks.length === 0 ? (
          <PixelFrame testID="connected-banks-empty" frame="px-card-raised" style={{ padding: 8, alignItems: "flex-start", gap: 16 }}>
            <IconTile name="bank" />
            <Text variant="body" color={ROLE.ink}>
              Connect a bank and Budgts imports its transactions for you, categories filled in, ready to check. Manual entry still works for cash and anything your bank can't reach.
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <View style={{ marginVertical: -2 }}>
                <Icon name="shield" color={COLOR.graphite} />
              </View>
              <Text variant="small" color={ROLE.muted} style={{ flex: 1 }}>
                Your data is secure. Budgts can only read your account and transaction data to help you budget. It can't send money, make payments, make purchases, or transfer funds.
              </Text>
            </View>
          </PixelFrame>
        ) : (
          <View style={{ gap: 24 }}>
            {banks.map((bank) => (
              <BankCard key={bank.id} bank={bank} actions={actions} now={now} />
            ))}
          </View>
        )}
        <ConnectBank label={banks.length === 0 ? "Connect a bank" : "Connect another bank"} fullWidth link={actions.link} />
      </View>
    </View>
  );
}
