import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { signOut } from "@/server/auth";
import { Logo } from "@/components/logo";
import { BottomNav } from "@/components/bottom-nav";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded_at) redirect("/onboarding");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-bg/90 px-4 py-3 backdrop-blur">
        <Logo size={20} />
        <form action={signOut}>
          <button
            type="submit"
            className="text-xs text-muted transition-colors hover:text-text"
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">{children}</main>

      <BottomNav />
    </div>
  );
}
