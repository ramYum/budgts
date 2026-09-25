"use client";

import Link from "next/link";
import { Robin } from "@/components/mascot";

/**
 * Route-level error boundary. Without it a failed data load (e.g. a Supabase
 * query error that `fetchAllRows` rethrows rather than silently truncating)
 * showed Next's bare "Application error" screen with no way to recover.
 */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 p-6">
      <Robin mood="curious" size={64} />
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted">We couldn&apos;t load this page. Your data is safe. Try again, or head back home.</p>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={reset}
          className="press rounded-xl bg-primary-btn px-4 py-2.5 text-sm font-medium text-on-primary-btn hover:brightness-95"
        >
          Try again
        </button>
        <Link
          href="/"
          className="press rounded-xl border border-ink bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-2"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
