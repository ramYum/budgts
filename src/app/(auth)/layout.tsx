import Link from "next/link";
import { Icon } from "@/components/icon";
import { legalPagesLive } from "@/lib/legal/config";
import { BrandStage } from "./brand-stage";

/** The brand's one big moment: the living pixel robin, the Dogica wordmark
 * and a savings line, centered on the plain canvas above the sign-in card.
 * Under the card, once the legal pages are live (src/lib/legal/config.ts),
 * a quiet line to the Terms and Privacy policy: Google's OAuth consent
 * screen and the stores expect them from the sign-in page. Top left, a quiet
 * way back to the company homepage (what a signed-out visitor sees at /). */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex min-h-dvh w-full flex-col items-center justify-center bg-bg px-6 pb-10 pt-16">
      <Link
        href="/"
        className="press absolute left-4 top-4 inline-flex min-h-9 items-center gap-1 px-2 text-[13px] font-medium text-muted hover:text-ink md:left-8 md:top-7"
      >
        <Icon name="chevron-left" size={12} />
        Home
      </Link>
      <div className="w-full max-w-sm">
        <div className="page-enter mb-8">
          <BrandStage />
        </div>
        <div className="reveal px-card-raised p-5" style={{ ["--i" as string]: 2 }}>
          {children}
        </div>
        {legalPagesLive() ? (
          <p className="reveal mt-4 text-balance text-center text-[13px] leading-5 text-muted" style={{ ["--i" as string]: 3 }}>
            By signing in you agree to the{" "}
            <Link href="/terms" className="font-medium text-ink underline decoration-silver underline-offset-4 hover:decoration-ink">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-ink underline decoration-silver underline-offset-4 hover:decoration-ink">
              Privacy policy
            </Link>
            .
          </p>
        ) : null}
      </div>
    </main>
  );
}
