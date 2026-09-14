"use client";

import { useEffect, useState } from "react";

/**
 * A brief, self-dismissing advisory — shows immediately, then hides itself
 * after 5 seconds. Client-only (needs a timer); the caller stays a plain
 * server component that computes `messages` and passes them down.
 */
export function AutoDismissBanner({ messages }: { messages: string[] }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible || messages.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {messages.map((m, i) => (
        <div key={i} className="rounded-md border border-neg/40 bg-neg/5 px-2.5 py-1.5 text-xs text-neg">
          <p>{m}</p>
        </div>
      ))}
    </div>
  );
}
