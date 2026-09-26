"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon, type IconName } from "./icon";

export type RowMenuItem = {
  label: string;
  icon: IconName;
  onSelect: () => void;
  /** a destructive action (archive) reads in the accent */
  danger?: boolean;
  disabled?: boolean;
};

/**
 * A row's overflow menu: the kebab opens a small ink-framed list of actions
 * (Edit, Archive…). Closes on a pick, on Escape (focus returns to the kebab)
 * and on a press anywhere outside it.
 */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className="press grid h-10 w-10 place-items-center text-ink hover:text-graphite"
      >
        <Icon name="menu" />
      </button>
      {open ? (
        <ul
          id={id}
          role="menu"
          aria-label={label}
          className="px-card-ink pop absolute right-0 top-full z-30 mt-1 min-w-44 p-1"
        >
          {items.map((it) => (
            <li key={it.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={`press flex w-full items-center gap-2.5 px-2 py-2 text-left text-[15px] leading-6 hover:bg-surface-2 disabled:opacity-50 ${
                  it.danger ? "text-signal-ink" : "text-ink"
                }`}
              >
                <Icon name={it.icon} />
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
