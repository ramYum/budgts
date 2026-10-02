import { Icon } from "@/components/icon";

/** The words, shared by the web and (mirrored) the native Connected banks screen. */
export const LAPSE_REMOVAL_MESSAGE =
  "Your bank connections were removed when your subscription ended. Your past transactions are still here. Subscribe again to reconnect.";

/**
 * Connected banks' explanation for a user whose Plaid connections the billing lapse sweep removed
 * (src/lib/billing/lapse.ts). Never a silent empty list: it says what happened and that the history is kept. The way
 * back is the Connect a bank button on the same page (Phase 4's paywall will sit in front of it).
 */
export function LapseRemovalNotice() {
  return (
    <div data-testid="lapse-removal-notice" role="status" className="px-warn flex items-start gap-2 px-2 py-1.5 text-sm leading-5 text-ink">
      <Icon name="warning" className="-my-0.5 text-warn" />
      <p>{LAPSE_REMOVAL_MESSAGE}</p>
    </div>
  );
}
