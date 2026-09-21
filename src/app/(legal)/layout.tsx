import Link from "next/link";
import { LEGAL_DRAFT } from "./legal-status";

/** Shared frame for the public legal / support pages the native app and the stores link to. No session needed. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <span className="text-lg font-semibold text-heading">Budgts</span>
        <nav className="flex gap-4 text-sm text-muted" aria-label="Legal and support">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
        </nav>
      </header>

      {LEGAL_DRAFT ? (
        <p role="note" className="card mb-6 rounded-2xl border border-hairline p-3 text-sm text-muted">
          Draft: this text describes how Budgts works today but has not been approved as final legal wording. Items marked
          [Owner to confirm] are still open.
        </p>
      ) : null}

      <main className="space-y-4 text-sm leading-relaxed text-body">{children}</main>
    </div>
  );
}
