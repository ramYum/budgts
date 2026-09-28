import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { Robin } from "@/components/mascot";
import { StandaloneShell } from "@/components/standalone-shell";
import { LinkButton, Stage } from "@/components/ui";
import { APPLE_MANAGE_URL, DELETION_SUBSCRIPTION_NOTICE, GOOGLE_MANAGE_URL } from "@/lib/billing/manage";
import { legalPagesLive } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Account deleted" };

/**
 * Where a completed deletion lands, signed out (public in src/proxy.ts). It confirms what happened and, when the
 * deletion endpoint said a store subscription may still be running (`?store=1`), says plainly that deleting did not
 * cancel it and links to the stores' own pages. It reads nothing about any account: it can't, the user is gone.
 */
export default async function AccountDeletedPage({ searchParams }: PageProps<"/account-deleted">) {
  const sp = await searchParams;
  const store = sp.store === "1";
  const legal = legalPagesLive();

  return (
    <StandaloneShell>
      <div className="space-y-6">
        <Stage>
          <Robin mood="sleepy" size={88} />
          <span className="h-1 w-20 bg-hairline" aria-hidden />
        </Stage>
        <div className="space-y-2">
          <h1 className="px-figure text-ink">Your account is deleted</h1>
          <p className="text-pretty text-base leading-6 text-muted">
            Your transactions, budgets, goals and bank connections are gone, and you&apos;re signed out everywhere. Thanks
            for budgeting with us.
          </p>
        </div>

        {store ? (
          <div className="px-warn flex items-start gap-3 p-3" role="status">
            <Icon name="warning" className="text-warn" />
            <p className="text-pretty text-[15px] leading-6 text-ink">
              {DELETION_SUBSCRIPTION_NOTICE} To stop being charged, cancel it in the{" "}
              <a href={APPLE_MANAGE_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                App Store
              </a>{" "}
              or{" "}
              <a href={GOOGLE_MANAGE_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                Google Play
              </a>
              .
            </p>
          </div>
        ) : null}

        <p className="text-pretty text-[13px] leading-5 text-muted">
          If you ever paid for a subscription, we keep those billing records without your email or sign-in details.
          {legal ? (
            <>
              {" "}
              <Link href="/privacy#deleting-your-data" className="font-medium text-ink underline underline-offset-2">
                What we keep and why
              </Link>
              .
            </>
          ) : null}
        </p>

        <LinkButton href="/sign-in" size="lg" className="w-full sm:w-auto">
          Done
        </LinkButton>
      </div>
    </StandaloneShell>
  );
}
