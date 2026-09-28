import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, KeyFacts, LegalDoc, P, textLink, type KeyFact } from "@/components/legal/legal-doc";
import { billingLive } from "@/lib/billing/config";
import { FREE_TODAY, SUBSCRIPTION_TERMS, formatPlanPrice } from "@/lib/billing/plans";
import { effectiveLine, requireLegalFacts } from "../require-facts";

export const metadata: Metadata = { title: "Terms of service" };

/**
 * The terms of service. The subscription terms appear only while billing is live on this deployment
 * (`billingLive()`, from the billing configuration the routes already use): until then Budgts is free, and the page says
 * so in one line. Prices and the trial length come from src/lib/billing/plans.ts (launch plan, spec §9: sold only in the
 * apps through Apple and Google, one subscription for the apps and budgts.com, no web checkout). The owner facts come
 * from src/lib/legal/config.ts; without them this page is a 404.
 */
export default function TermsPage() {
  const f = requireLegalFacts();
  const paid = billingLive();
  const trial = `${SUBSCRIPTION_TERMS.trialDays}-day free trial`;
  const facts: KeyFact[] = paid
    ? [
        { icon: "budgets", title: "A budgeting tool", body: "Not financial, tax or legal advice. Check key figures with your bank." },
        { icon: "smartphone", title: "Bought in the app", body: "Subscriptions are billed by Apple or Google, never on the website." },
        { icon: "pending", title: trial.charAt(0).toUpperCase() + trial.slice(1), body: "You start it yourself. Cancel at least 24 hours before it ends and you pay nothing." },
        { icon: "trash", title: "Leave any time", body: "Delete your account whenever you like, in the app or on the web." },
      ]
    : [
        { icon: "budgets", title: "A budgeting tool", body: "Not financial, tax or legal advice. Check key figures with your bank." },
        { icon: "coins", title: "Free today", body: "Before any paid plan starts, we'll update these terms." },
        { icon: "eye", title: "Read-only bank access", body: "Budgts can read your accounts. It can't move money." },
        { icon: "trash", title: "Leave any time", body: "Delete your account whenever you like, in the app or on the web." },
      ];
  const mail = (
    <a href={`mailto:${f.contactEmail}`} className={textLink}>
      {f.contactEmail}
    </a>
  );

  return (
    <LegalDoc
      title="Terms of service"
      effective={effectiveLine(f)}
      intro={
        <P>
          These terms are an agreement between you and {f.entityName} for using Budgts in its apps and at budgts.com. By
          creating an account you accept them.
        </P>
      }
      lead={
        <KeyFacts
          title="The short version"
          facts={facts}
        />
      }
      sections={[
        {
          id: "your-account",
          title: "Your account",
          body: (
            <P>
              You must be at least 18 to use Budgts. Keep your email account and devices secure, because a sign-in link or a
              Google sign-in is how you get into Budgts. You are responsible for what happens in your account and for
              the accuracy of what you enter.
            </P>
          ),
        },
        paid
          ? {
          id: "subscriptions",
          title: "Subscriptions and the free trial",
          body: (
            <Bullets
              items={[
                "Budgts' subscription is sold only in the Budgts apps for iPhone and Android, and billed by Apple or Google. budgts.com has no checkout. One subscription covers the apps and budgts.com.",
                `The plans are ${formatPlanPrice(SUBSCRIPTION_TERMS.monthlyMinor)} a month or ${formatPlanPrice(SUBSCRIPTION_TERMS.annualMinor)} a year in the United States. Your store shows the price in your currency before you buy.`,
                `The ${trial} starts only when you choose to start it. When it ends, the plan you picked begins and renews automatically each month or year until you cancel.`,
                "To avoid the next charge, cancel at least 24 hours before the trial or the current period ends, in your App Store or Google Play account settings. Budgts can't cancel it for you.",
                "Apple and Google handle refunds under their own policies.",
                "Deleting your Budgts account doesn't cancel a store subscription.",
              ]}
            />
          ),
        }
          : { id: "price", title: "Price", body: <P>{FREE_TODAY}</P> },
        {
          id: "your-information",
          title: "Your financial information",
          body: (
            <>
              <P>
                Budgts shows what your connected banks report and what you enter. Banks can report late, incompletely or
                incorrectly, so check important figures with your bank. Budgts is a budgeting tool, not financial, tax,
                investment or legal advice.
              </P>
              <P>
                Bank connections are provided by Plaid, and Budgts can only read your accounts: it can&apos;t move money. How
                we handle your information is in the{" "}
                <Link href="/privacy" className={textLink}>
                  privacy policy
                </Link>
                .
              </P>
            </>
          ),
        },
        {
          id: "acceptable-use",
          title: "Acceptable use",
          body: (
            <Bullets
              items={[
                "Don't try to reach anyone else's data, or get around Budgts' security or subscription checks.",
                "Don't overload, disrupt, copy or reverse engineer the service.",
                "Don't use Budgts for anything unlawful.",
              ]}
            />
          ),
        },
        {
          id: "ending",
          title: "Ending your account",
          body: (
            <P>
              You can delete your account at any time, in the app or on the{" "}
              <Link href="/account-deletion" className={textLink}>
                account deletion page
              </Link>
              . We may suspend or close an account that breaks these terms.
            </P>
          ),
        },
        {
          id: "liability",
          title: "Warranty and liability",
          body: (
            <P>
              Budgts is provided as is. We work hard to keep it accurate and available but can&apos;t promise it will be
              error-free or uninterrupted. To the extent the law allows, {f.entityName} is not liable for indirect or
              consequential losses, and our total liability to you is limited to what you paid for Budgts in the 12 months
              before the claim. Nothing here limits rights you have under the law that can&apos;t be waived.
            </P>
          ),
        },
        {
          id: "law",
          title: "Governing law",
          body: <P>These terms are governed by the laws of {f.governingLaw}.</P>,
        },
        {
          id: "changes",
          title: "Changes and contact",
          body: (
            <P>
              We may update these terms and will change the effective date above. Continuing to use Budgts after a change means
              you accept it. Questions: {mail}, or {f.entityName}, {f.address}.
            </P>
          ),
        },
      ]}
    />
  );
}
