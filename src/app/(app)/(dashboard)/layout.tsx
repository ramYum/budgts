import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/server/auth";

const NAV = [
  { href: "/", label: "Dashboard", ready: true },
  { href: "/transactions", label: "Transactions", ready: true },
  { href: "/budgets", label: "Budgets", ready: false },
  { href: "/settings", label: "Settings", ready: false },
];

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded_at) redirect("/onboarding");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="font-semibold">Budgts</span>
        <form action={signOut}>
          <button type="submit" className="text-xs opacity-60 hover:opacity-100">
            Sign out
          </button>
        </form>
      </header>

      <main className="flex-1 px-4 pb-24">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-md justify-around border-t border-black/10 bg-background p-2 text-xs dark:border-white/10">
        {NAV.map((item) =>
          item.ready ? (
            <Link key={item.href} href={item.href} className="px-3 py-1">
              {item.label}
            </Link>
          ) : (
            <span key={item.href} className="px-3 py-1 opacity-40">
              {item.label}
            </span>
          ),
        )}
      </nav>
    </div>
  );
}
