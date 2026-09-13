"use client";

import { useEffect, useState, type ReactNode } from "react";

/** A simple centered modal overlay. Closes on backdrop click or Escape. */
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
      className={`fixed inset-0 z-50 flex items-end justify-center bg-ink/50 transition-opacity duration-200 ease-out motion-reduce:transition-none sm:items-center ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`card max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border p-4 shadow-xl transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none sm:rounded-2xl ${
          entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.98] opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                d="m6 6 12 12M18 6 6 18"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
