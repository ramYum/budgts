import type { Metadata } from "next";
import { Icon } from "@/components/icon";
import { Robin } from "@/components/mascot";
import { StandaloneShell } from "@/components/standalone-shell";
import { Badge, Stage, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Offline" };

/** What the service worker serves when a page can't load (public/sw.js):
 * Crystal asleep on her stage, what happened, and one way back. */
export default function OfflinePage() {
  return (
    <StandaloneShell>
      <div className="space-y-6">
        <Stage>
          <Robin mood="sleepy" size={88} />
          <span className="h-1 w-20 bg-hairline" aria-hidden />
        </Stage>
        <div className="space-y-2">
          <Badge tone="gray" icon="disconnect">
            No connection
          </Badge>
          <h1 className="px-figure text-ink">You&apos;re offline</h1>
          <p className="text-base leading-6 text-muted">
            Budgts needs a connection to load your data. Nothing is lost. Reconnect and it picks up right where you
            left off.
          </p>
        </div>
        {/* The service worker serves this page in place of the one that failed
            to load, at that page's own URL (public/sw.js). An empty href is
            that URL: a full load of the page they wanted, with or without JS. */}
        <a href="" className={buttonClass("primary", "", "lg")}>
          <Icon name="sync" />
          Try again
        </a>
      </div>
    </StandaloneShell>
  );
}
