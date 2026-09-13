import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("currency, onboarded_at")
    .eq("id", user.id)
    .single();

  if (profile?.onboarded_at) redirect("/");

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 bg-bg p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="brand-mascot-stage flex flex-col items-center gap-3 px-8 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand raster, decorative */}
          <img src="/brand/icon-badge.png" alt="" width={120} height={120} className="h-[120px] w-[120px]" />
          <Logo size={24} />
        </div>
        <div className="space-y-6">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Welcome to Budgt</h1>
            <p className="text-sm text-muted">
              Let&apos;s make a little space for the life you want. Pick the currency you budget in.
            </p>
          </div>
          <OnboardingForm defaultCurrency={profile?.currency ?? "USD"} />
        </div>
      </div>
    </main>
  );
}
