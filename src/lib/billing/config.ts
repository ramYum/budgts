/**
 * Billing configuration (server-only). Reads environment variables lazily so importing this module never throws
 * (a route that is not configured answers with a clear refusal instead of crashing the build).
 *
 *   REVENUECAT_WEBHOOK_SIGNING_SECRET  the HMAC signing secret of the RevenueCat webhook integration
 *   REVENUECAT_WEBHOOK_AUTH            (optional) the exact `Authorization` header value the integration sends
 *   REVENUECAT_SECRET_API_KEY          a SECRET (server-side) REST API key, used only for reconciliation
 *   BILLING_ENVIRONMENT                "production" | "sandbox" — which store environment THIS deployment accepts
 *
 * Production and staging must never share values. BILLING_ENVIRONMENT is the fence: a production deployment
 * (`production`) accepts only PRODUCTION store events and quarantines SANDBOX ones; staging/dev (`sandbox`)
 * does the reverse. It is a deployment-time decision, never taken from the request.
 *
 * None of these names is prefixed NEXT_PUBLIC_ — they must never reach a client bundle.
 */

export type BillingEnvironment = "production" | "sandbox";

export interface BillingConfig {
  webhookSigningSecret: string | null;
  webhookAuth: string | null;
  secretApiKey: string | null;
  environment: BillingEnvironment;
  cronSecret: string | null;
}

export function loadBillingConfig(env: Record<string, string | undefined> = process.env): BillingConfig {
  const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  // Unset / unrecognised => "sandbox": the SAFE default is to refuse real-money events, not to accept them.
  const environment: BillingEnvironment = clean(env.BILLING_ENVIRONMENT) === "production" ? "production" : "sandbox";
  return {
    webhookSigningSecret: clean(env.REVENUECAT_WEBHOOK_SIGNING_SECRET),
    webhookAuth: clean(env.REVENUECAT_WEBHOOK_AUTH),
    secretApiKey: clean(env.REVENUECAT_SECRET_API_KEY),
    environment,
    cronSecret: clean(env.CRON_SECRET),
  };
}
