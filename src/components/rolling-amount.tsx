import type { CSSProperties } from "react";
import { formatMoney } from "@/lib/budget/money";

// One column's reel: 0–9 twice, one per line, so the low digits can spin a
// full lap before they land.
const REEL = "0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n0\n1\n2\n3\n4\n5\n6\n7\n8\n9";

/** Digits counted from the right that spin a lap (ones and cents). */
const LAP_PLACES = 3;

/**
 * A money figure whose digits roll into place like an odometer, then glide to
 * each new value (a sync lands, a month changes). CSS only (globals.css
 * `roll-*`): each digit's resting style IS its final position, so the figure
 * is complete on the server, before hydration and with motion off; no
 * per-frame re-renders. Screen readers (and tests) read the plain formatted
 * text; the reels are aria-hidden.
 *
 * Every digit column keeps its key (its position from the right) across
 * value changes, so a new value rolls each reel instead of remounting it.
 * Takes `currency` rather than a formatter so it can render under Server
 * Components.
 */
export function RollingAmount({ value, currency }: { value: number; currency: string }) {
  const text = formatMoney(value, currency);
  const chars = [...text];
  const digitCount = chars.filter(isDigit).length;
  let seen = 0;

  return (
    <span className="roll">
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {chars.map((ch, i) => {
          const key = chars.length - 1 - i;
          if (!isDigit(ch)) return <span key={`s${key}`}>{ch}</span>;
          const place = digitCount - 1 - seen;
          seen += 1;
          const vars = { "--v": Number(ch), "--lap": place < LAP_PLACES ? 1 : 0, "--c": seen } as CSSProperties;
          return (
            <span key={`d${key}`} className="roll-col" style={vars}>
              <span className="roll-ghost">{ch}</span>
              <span className="roll-reel">{REEL}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}
