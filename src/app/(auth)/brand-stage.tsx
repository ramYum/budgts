import type { CSSProperties } from "react";
import { Robin } from "@/components/mascot";

/** The sign-in brand moment, animated in CSS alone (globals.css `stage-*`,
 * `saving`, `wm-*`, `ticker-*`) on one 8s beat. The robin hops two cells
 * right, chirps, turns, hops two cells left of center, turns back, chirps and
 * hops home, never straying more than 8px from the middle. A "+$" saving
 * rises from each chirp, and the wordmark ripples when the robin lands. A
 * savings line types beneath. Under prefers-reduced-motion it all holds
 * still: robin, wordmark and the first line. */

const vars = (v: Record<string, string | number>) => v as CSSProperties;

// Each rises from the beak as the robin chirps: 1.6s into the beat (standing
// right of center) and 5.6s (standing left); four take two beats to repeat.
const SAVINGS = [
  { text: "+$20", at: 1.6, x: "calc(79% + 8px)" },
  { text: "+$5", at: 5.6, x: "calc(79% - 8px)" },
  { text: "+$12", at: 9.6, x: "calc(79% + 8px)" },
  { text: "+$50", at: 13.6, x: "calc(79% - 8px)" },
];

// One 4s slot each; the ticker keyframes are written for exactly five.
const LINES = [
  "Every dollar has a job.",
  "Small savings add up.",
  "Pay yourself first.",
  "Future you says thanks.",
  "Watch your savings grow.",
];

const WORDMARK = "Budgts";

export function BrandStage() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative pt-10" aria-hidden>
        {SAVINGS.map((s) => (
          <span
            key={s.text}
            className="saving pixel-corners font-pixel-bold absolute top-5 bg-pos px-1.5 py-1 text-[8px] leading-none text-white"
            style={vars({ left: s.x, "--at": `${s.at}s` })}
          >
            {s.text}
          </span>
        ))}
        <div className="stage-wander">
          <div className="stage-hop flex">
            <div className="stage-turn flex">
              <Robin size={88} mood="happy" />
            </div>
          </div>
          <div className="stage-shadow pixel-corners mx-auto mt-1 h-2 w-14 bg-track" />
        </div>
      </div>

      <p className="font-pixel-bold mt-6 text-[32px] leading-none text-ink">
        <span className="sr-only">{WORDMARK}</span>
        <span aria-hidden className="inline-flex">
          {WORDMARK.split("").map((ch, i) => (
            <span key={i} className="wm-letter inline-block" style={vars({ "--i": i })}>
              {ch}
            </span>
          ))}
        </span>
      </p>
      <p className="font-pixel mt-4 text-[8px] uppercase text-muted">
        Track <span className="text-accent">:</span> Plan <span className="text-accent">:</span> Grow
      </p>
      <div className="stage-rule mt-5 h-px w-10 bg-accent" aria-hidden />
      <p className="relative mt-5 h-5 w-full font-mono text-[13px] leading-5 text-muted" aria-hidden>
        {LINES.map((line, k) => (
          <span key={line} className="ticker-line" style={vars({ "--n": line.length, "--k": k })}>
            {line}
          </span>
        ))}
      </p>
    </div>
  );
}
