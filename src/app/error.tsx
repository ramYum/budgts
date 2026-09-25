"use client";

import Link from "next/link";

/**
 * Route-level error boundary. Without it a failed data load (e.g. a Supabase
 * query error that `fetchAllRows` rethrows rather than silently truncating)
 * showed Next's bare "Application error" screen with no way to recover.
 */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">
        We couldn&apos;t load this page. Your data is safe — try again, or head back home.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-primary-btn px-4 py-2 text-sm font-semibold text-on-primary-btn"
        >
          Try again
        </button>
        <Link href="/" className="rounded-full border border-hairline px-4 py-2 text-sm font-semibold">
          Home
        </Link>
      </div>
    </main>
  );
}
