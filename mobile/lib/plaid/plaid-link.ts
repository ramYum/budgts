/**
 * The device-side Plaid Link PORT — everything a screen or `link-flow.ts` knows about the native SDK, mirroring
 * `lib/billing/purchases.ts`'s `PurchasesClient` shape. `plaid-link-native.ts` (react-native-plaid-link-sdk) is the
 * one real implementation; tests use a fake. Nothing above this line imports the SDK.
 *
 * `open` resolves once per Link session, on either success or exit — it never yields the raw
 * `public_token`/institution names differently shaped than this; a real access token never reaches the device
 * (the exchange happens server-side, over `public_token`).
 */
export type LinkPlatform = "ios" | "android";

export type PlaidLinkOutcome =
  | { kind: "success"; publicToken: string; institution: { id: string; name: string } | null }
  /** The user closed Link, or it failed to open/run. `errorMessage` is Plaid's own error code (e.g.
   * `INSTITUTION_NOT_RESPONDING`), not free text — never the underlying exception's message. */
  | { kind: "exit"; errorMessage: string | null };

export interface PlaidLinkClient {
  /** False where the native module isn't present (Expo Go, or a build without it). Every other call is then unsafe. */
  isAvailable(): boolean;
  open(linkToken: string): Promise<PlaidLinkOutcome>;
}
