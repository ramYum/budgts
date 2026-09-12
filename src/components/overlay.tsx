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
      className={`fixed inset-0 z-50 flex items-end justify-center bg-pine/50 transition-opacity duration-200 ease-out motion-reduce:transition-none sm:items-center ${
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
        <h2 className="mb-3 text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
