import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { displayName } from "@/lib/user/display-name";
import { PageHeader } from "@/components/page-header";
import { CopyButton } from "@/components/copy-button";
import { Badge, SectionHead } from "@/components/ui";

export const metadata: Metadata = { title: "Profile" };

const PROVIDER_LABEL: Record<string, string> = { email: "Email link", google: "Google" };

/** Basic account information — no internal identifiers exposed (design spec
 * §37). Currency is set once at onboarding; there is no currency-change flow
 * today, so this stays informational rather than offering an edit action
 * that would need to touch financial semantics. */
export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  // The sign-in methods come from the session's own verified claims
  // (app_metadata.providers); read only, for display.
  const [{ data: profile }, { data: claims }] = await Promise.all([
    supabase.from("profiles").select("currency").eq("id", user.id).single(),
    supabase.auth.getClaims(),
  ]);
  const providers = (
    (claims?.claims?.app_metadata as { providers?: string[] } | undefined)?.providers ?? ["email"]
  ).map((p) => PROVIDER_LABEL[p] ?? `${p[0]!.toUpperCase()}${p.slice(1)}`);
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
        <section className="px-card-ink flex items-center gap-4 p-3 md:p-4">
          <span className="px-tile-ink flex h-14 w-14 shrink-0 items-center justify-center" aria-hidden>
            <span className="px-figure leading-none text-white">{(name || email || "?")[0]}</span>
          </span>
          <div className="min-w-0">
            <p className="px-figure truncate text-ink">{name || "You"}</p>
            <p className="text-[15px] leading-6 text-muted">Signs in with {signsInWith}</p>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead title="Details" />
          <dl className="px-card px-rows p-3 md:p-4">
            <div className="flex items-center gap-3 pb-3">
              <div className="min-w-0 flex-1">
                <dt className="text-[13px] leading-5 text-muted">Email</dt>
                <dd className="truncate text-[15px] font-medium leading-6 text-ink">{email}</dd>
              </div>
              <CopyButton value={email} label="Copy email" />
            </div>
            <div className="py-3">
              <dt className="text-[13px] leading-5 text-muted">Currency</dt>
              <dd className="text-[15px] font-medium leading-6 text-ink">
                {currency} · {currencyName}
              </dd>
            </div>
            <div className="flex items-center gap-3 pt-3">
              <div className="min-w-0 flex-1">
                <dt className="text-[13px] leading-5 text-muted">Sign-in methods</dt>
                <dd className="text-[15px] font-medium leading-6 text-ink">{providers.join(" · ")}</dd>
              </div>
              <Badge tone="growth" icon="check">
                {providers.length} active
              </Badge>
            </div>
          </dl>
          <p className="text-[13px] leading-5 text-muted">
            Amounts everywhere use your currency. It&apos;s set once, when you start, so every amount keeps its
            meaning.
          </p>
        </section>
      </div>
    </>
  );
}
