"use client";

import { Fragment, useState, type CSSProperties } from "react";
import { formatSavingsRate } from "@/lib/budget/money";
import { Robin } from "./mascot";

/**
 * Crystal on Home: she flutters down and lands beside your greeting, says hi,
 * then one note on the month, and lives there (chirps, a flutter-hop, a look
 * back at you, two pecks; a "+$" rises from her chirp while the month is
 * saving). Tap her and she jumps, flaps, chirps back, hearts burst, and she
 * says the next line. All motion is CSS (globals.css `crystal-*`); every tap
 * remounts her life loop so the reaction and the loop stay in step. With
 * motion off she sits still with her note on the month.
 */

type Say = { hello: string; lines: string[] };

/** Her lines: a hello, then the month's note first, then a short rotation
 * (one per tap). Copy only; the rate is the dashboard's own figure. */
export function crystalLines(name: string, savingsRate: number | null): Say {
  const hello = name && name.length <= 8 ? `Hi, ${name}!` : "Hi there!";
  if (savingsRate === null) return { hello, lines: ["No income yet", "Tap Income +", "Chirp chirp!"] };
  if (savingsRate < 0) return { hello, lines: ["Spent > earned", "Let's regroup", "We got this!"] };
  return { hello, lines: [`${formatSavingsRate(savingsRate)} saved!`, "Chirp chirp!", "Keep it up!", "Proud of you!"] };
}

const vars = (v: Record<string, string | number>) => v as CSSProperties;

// Landing puffs at her feet (the art's feet sit at ~33–45px of 78).
const DUST = [
  { left: 26, dx: -14 },
  { left: 33, dx: -6 },
  { left: 45, dx: 6 },
  { left: 52, dx: 14 },
];

// A fixed burst from her head (no randomness, so server and client agree),
// fanned wide and low so it stays clear of the header above.
const BURST: { kind: "heart" | "spark"; x: number; y: number; t: number; c?: string }[] = [
  { kind: "heart", x: -38, y: -16, t: 60 },
  { kind: "heart", x: -6, y: -28, t: 120 },
  { kind: "heart", x: 28, y: -20, t: 180 },
  { kind: "spark", x: -50, y: 2, t: 90, c: "var(--ink)" },
  { kind: "spark", x: 46, y: -2, t: 150, c: "var(--silver)" },
  { kind: "spark", x: -24, y: -30, t: 210, c: "var(--silver)" },
  { kind: "spark", x: 14, y: -30, t: 240, c: "var(--ink)" },
];

function Bubble({ say, text, forMs, atMs }: { say: string; text: string; forMs: number; atMs: number }) {
  return (
    <span
      aria-hidden
      data-say={say}
      className="crystal-say pointer-events-none absolute bottom-full right-1 z-[1] whitespace-nowrap"
      style={vars({ "--say-for": `${forMs}ms`, "--say-at": `${atMs}ms` })}
    >
      <span className="pixel-corners font-pixel-bold block bg-ink px-2 py-1 text-[8px] uppercase leading-none text-white">
        {text}
      </span>
      <span className="crystal-tail" />
    </span>
  );
}

export function CrystalPerch({ name, savingsRate }: { name: string; savingsRate: number | null }) {
  const [taps, setTaps] = useState(0);
  const mood = savingsRate !== null && savingsRate < 0 ? "curious" : "happy";
  const { hello, lines } = crystalLines(name, savingsRate);
  const said = taps > 0 ? lines[(taps - 1) % lines.length]! : null;
  const saving = savingsRate !== null && savingsRate > 0;

  return (
    // On desktop the notification bell sits in a row just above: the extra
    // top room keeps her bubbles clear of it. The bubbles anchor to the inner
    // box (her own top), so the room above her is what moves them.
    <div className="-mb-1 shrink-0 pt-1 md:pt-8">
      <div className="relative">
        {said ? (
          // she jumps, chirps back, lands, then speaks (the jump would hit a bubble above her)
          <Bubble key={taps} say="tap" text={said} forMs={3000} atMs={850} />
        ) : (
          <>
            <Bubble say="hello" text={hello} forMs={2600} atMs={700} />
            <Bubble say="note" text={lines[0]!} forMs={4400} atMs={3300} />
          </>
        )}
        <span className="sr-only" aria-live="polite">
          {said ?? ""}
        </span>

        <button
          type="button"
          onClick={() => setTaps((t) => t + 1)}
          aria-label="Say hi to Crystal"
          className="crystal-hit relative block rounded-xl"
        >
          <span className="crystal-arrive block">
            <span className="crystal-land block">
              <span key={taps} className="crystal-life block">
                <span className={`flex ${taps ? "crystal-react" : ""}`}>
                  <Robin mood={mood} size={66} flaps />
                </span>
              </span>
            </span>
          </span>

          {/* the arrival's landing puff */}
          {DUST.map((d) => (
            <span key={d.left} className="crystal-dust" style={vars({ left: d.left, "--dx": `${d.dx}px` })} />
          ))}

          <Fragment key={taps}>
            {/* One-cell "+$" steps up from her beak on the life loop's 8.4s and
                12.4s chirps (facing you, no bubble up): 9.6s and 13.6s after
                she arrives, then every 16s. */}
            {saving
              ? [9200, 13200].map((at) => (
                  <span
                    key={at}
                    aria-hidden
                    className="crystal-token font-pixel-bold absolute left-[56px] top-[-4px] text-[8px] leading-none text-signal"
                    style={vars({ "--at": `${at}ms` })}
                  >
                    +$
                  </span>
                ))
              : null}
            {taps > 0 ? (
              <>
                <span aria-hidden className="crystal-burst absolute left-[35px] top-[10px]">
                  {BURST.map((p, i) => (
                    <span
                      key={i}
                      className={p.kind === "heart" ? "crystal-heart" : "crystal-spark"}
                      style={vars({ "--x": `${p.x}px`, "--y": `${p.y}px`, "--t": `${p.t}ms`, ...(p.c ? { color: p.c } : {}) })}
                    />
                  ))}
                </span>
                {DUST.map((d) => (
                  <span
                    key={d.left}
                    className="crystal-dust"
                    style={vars({ left: d.left, "--dx": `${d.dx}px`, "--at": "660ms" })}
                  />
                ))}
              </>
            ) : null}
          </Fragment>
        </button>
      </div>
    </div>
  );
}
