import type { Metadata } from "next";
import { Robin } from "@/components/mascot";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 p-6">
      <Robin mood="sleepy" size={64} />
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="text-sm text-muted">
        Budgts needs a connection to load your data. Nothing is lost. Reconnect and reopen the app.
      </p>
    </main>
  );
}
