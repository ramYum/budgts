"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./icon";

/** Bottom sheet on phones, centered dialog from `sm`, in the ink frame.
 * Closes on backdrop click or Escape. Slides up on open (transform/opacity
 * only, skipped under prefers-reduced-motion). */
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
      className={`fixed inset-0 z-50 flex items-end justify-center bg-ink/40 transition-opacity duration-300 ease-out motion-reduce:transition-none sm:items-center sm:p-6 ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`px-card-raised max-h-[90dvh] w-full max-w-md overflow-y-auto px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none sm:p-4 ${
          entered ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="px-figure text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="px-step press flex h-9 w-9 shrink-0 items-center justify-center text-ink"
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
