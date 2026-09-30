import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { requireTimeZone } from "@/lib/current-profile";
import { timeZoneLabel } from "@/lib/time-zone-label";
import { displayName } from "@/lib/display/display-name";
import { signInMethods } from "@/lib/user/sign-in-methods";
import { PageHeader } from "@/components/page-header";
import { CopyButton } from "@/components/copy-button";
import { Badge, SectionHead } from "@/components/ui";

export const metadata: Metadata = { title: "Profile" };

/** Basic account information — no internal identifiers exposed (design spec
 * §37). Currency is set once at onboarding; there is no currency-change flow
 * today, so this stays informational rather than offering an edit action
 * that would need to touch financial semantics. The time zone is shown so the
 * month boundaries it decides are never a hidden setting; it follows the
 * device (<TimeZoneSync>), so there is nothing to edit. */
export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  // The sign-in methods come from the session's own verified claims
  // (app_metadata.providers); read only, for display.
  const [{ data: profile }, { data: claims }, timeZone] = await Promise.all([
    supabase.from("profiles").select("currency").eq("id", user.id).single(),
    supabase.auth.getClaims(),
    requireTimeZone(user.id),
  ]);
  const providers = signInMethods((claims?.claims?.app_metadata as { providers?: string[] } | undefined)?.providers);
  const currency = profile?.currency ?? "USD";
  const currencyName = new Intl.DisplayNames(["en"], { type: "currency" }).of(currency) ?? currency;
  const name = displayName(user.email);
  const email = user.email ?? "";
  const signsInWith = providers
    .map((p) => (p === "Email link" ? "an email link" : p))
    .join(" or ");

  return (
    <>
      <PageHeader title="Profile" back="/settings" />
      <div className="space-y-8 md:max-w-[720px]">
        <section className="px-card-raised flex items-center gap-4 p-2 md:p-4" data-testid="profile-card">
          <span className="px-tile-ink flex h-14 w-14 shrink-0 items-center justify-center" aria-hidden>
            <span className="px-figure leading-none text-white">{(name || email || "?")[0]}</span>
          </span>
          <div className="min-w-0">
            <p className="px-figure truncate text-ink" data-testid="profile-name">{name || "You"}</p>
            <p className="text-[15px] leading-6 text-muted">Signs in with {signsInWith}</p>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead title="Details" />
          <dl className="px-card px-rows p-2 md:p-4" data-testid="profile-details">
            <div className="flex items-center gap-3 pb-3">
              <div className="min-w-0 flex-1">
                <dt className="text-[13px] leading-5 text-muted">Email</dt>
                <dd className="truncate text-[15px] font-medium leading-6 text-ink" data-testid="profile-email">{email}</dd>
              </div>
              <CopyButton value={email} label="Copy email" testId="profile-copy-email" />
            </div>
            <div className="py-3">
              <dt className="text-[13px] leading-5 text-muted">Currency</dt>
              <dd className="text-[15px] font-medium leading-6 text-ink" data-testid="profile-currency">
                {currency} · {currencyName}
              </dd>
            </div>
            <div className="py-3">
              <dt className="text-[13px] leading-5 text-muted">Time zone</dt>
              <dd className="text-[15px] font-medium leading-6 text-ink" data-testid="profile-time-zone">{timeZoneLabel(timeZone)}</dd>
            </div>
            <div className="flex items-center gap-3 pt-3">
              <div className="min-w-0 flex-1">
                <dt className="text-[13px] leading-5 text-muted">Sign-in methods</dt>
                <dd className="text-[15px] font-medium leading-6 text-ink" data-testid="profile-methods">{providers.join(" · ")}</dd>
              </div>
              <Badge tone="growth" icon="check" testId="profile-methods-count">
                {providers.length} active
              </Badge>
            </div>
          </dl>
          <p className="text-[13px] leading-5 text-muted">
            Amounts everywhere use your currency. It&apos;s set once, when you start, so every amount keeps its
            meaning.
          </p>
          <p className="text-[13px] leading-5 text-muted">
            Your time zone follows your device, so each month starts at your own midnight.
          </p>
        </section>
      </div>
    </>
  );
}
