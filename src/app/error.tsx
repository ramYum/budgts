"use client";

import { Robin } from "@/components/mascot";
import { StandaloneShell } from "@/components/standalone-shell";
import { Button, LinkButton, Stage } from "@/components/ui";

/**
 * Route-level error boundary. Without it a failed data load (e.g. a Supabase
 * query error that `fetchAllRows` rethrows rather than silently truncating)
 * showed Next's bare "Application error" screen with no way to recover.
 */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StandaloneShell>
      <div className="space-y-6">
        <Stage>
          <Robin mood="curious" size={88} />
          <span className="h-1 w-16 bg-hairline" aria-hidden />
        </Stage>
        <div className="space-y-2">
          <h1 className="px-figure text-ink">Something went wrong</h1>
          <p className="text-base leading-6 text-muted">
            We couldn&apos;t load this page. Your data is safe. Try again, or head back home.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={reset} icon="sync" size="lg">
            Try again
          </Button>
          <LinkButton href="/" variant="secondary" icon="home" size="lg">
            Home
          </LinkButton>
        </div>
      </div>
    </StandaloneShell>
  );
}
