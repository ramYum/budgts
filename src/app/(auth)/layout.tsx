import Link from "next/link";
import { legalPagesLive } from "@/lib/legal/config";
import { BrandStage } from "./brand-stage";

/** The brand's one big moment: the living pixel robin, the Dogica wordmark
 * and a savings line, centered on the plain canvas above the sign-in card.
 * Under the card, once the legal pages are live (src/lib/legal/config.ts),
 * a quiet line to the Terms and Privacy policy: Google's OAuth consent
 * screen and the stores expect them from the sign-in page. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-bg px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="page-enter mb-8">
          <BrandStage />
        </div>
        <div className="reveal px-card-raised p-5" style={{ ["--i" as string]: 2 }}>
          {children}
        </div>
        {legalPagesLive() ? (
          <p className="reveal mt-4 text-balance text-center text-[13px] leading-5 text-muted" style={{ ["--i" as string]: 3 }}>
            By continuing you agree to the{" "}
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
