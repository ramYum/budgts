/**
 * Billing configuration (server-only). Reads environment variables lazily so importing this module never throws
 * (a route that is not configured answers with a clear refusal instead of crashing the build).
 *
 *   REVENUECAT_WEBHOOK_SIGNING_SECRET  the HMAC signing secret of the RevenueCat webhook integration
 *   REVENUECAT_WEBHOOK_AUTH            (optional) the exact `Authorization` header value the integration sends
 *   REVENUECAT_SECRET_API_KEY          a SECRET (server-side) REST API key, used only for reconciliation
 *   BILLING_ENVIRONMENT                "production" | "sandbox" — which store environment THIS deployment accepts
 *   RESEND_API_KEY / EMAIL_FROM        transactional email for the trial-end reminder (Resend); both required to send
 *   REMINDER_EMAIL_ALLOWLIST           sandbox only: the ONLY recipients a reminder may reach (addresses or @domain)
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
  /** Transactional email (Resend) for the trial-end reminder. Null = no delivery channel configured. */
  resendApiKey: string | null;
  /** The verified sender, e.g. "Budgts <reminders@budgts.com>". */
  emailFrom: string | null;
  /** Public base URL of THIS deployment, used for links in emails. */
  siteUrl: string;
  /**
   * In a sandbox (staging/dev) deployment real customer email is NEVER sent: only recipients matching this
   * comma-separated list of exact addresses or `@domain` suffixes receive a reminder. Empty = nobody.
   */
  reminderEmailAllowlist: string[];
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
    resendApiKey: clean(env.RESEND_API_KEY),
    emailFrom: clean(env.EMAIL_FROM),
    siteUrl: (clean(env.NEXT_PUBLIC_SITE_URL) ?? "https://budgts.com").replace(/\/+$/, ""),
    reminderEmailAllowlist: (clean(env.REMINDER_EMAIL_ALLOWLIST) ?? "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  };
}
