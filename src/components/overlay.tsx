"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";

/** Bottom sheet on phones, centered dialog from `sm`. Closes on backdrop click
 * or Escape. Slides up on open (transform/opacity only, skipped under
 * prefers-reduced-motion). */
export function Overlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Rendered closed, then flipped open a frame later so the transition
  // classes below actually animate instead of starting in their end state.
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] transition-opacity duration-300 ease-out motion-reduce:transition-none sm:items-center ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`card max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none sm:rounded-3xl sm:pt-5 ${
          entered ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-hairline sm:hidden" aria-hidden />
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
