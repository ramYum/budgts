import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
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
        <div className="brand-mascot-stage flex flex-col items-center gap-2 px-8 py-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand raster, decorative; bakes in the "Budgts" wordmark + tagline */}
          <img
            src="/brand/logo-sunburst.png"
            alt="Budgts — a brighter way to budget"
            width={700}
            height={700}
            style={{ width: 300, height: "auto" }}
          />
        </div>
        <div className="space-y-6">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Welcome to Budgts</h1>
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
