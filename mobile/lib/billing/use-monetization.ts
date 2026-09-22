import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import { authFetch } from "../auth/api";
import { useAuth } from "../auth/auth-context";
import type { EntitlementView } from "./contract";
import { loadEntitlement, refreshEntitlement, type EntitlementErrorKind } from "./load-entitlement";
import { createPurchaseFlow, type FlowState } from "./purchase-flow";
import { manageSubscriptionUrl, type Offer } from "./purchases";
import { createRevenueCatPurchases } from "./revenuecat-purchases";

/**
 * The PRODUCT-LEVEL monetization API for screens. A screen (the Get Started experience, a paywall, Settings) uses this
 * and never imports a billing SDK or a provider event type:
 *
 *   const { hasPremium, canStartTrial, startFreeTrial, restorePurchases, manageSubscription } = useMonetization();
 *
 * `hasPremium` comes ONLY from the server's entitlement. `startFreeTrial()` opens the store's own purchase sheet, and
 * access is granted only once the server confirms it — see purchase-flow.ts.
 *
 * The RevenueCat SDK uses only its PUBLIC key on the device. Until store products and keys exist the store is
 * unavailable: `offers` is empty and `startFreeTrial()` reports `unavailable`, with no fabricated configuration.
 */
const API_KEY = Platform.OS === "ios" ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export function useMonetization() {
  const { session } = useAuth();
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const flow = useMemo(
    () =>
      createPurchaseFlow({
        purchases: createRevenueCatPurchases({ apiKey: API_KEY }),
        fetchEntitlement: () => loadEntitlement(() => authFetch("/api/billing/entitlement", sessionRef.current)),
        refreshEntitlement: () => refreshEntitlement(() => authFetch("/api/billing/entitlement/refresh", sessionRef.current, { method: "POST" })),
      }),
    [],
  );

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [entitlement, setEntitlement] = useState<EntitlementView | null>(null);
  const [loadError, setLoadError] = useState<EntitlementErrorKind | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [state, setState] = useState<FlowState>({ kind: "idle" });

  const userId = session?.user.id ?? null;

  const reload = useCallback(async () => {
    const r = await flow.load();
    if (!alive.current) return;
    if (r.status === "ready") {
      setEntitlement(r.entitlement);
      setLoadError(null);
    } else {
      setLoadError(r.kind);
    }
  }, [flow]);

  // On sign-in / app start: identify the SDK, load the server truth, then ask the server to reconcile — which also
  // recovers a purchase completed just before the app was closed.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      await flow.configure(userId).catch(() => {});
      await reload();
      const next = await flow.recover();
      if (cancelled || !alive.current) return;
      if (next.kind === "premium") {
        setEntitlement(next.entitlement);
        setState(next);
      }
      const o = await flow.offers();
      if (!cancelled && alive.current) setOffers(o);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, flow, reload]);

  const apply = useCallback((next: FlowState) => {
    if (!alive.current) return;
    setState(next);
    if (next.kind === "premium") setEntitlement(next.entitlement);
    else if (next.kind === "not_confirmed" && next.entitlement) setEntitlement(next.entitlement);
  }, []);

  /** "Start your 7-day free trial". Defaults to the first offer that carries a free trial. */
  const startFreeTrial = useCallback(
    async (offer?: Offer) => {
      const chosen = offer ?? offers.find((o) => o.trialDays !== null) ?? offers[0];
      if (!chosen) {
        apply({ kind: "unavailable" });
        return;
      }
      apply({ kind: "purchasing" });
      apply(await flow.startPurchase(chosen));
    },
    [flow, offers, apply],
  );

  const restorePurchases = useCallback(async () => apply(await flow.restore()), [flow, apply]);
  const recheck = useCallback(async () => apply(await flow.recover()), [flow, apply]);
  const manageSubscription = useCallback(() => Linking.openURL(manageSubscriptionUrl(entitlement?.store ?? (Platform.OS === "android" ? "google" : "apple"))), [entitlement]);

  return {
    /** The server's verdict — the only thing access may depend on. */
    hasPremium: entitlement?.hasPremium ?? false,
    entitlement,
    canStartTrial: entitlement?.canStartTrial ?? false,
    offers,
    /** What the purchase flow is doing right now (purchasing, pending, cancelled, not_confirmed, error, ...). */
    state,
    loadError,
    startFreeTrial,
    restorePurchases,
    /** Re-check with the server (pending / not_confirmed purchases; foreground return). */
    recheck,
    /** Opens the store's own subscription-management page. */
    manageSubscription,
    reload,
  };
}
