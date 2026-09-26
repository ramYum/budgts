"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icon";
import { Badge } from "./ui";

/** Copies a value, then says so: a green "Copied" chip steps in beside the
 * button for a moment (the result of a copy is otherwise invisible). */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard blocked (permissions, insecure context): nothing to confirm.
    }
  };

  return (
    <span className="flex shrink-0 items-center gap-2">
      <span aria-live="polite">
        {copied ? (
          <Badge tone="growth" icon="check" className="pop">
            Copied
          </Badge>
        ) : null}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className="press grid h-10 w-10 place-items-center text-ink hover:text-graphite"
      >
        <Icon name="copy" />
      </button>
    </span>
  );
}
