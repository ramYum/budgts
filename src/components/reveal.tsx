"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * One block of a screen's entrance cascade (globals.css `.reveal`, ordered by
 * `i`). A block already on screen rises in with the page. A block that starts
 * below the fold would otherwise play its whole entrance (cells stepping in,
 * reels rolling) unseen, so it waits, hidden, and plays as it scrolls into
 * view. Server-rendered visible: without JS, or with motion off, every block
 * simply shows.
 */
export function Reveal({ i, className, children }: { i: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.dataset.reveal = "armed";
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.dataset.reveal = "shown";
        io.disconnect();
      },
      // play once it's a little way up the screen, not at the very edge
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${className ?? ""}`} style={{ "--i": i } as CSSProperties}>
      {children}
    </div>
  );
}
