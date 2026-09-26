"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { formatSavingsRate } from "@/lib/budget/money";
import { ROAM, bubbleSide, hopLength, nextOuting, type Dir } from "@/lib/crystal/roam";
import { Robin } from "./mascot";

/**
 * Crystal on Home: she flutters down onto the middle of the Money left card's
 * top edge, says hi, then one note on the month. After that she walks the
 * edge (src/lib/crystal/roam.ts): a few small hops at a time, long rests
 * between, the odd peck, turning back at each end, and every so often, while
 * she rests, a line of encouragement. She's there to be noticed, not to pull
 * focus from the figure she stands on, so she stays put while she talks, and
 * pauses whenever the card is off screen or the tab is hidden. Tap her and
 * she jumps, flaps, chirps back, hearts burst, and she says the next line.
 * Her bubbles open toward the middle of the card. Arrival and the tap
 * reaction are CSS (globals.css `crystal-*`); the walk is timed here. With
 * motion off she sits in the middle with her note on the month.
 */

type Say = { hello: string; lines: string[] };

/** Her lines: a hello, then the month's note first, then a short rotation
 * (one per tap). Copy only; the rate is the dashboard's own figure. */
export function crystalLines(name: string, savingsRate: number | null): Say {
  const hello = name && name.length <= 8 ? `Hi, ${name}!` : "Hi there!";
  if (savingsRate === null) return { hello, lines: ["No income yet", "Add income +", "Chirp chirp!"] };
  if (savingsRate < 0) return { hello, lines: ["Spent > earned", "Let's regroup", "We got this!"] };
  return { hello, lines: [`${formatSavingsRate(savingsRate)} saved!`, "Chirp chirp!", "Keep it up!", "Proud of you!"] };
}

/** Her lines of encouragement while she roams, to the month's mood: getting
 * started, regrouping after an overspent month, or keeping a saving month
 * going. Short enough for her bubble (it wraps to two lines on a phone). */
export function crystalCheers(savingsRate: number | null): string[] {
  if (savingsRate === null)
    return ["Add income to begin!", "Every dollar has a job!", "Let's plan together!", "Small steps add up!", "You've got this!"];
  if (savingsRate < 0)
    return ["Tomorrow's a fresh start", "Small cuts add up!", "We can turn it around!", "One step at a time!", "You've got this!"];
  return [
    "You've got this!",
    "Future you says thanks!",
    "Small steps add up!",
    "Every dollar has a job!",
    "Consistency wins!",
    "Keep that streak going!",
  ];
}

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** Her width at 44px tall (the art is 26×22 cells): the walk's span is the
 * edge minus this. Mirrored in globals.css `.crystal-mover`. */
const BIRD_PX = 52;

// Landing puffs at her feet (the art's feet sit at ~22–30px of her 52px width).
const DUST = [
  { left: 17, dx: -10 },
  { left: 22, dx: -4 },
  { left: 30, dx: 4 },
  { left: 35, dx: 10 },
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

// One hop: a crouch, a low arc (9px, well inside the gap above the card), a
// squash on landing. Transform only; runs on the arc layer, under the flip.
const HOP_ARC: Keyframe[] = [
  { transform: "none" },
  { transform: "scale(1.08, 0.9)", offset: 0.14, easing: "cubic-bezier(0, 0.55, 0.45, 1)" },
  { transform: "translateY(-9px) scale(0.96, 1.05)", offset: 0.5, easing: "cubic-bezier(0.55, 0, 1, 0.45)" },
  { transform: "none", offset: 0.84 },
  { transform: "scale(1.06, 0.94)", offset: 0.92 },
  { transform: "none" },
];
// Her wing beats twice through the hop (the robin's raised-wing frame).
const HOP_FLAP: Keyframe[] = [0, 0.14, 0.34, 0.54, 0.74, 1].map((offset, i) => ({
  opacity: i % 2 && offset < 1 ? 1 : 0,
  offset,
  easing: "steps(1, end)",
}));
// Two pecks at the edge, in the pixel-native stepped beat.
const PECK: Keyframe[] = [0, 0.2, 0.4, 0.6, 0.8, 1].map((offset, i) => ({
  transform: i % 2 && offset < 1 ? "translate(3px, 3px)" : "none",
  offset,
  easing: "steps(1, end)",
}));

/** A speech bubble beside her, its stepped tail pointing at her. A longer
 * line wraps (136px wide at most on a phone), so it never runs off screen. */
function Bubble({
  say,
  text,
  forMs,
  atMs,
  side,
}: {
  say: string;
  text: string;
  forMs: number;
  atMs: number;
  side: "left" | "right";
}) {
  return (
    <span
      aria-hidden
      data-say={say}
      data-side={side}
      className={`crystal-say pointer-events-none absolute top-[6px] z-[1] w-max max-w-[136px] md:max-w-[240px] ${
        side === "left" ? "right-full mr-2" : "left-full ml-2"
      }`}
      style={vars({ "--say-for": `${forMs}ms`, "--say-at": `${atMs}ms` })}
    >
      <span className="px-badge-ink px-tag-bold block text-balance px-2 py-[3px] leading-3 text-white">{text}</span>
      <span className="crystal-tail" />
    </span>
  );
}

export function CrystalPerch({
  name,
  savingsRate,
  className,
}: {
  name: string;
  savingsRate: number | null;
  /** places her track: the full width of the card's top edge */
  className?: string;
}) {
  const [taps, setTaps] = useState(0);
  // what she's saying after her arrival: a tap's line or a cheer
  const [speech, setSpeech] = useState<{
    id: number;
    kind: "tap" | "cheer";
    text: string;
    side: "left" | "right";
  } | null>(null);
  const mood = savingsRate !== null && savingsRate < 0 ? "curious" : "happy";
  const { hello, lines } = crystalLines(name, savingsRate);
  const saving = savingsRate !== null && savingsRate > 0;
  // her cheers follow the month on screen (read by the walk below)
  const cheers = useRef<string[]>([]);
  useEffect(() => {
    cheers.current = crystalCheers(savingsRate);
  }, [savingsRate]);
  const speechIds = useRef(0);

  const trackRef = useRef<HTMLDivElement>(null);
  const moverRef = useRef<HTMLDivElement>(null);
  const arcRef = useRef<HTMLSpanElement>(null);
  const poseRef = useRef<HTMLSpanElement>(null);
  // where she stands (0 left end … 1 right end), until when she stays put,
  // and when she last spoke; shared by the walk and a tap
  const at = useRef<{ f: number; holdUntil: number; lastSaid: number }>({ f: ROAM.startF, holdUntil: 0, lastSaid: 0 });

  useEffect(() => {
    const track = trackRef.current;
    const mover = moverRef.current;
    const arc = arcRef.current;
    const pose = poseRef.current;
    if (!track || !mover || !arc || !pose || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const wing = mover.querySelector<SVGGElement>(".robin-wing-up");
    const pos = at.current;
    pos.holdUntil = Math.max(pos.holdUntil, performance.now() + ROAM.firstOutingMs);
    // her arrival's hello and note end at 7.7s: the first cheer counts from there
    pos.lastSaid = Math.max(pos.lastSaid, performance.now() + 7700);
    let dir: Dir = Math.random() < 0.5 ? -1 : 1;
    let cheer = 0;
    let timer: number | undefined;
    let onScreen = true;
    let asleep = false;

    const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    const later = (fn: () => void, ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, ms);
    };
    const awake = () => onScreen && document.visibilityState === "visible";
    const facing = (d: Dir) => (d < 0 ? "left" : "right");

    // a line of encouragement, at most every cheerEveryMs, while she rests
    const say = () => {
      const list = cheers.current;
      speechIds.current += 1;
      setSpeech({ id: speechIds.current, kind: "cheer", text: list[cheer++ % list.length]!, side: bubbleSide(pos.f) });
      pos.lastSaid = performance.now();
      pos.holdUntil = Math.max(pos.holdUntil, pos.lastSaid + ROAM.cheerMs);
    };

    const rest = () => {
      const now = performance.now();
      if (now - pos.lastSaid >= ROAM.cheerEveryMs && now >= pos.holdUntil) say();
      const ms = between(ROAM.restMs[0], ROAM.restMs[1]);
      if (Math.random() < 0.4) {
        later(() => {
          pose.animate(PECK, { duration: 700 });
          later(outing, ms / 2);
        }, ms / 2);
      } else later(outing, ms);
    };

    const outing = () => {
      if (!awake()) {
        asleep = true; // wakes on screen again (below)
        return;
      }
      const wait = pos.holdUntil - performance.now();
      if (wait > 0) return later(outing, wait);
      const span = track.clientWidth - BIRD_PX;
      if (span <= 0) return rest();

      const hops = Math.floor(between(ROAM.hops[0], ROAM.hops[1] + 1));
      const plan = nextOuting(pos.f, dir, hopLength(span) / span, hops);
      const turning = mover.dataset.facing !== facing(plan.dir);
      dir = plan.dir;
      mover.dataset.facing = facing(dir);

      let i = 0;
      const hop = () => {
        // a tap mid-outing stops her where she lands; so does leaving the screen
        if (i >= plan.stops.length || pos.holdUntil > performance.now() || !awake()) return rest();
        pos.f = plan.stops[i++]!;
        mover.style.setProperty("--f", String(pos.f));
        arc.animate(HOP_ARC, { duration: ROAM.hopMs });
        wing?.animate(HOP_FLAP, { duration: ROAM.hopMs });
        later(hop, ROAM.hopMs + ROAM.hopGapMs);
      };
      later(hop, turning ? ROAM.turnMs : 0);
    };

    const wake = () => {
      if (!asleep || !awake()) return;
      asleep = false;
      rest();
    };
    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      wake();
    });
    io.observe(track);
    document.addEventListener("visibilitychange", wake);
    later(outing, 0);

    return () => {
      window.clearTimeout(timer);
      io.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  const tap = () => {
    // she stays where she is for the jump and her line, which opens toward
    // the middle of the card
    const now = performance.now();
    at.current.holdUntil = now + ROAM.tapHoldMs;
    at.current.lastSaid = now + 850;
    speechIds.current += 1;
    setSpeech({ id: speechIds.current, kind: "tap", text: lines[taps % lines.length]!, side: bubbleSide(at.current.f) });
    setTaps((t) => t + 1);
  };

  return (
    // Her track: the card's top edge (the parent places it). She walks it on
    // the mover, which only ever translates.
    <div ref={trackRef} className={`@container pointer-events-none h-11 ${className ?? ""}`}>
      <div
        ref={moverRef}
        data-facing="right"
        className="crystal-mover pointer-events-auto relative w-[52px]"
        style={vars({ "--f": ROAM.startF })}
      >
        {speech ? (
          // a tap's line waits for her jump to land (it would hit a bubble above her)
          <Bubble
            key={speech.id}
            say={speech.kind}
            text={speech.text}
            forMs={speech.kind === "tap" ? 3000 : ROAM.cheerMs - 400}
            atMs={speech.kind === "tap" ? 850 : 0}
            side={speech.side}
          />
        ) : (
          <>
            <Bubble say="hello" text={hello} forMs={2600} atMs={700} side={bubbleSide(ROAM.startF)} />
            <Bubble say="note" text={lines[0]!} forMs={4400} atMs={3300} side={bubbleSide(ROAM.startF)} />
          </>
        )}
        {/* a tap's line is announced; her cheers are decoration */}
        <span className="sr-only" aria-live="polite">
          {speech?.kind === "tap" ? speech.text : ""}
        </span>

        <button type="button" onClick={tap} aria-label="Say hi to Crystal" className="crystal-hit relative block">
          <span className="crystal-arrive block">
            <span className="crystal-land block">
              <span ref={arcRef} className="crystal-arc block">
                <span className="crystal-flip block">
                  <span ref={poseRef} className="block">
                    <span key={taps} className={`flex ${taps ? "crystal-react" : ""}`}>
                      <Robin mood={mood} size={44} flaps />
                    </span>
                  </span>
                </span>
              </span>
            </span>
          </span>

          {/* the arrival's landing puff */}
          {DUST.map((d) => (
            <span key={d.left} className="crystal-dust" style={vars({ left: d.left, "--dx": `${d.dx}px` })} />
          ))}

          <Fragment key={taps}>
            {/* One-cell "+$" steps up from her beak on her chirps, 9.6s and
                13.6s after she arrives, then every 16s (it follows her beak
                when she faces left, globals.css). */}
            {saving
              ? [9200, 13200].map((ms) => (
                  <span
                    key={ms}
                    aria-hidden
                    className="crystal-token font-pixel-bold absolute top-[-4px] text-[8px] leading-none text-signal"
                    style={vars({ "--at": `${ms}ms` })}
                  >
                    +$
                  </span>
                ))
              : null}
            {taps > 0 ? (
              <>
                <span aria-hidden className="crystal-burst absolute left-[23px] top-[6px]">
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
