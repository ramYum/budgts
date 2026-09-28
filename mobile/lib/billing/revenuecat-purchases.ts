/**
 * The RevenueCat implementation of the device-side `PurchasesClient`. The SDK is imported LAZILY, so nothing outside a
 * real device build ever loads the native module (tests and any non-store context stay clean), and RevenueCat's
 * vocabulary stays inside this file.
 *
 * Configuration: only RevenueCat's PUBLIC SDK key is used on the device (`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` /
 * `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`). RevenueCat's secret API key, the webhook signing secret and the cron secret
 * exist only on the server and must never appear in the app. Until store products and keys exist, `isAvailable()` is
 * false and the app simply offers nothing — no fabricated live configuration.
 */
import type { Offer, Plan, PurchaseOutcome, PurchasesClient } from "./purchases";

type Sdk = typeof import("react-native-purchases");
type Package = import("react-native-purchases").PurchasesPackage;

const PLAN_BY_PACKAGE: Record<string, Plan> = { MONTHLY: "monthly", ANNUAL: "annual" };

/** The trial length (in days) the store's introductory offer carries, when it is a FREE trial. */
function freeTrialDays(pkg: Package): number | null {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits;
  switch (intro.periodUnit) {
    case "DAY":
      return n;
    case "WEEK":
      return n * 7;
    case "MONTH":
      return n * 30;
    default:
      return null;
  }
}

export function createRevenueCatPurchases(opts: { apiKey: string | null | undefined }): PurchasesClient {
  const apiKey = opts.apiKey?.trim() || null;
  let sdk: Sdk | null = null;
  let configuredFor: string | null = null;

  const load = async (): Promise<Sdk> => (sdk ??= await import("react-native-purchases"));

  return {
    isAvailable: () => apiKey !== null,

    async configure(userId) {
      if (!apiKey) return;
      const { default: Purchases } = await load();
      if (configuredFor === userId) return;
      if (await Purchases.isConfigured()) {
        await Purchases.logIn(userId);
      } else {
        Purchases.configure({ apiKey, appUserID: userId });
      }
      configuredFor = userId;
    },

    async getOffers() {
      if (!apiKey) return [];
      const { default: Purchases } = await load();
      const current = (await Purchases.getOfferings()).current;
      if (!current) return [];
      return current.availablePackages.map(
        (pkg): Offer => ({
          productId: pkg.product.identifier,
          priceString: pkg.product.priceString,
          plan: PLAN_BY_PACKAGE[pkg.packageType] ?? null,
          trialDays: freeTrialDays(pkg),
          handle: pkg,
        }),
      );
    },

    async purchase(offer): Promise<PurchaseOutcome> {
      if (!apiKey) return { kind: "failed", message: "Purchases are not available yet." };
      const { default: Purchases, PURCHASES_ERROR_CODE } = await load();
      try {
        await Purchases.purchasePackage(offer.handle as Package);
        return { kind: "purchased" };
      } catch (err) {
        const e = err as { userCancelled?: boolean | null; code?: string };
        if (e.userCancelled || e.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return { kind: "cancelled" };
        if (e.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return { kind: "pending" };
        return { kind: "failed", message: "The purchase could not be completed. You have not been charged." };
      }
    },

    async restore() {
      if (!apiKey) return;
      const { default: Purchases } = await load();
      await Purchases.restorePurchases();
    },

    async logOut() {
      if (!apiKey) return;
      const { default: Purchases } = await load();
      configuredFor = null;
      if (await Purchases.isConfigured()) await Purchases.logOut().catch(() => {});
    },
  };
}
