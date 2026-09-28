import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";

/** The frame for screens that stand outside the signed-in app (offline, the
 * bank's OAuth return, a missing page with no session): the brand top-left,
 * one narrow column centred in the viewport. `align="top"` pins the column
 * under the brand instead, for a multi-step flow (account deletion) whose
 * steps differ in height: its title must not jump from step to step. */
export function StandaloneShell({ children, align = "center" }: { children: ReactNode; align?: "center" | "top" }) {
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <header className="px-6 py-4 md:px-10 md:py-7">
        <Link href="/" aria-label="Budgts home" className="press inline-flex">
          <Logo size={22} />
        </Link>
      </header>
      <main
        className={`mx-auto flex w-full max-w-[472px] flex-1 flex-col px-6 pb-12 md:px-4 ${
          align === "top" ? "justify-start pt-4 md:pt-16" : "justify-center pt-6"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
