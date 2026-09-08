import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { signOut } from "@/server/auth";
import { Logo } from "@/components/logo";

const NAV = [
  { href: "/", label: "Dashboard", ready: true },
  { href: "/transactions", label: "Transactions", ready: true },
  { href: "/budgets", label: "Budgets", ready: true },
  { href: "/settings", label: "Settings", ready: true },
];

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
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <Logo size={20} />
        <form action={signOut}>
          <button
            type="submit"
            className="text-xs text-muted hover:text-text"
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-md justify-around border-t border-border bg-surface p-2 text-xs">
        {NAV.map((item) =>
          item.ready ? (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1 font-medium hover:bg-surface-2"
            >
              {item.label}
            </Link>
          ) : (
            <span key={item.href} className="px-3 py-1 text-muted/60">
              {item.label}
            </span>
          ),
        )}
      </nav>
    </div>
  );
}
