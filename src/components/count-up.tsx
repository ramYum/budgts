"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/budget/money";

const DURATION_MS = 550;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animates a money amount from its previous value up to `value` on mount and
 * on every change — the dashboard's "numbers settle in" entrance (design ask:
 * motion on opening/switching to the dashboard). Starts from 0 on first
 * render so the very first paint (before hydration) already reads as the
 * animation's starting frame, not a flash of the real amount.
 *
 * Takes `currency` rather than a format function: this renders under Server
 * Components (the dashboard), and a function prop can't cross that boundary —
 * only plain serializable values can.
 *
 * Respects `prefers-reduced-motion`: jumps straight to the final value
 * instead of animating.
 */
export function CountUp({
  value,
  currency,
}: {
  value: number;
  currency: string;
}) {
  const [display, setDisplay] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setDisplay(value);
      from.current = value;
      return;
    }

    const start = from.current;
    if (start === value) return;

    const startTime = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, Math.max(0, (now - startTime) / DURATION_MS));
      setDisplay(Math.round(start + (value - start) * easeOutCubic(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    });

    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{formatMoney(display, currency)}</>;
}
