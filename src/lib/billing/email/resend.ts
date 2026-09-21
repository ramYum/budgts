/**
 * The trial-end reminder as TRANSACTIONAL EMAIL through Resend — an implementation of the provider-neutral
 * `ReminderDelivery` port (reminders.ts). Nothing else in the billing domain knows Resend exists.
 *
 * Verified against Resend's documentation: `POST https://api.resend.com/emails` with `Authorization: Bearer <key>`,
 * a JSON body of from / to / subject / html / text / tags, and an `Idempotency-Key` header (unique per request,
 * expires after 24 hours, at most 256 characters). A verified domain that Budgts owns is required to send from an
 * address at it; that DNS step is an owner action (docs/specs/2026-09-21-v1-monetization-design.md).
 *
 * Safety:
 *  - The reminder claim in reminders.ts already guarantees one reminder per trial; the Idempotency-Key
 *    (`trial-reminder:<user>:<trial end>`) is a second, provider-side guard against a duplicate send after a crash.
 *  - A sandbox deployment (staging/dev) NEVER emails real customers: only allow-listed recipients are reachable.
 *  - A failure THROWS, which makes the sweep release the claim and retry. This code never touches entitlement state.
 *  - Transactional only: a single one-off notice about a subscription about to begin — no marketing content.
 */
import type { BillingConfig } from "../config";
import type { Db } from "../db";
import { manageSubscriptionPageUrl, manageUrlFor } from "../manage";
import { composeTrialEndReminder, type ReminderDelivery, type ReminderPayload } from "../reminders";

export class ReminderUndeliverableError extends Error {}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface ReminderEmail {
  subject: string;
  text: string;
  html: string;
  manageUrl: string;
}

/** The email for one reminder. The manage link goes to a public Budgts page, so it works with no sign-in. */
export function composeReminderEmail(p: ReminderPayload, siteUrl: string): ReminderEmail {
  const { title, body } = composeTrialEndReminder(p);
  const manageUrl = manageSubscriptionPageUrl(siteUrl, p.store);
  const storeUrl = manageUrlFor(p.store);
  const text = [
    body,
    "",
    `Manage or cancel your subscription: ${manageUrl}`,
    storeUrl ? `Or go straight to your store: ${storeUrl}` : "",
    "",
    "You're receiving this one-time notice because you started a free trial of Budgts.",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#FFF8F0;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">${esc(body)}</p>
<p style="margin:0 0 20px"><a href="${esc(manageUrl)}" style="display:inline-block;background:#1f1f1f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:15px">Manage subscription</a></p>
<p style="font-size:13px;color:#666;line-height:1.5;margin:0">You're receiving this one-time notice because you started a free trial of Budgts. Prefer to go straight to the store? <a href="${esc(storeUrl ?? manageUrl)}" style="color:#666">Open your subscription settings</a>.</p>
</div></body></html>`;
  return { subject: title, text, html, manageUrl };
}

/** Is this recipient reachable from THIS deployment? Production: everyone. Sandbox: only the allow-list. */
export function recipientAllowed(email: string, config: Pick<BillingConfig, "environment" | "reminderEmailAllowlist">): boolean {
  if (config.environment === "production") return true;
  const e = email.trim().toLowerCase();
  return config.reminderEmailAllowlist.some((entry) => (entry.startsWith("@") ? e.endsWith(entry) : e === entry));
}

export interface ResendDeliveryDeps {
  db: Db;
  config: BillingConfig;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Null when no channel is configured (no key or no verified sender): the sweep then reports and claims nothing. */
export function createResendReminderDelivery(deps: ResendDeliveryDeps): ReminderDelivery | null {
  const { apiKey, from } = { apiKey: deps.config.resendApiKey, from: deps.config.emailFrom };
  if (!apiKey || !from) return null;
  return {
    async deliver(payload: ReminderPayload): Promise<void> {
      const [row] = await deps.db.query<{ email: string | null }>(`select email from auth.users where id = $1`, [payload.userId]);
      const to = row?.email?.trim();
      if (!to) throw new ReminderUndeliverableError("the account has no email address");
      if (!recipientAllowed(to, deps.config)) throw new ReminderUndeliverableError("recipient not allowed in a sandbox deployment");

      const mail = composeReminderEmail(payload, deps.config.siteUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 10_000);
      try {
        const res = await (deps.fetchImpl ?? fetch)("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `trial-reminder:${payload.userId}:${payload.trialEndsAt.getTime()}`,
          },
          body: JSON.stringify({ from, to: [to], subject: mail.subject, html: mail.html, text: mail.text, tags: [{ name: "category", value: "trial_reminder" }] }),
          signal: controller.signal,
        });
        // Status only: the response body can echo the recipient address.
        if (!res.ok) throw new Error(`Resend rejected the reminder (HTTP ${res.status})`);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
