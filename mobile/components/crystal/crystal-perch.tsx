import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  type CSSAnimationKeyframes,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { COLOR, ROAM, ROLE, bubbleSide, crystalCheers, crystalLines } from "../../lib/brand/shared";
import { formatSavingsRate } from "../../lib/shared";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { usePlay } from "../motion/reveal";
import { useScrollWatch } from "../motion/scroll-context";
import {
  ARRIVE,
  ARRIVE_AT,
  ARRIVE_FLAP,
  ARRIVE_FLAP_MS,
  ARRIVE_MS,
  BIRD,
  BURST_MS,
  DUST_MS,
  LAND,
  REACT,
  REACT_BEAK,
  REACT_BEAK_MS,
  REACT_BEAK_OPEN,
  REACT_CHIRP,
  REACT_FLAP,
  REACT_MS,
  TOKEN,
  TOKEN_MS,
  burst,
  dust,
} from "./keyframes";
import { facingAt, hopArc, hopProgress, hopWing, peckOffset, placeAt, walkMoving } from "./motion";
import { eventsOf, initialState, planUntil, replanAfterTap, standingAt, trimSteps, type Events, type RoamState, type Step } from "./roam-plan";
import { SpeechBubble } from "./speech-bubble";

/** How far ahead her walk is worked out, and how long before its end the next stretch is added. */
const PLAN_MS = 60_000;
const EXTEND_BEFORE_MS = 20_000;

/** Landing puffs at her feet (the art's feet sit at ~22–30px of her 52px width). */
const DUST = [
  { left: 17, dx: -10 },
  { left: 22, dx: -4 },
  { left: 30, dx: 4 },
  { left: 35, dx: 10 },
];

/** A fixed burst from her head, fanned wide and low so it stays clear of the header above. */
const BURST: { kind: "heart" | "spark"; x: number; y: number; t: number; c?: string }[] = [
  { kind: "heart", x: -38, y: -16, t: 60 },
  { kind: "heart", x: -6, y: -28, t: 120 },
  { kind: "heart", x: 28, y: -20, t: 180 },
  { kind: "spark", x: -50, y: 2, t: 90, c: ROLE.ink },
  { kind: "spark", x: 46, y: -2, t: 150, c: COLOR.silver },
  { kind: "spark", x: -24, y: -30, t: 210, c: COLOR.silver },
  { kind: "spark", x: 14, y: -30, t: 240, c: ROLE.ink },
];
const BURST_KEYFRAMES = BURST.map((p) => burst(p.x, p.y));
const DUST_KEYFRAMES = DUST.map((d) => dust(d.dx));

/** 2px cells: a 5×4 heart and a four-point sparkle (web `.crystal-heart` / `.crystal-spark` box-shadows). */
const HEART: [number, number][] = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]];
const SPARK: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

function Cells({ cells, color }: { cells: [number, number][]; color: string }) {
  return (
    <>
      {cells.map(([x, y]) => (
        <View key={`${x},${y}`} style={{ position: "absolute", left: x * 2, top: y * 2, width: 2, height: 2, backgroundColor: color }} />
      ))}
    </>
  );
}

/** A one-shot entrance piece, starting `at` ms in (under a frozen parity clock, paused there). */
function Once({
  name,
  ms,
  at,
  easing,
  style,
  children,
  testID,
}: {
  name: CSSAnimationKeyframes;
  ms: number;
  at: number;
  easing?: string;
  style?: object;
  children?: ReactNode;
  testID?: string;
}) {
  const timing = useMotionTiming(at);
  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      style={[
        style,
        { animationName: name, animationDuration: `${ms}ms`, animationFillMode: "backwards", ...(easing ? { animationTimingFunction: easing } : null), ...timing },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** The perch's moves on her layers (web `.crystal-arrive .robin-wing-up`, `.crystal-react .robin-*`), held steps. */
const ARRIVE_WING = { kf: ARRIVE_FLAP, ms: ARRIVE_FLAP_MS, delay: ARRIVE_AT };
const REACT_WING = { kf: REACT_FLAP, ms: REACT_MS };
const REACT_BEAK_MOVE = { kf: REACT_BEAK, ms: REACT_BEAK_MS };
const REACT_BEAK_OPEN_MOVE = { kf: REACT_BEAK_OPEN, ms: REACT_BEAK_MS };
const REACT_CHIRP_MOVE = { kf: REACT_CHIRP, ms: REACT_BEAK_MS };

type Speech = { id: number; kind: "tap" | "cheer"; text: string; side: "left" | "right" };

/**
 * Crystal on Home (web src/components/crystal-perch.tsx): she flutters down
 * onto the middle of the Money left card's top edge, lands with a squash and
 * a puff, says hi, then one note on the month. Then she walks the edge
 * (roam-plan.ts): a few small hops at a time, long rests, the odd peck,
 * turning back at each end, and now and then, while she rests, a line of
 * encouragement. A "+$" rises from her beak while the month is saving. Tap
 * her and she jumps, flaps, chirps back, hearts burst, and she says the next
 * line. Her bubbles open toward the middle of the card.
 *
 * The arrival, the bubbles, the tap and her own loops are the web's keyframes
 * (Reanimated CSS animations); the walk is a plan made ahead on the JS
 * thread and played on the UI thread by her own clock (a linear timing,
 * cancelled while paused), which runs only while she is on screen, Home is
 * the screen in front and the app is active. With motion off she sits in the
 * middle with her note on the month.
 */
export function CrystalPerch({
  name,
  savingsRate,
  awake = true,
  layoutKey = "",
}: {
  name: string;
  savingsRate: number | null;
  awake?: boolean;
  /** changes whenever something above the hero appears or goes (the budget warning, the refresh notice): her place on the page is measured again */
  layoutKey?: string;
}) {
  const reduced = useReducedMotion();
  const play = usePlay();
  const frozen = useMotionTiming(0).animationPlayState === "paused";
  const moving = !reduced && play;

  const mood = savingsRate !== null && savingsRate < 0 ? "curious" : "happy";
  const { hello, lines } = crystalLines(name, savingsRate, formatSavingsRate);
  const saving = savingsRate !== null && savingsRate > 0;
  const cheers = useRef<string[]>(crystalCheers(savingsRate));
  useEffect(() => {
    cheers.current = crystalCheers(savingsRate);
  }, [savingsRate]);

  const [taps, setTaps] = useState(0);
  const [speech, setSpeech] = useState<Speech | null>(null);
  const speechIds = useRef(0);

  // ── the walk: planned on the JS thread, played on the UI thread ──
  const [span, setSpan] = useState(0);
  const spanSV = useSharedValue(0);
  // her own clock (ms since she arrived): a linear timing to the plan's end, cancelled while she is paused, so it never skips ahead
  const clock = useSharedValue(0);
  const drawT = useSharedValue(0);
  const wasMoving = useSharedValue(false);
  const events = useSharedValue<Pick<Events, "hops" | "faces" | "pecks">>({ hops: [], faces: [], pecks: [] });
  const cheerAt = useSharedValue<number[]>([]);
  const fired = useSharedValue(0);
  const horizon = useSharedValue(Number.POSITIVE_INFINITY);
  const plan = useRef<{ steps: Step[]; pending: RoamState } | null>(null);
  const planned = useRef<Events>({ hops: [], faces: [], pecks: [], cheers: [] });
  const runningRef = useRef(false);

  const runClock = useCallback(() => {
    const end = horizon.value;
    if (!runningRef.current || !Number.isFinite(end)) return;
    clock.value = withTiming(end, { duration: Math.max(0, end - clock.value), easing: Easing.linear });
  }, [clock, horizon]);

  const publish = useCallback(
    (steps: Step[], pending: RoamState, now: number) => {
      plan.current = { steps, pending };
      const all = eventsOf(steps);
      planned.current = all;
      events.value = { hops: all.hops, faces: all.faces, pecks: all.pecks };
      cheerAt.value = all.cheers.map((c) => c.at);
      fired.value = all.cheers.filter((c) => c.at <= now).length;
      horizon.value = pending.at;
      runClock();
    },
    [events, cheerAt, fired, horizon, runClock],
  );

  // the plan starts once her edge is measured
  useEffect(() => {
    if (span <= 0 || !moving || frozen) return;
    spanSV.value = span;
    // a new width (a rotation) only rescales the same walk
    if (plan.current) return;
    const { steps, pending } = planUntil(initialState(Math.random), clock.value + PLAN_MS, span, Math.random);
    publish(steps, pending, clock.value);
  }, [span, moving, frozen, clock, spanSV, publish]);

  const extend = useCallback(() => {
    const current = plan.current;
    if (!current) return;
    const now = clock.value;
    const more = planUntil(current.pending, now + PLAN_MS, spanSV.value, Math.random);
    // drop what has long finished, never the last hop or turn her pose is read from
    publish([...trimSteps(current.steps, now), ...more.steps], more.pending, now);
  }, [clock, spanSV, publish]);

  const onCheer = useCallback((k: number) => {
    const c = planned.current.cheers[k];
    if (!c) return;
    const list = cheers.current;
    speechIds.current += 1;
    setSpeech({ id: speechIds.current, kind: "cheer", text: list[c.index % list.length]!, side: c.side });
  }, []);

  // each tick of her clock: redraw only while something moves, say a cheer that fell due, plan ahead near the end
  useAnimatedReaction(
    () => clock.value,
    (t) => {
      const ev = events.value;
      const busy = walkMoving(ev.hops, ev.faces, ev.pecks, t);
      if (busy || wasMoving.value) drawT.value = t;
      wasMoving.value = busy;
      const at = cheerAt.value;
      while (fired.value < at.length && at[fired.value]! <= t) {
        scheduleOnRN(onCheer, fired.value);
        fired.value += 1;
      }
      if (t > horizon.value - EXTEND_BEFORE_MS) {
        horizon.value = Number.POSITIVE_INFINITY; // once, until the next stretch is published
        scheduleOnRN(extend);
      }
    },
  );

  // on screen: her edge against the scrolling page (the web's IntersectionObserver)
  const watch = useScrollWatch();
  const trackRef = useRef<View>(null);
  const top = useRef<number | null>(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    if (!watch) return;
    const check = () => {
      if (top.current === null) return;
      const vp = watch.viewport();
      if (vp.height <= 0) return;
      setOnScreen(top.current + BIRD.height > vp.y && top.current < vp.y + vp.height);
    };
    return watch.subscribe(check);
  }, [watch]);

  const running = moving && !frozen && awake && onScreen && span > 0;
  useEffect(() => {
    runningRef.current = running;
    if (running) runClock();
    else cancelAnimation(clock);
    return () => cancelAnimation(clock);
  }, [running, runClock, clock]);

  // where her edge sits on the page, for the on-screen check; her own layout never changes when a block above her
  // comes or goes, so the hero tells her (layoutKey) and she measures again
  const measureTop = useCallback(() => {
    const content = watch?.contentRef.current;
    if (content && trackRef.current)
      trackRef.current.measureLayout(content, (_x, y) => {
        top.current = y;
      });
  }, [watch]);
  useEffect(() => {
    measureTop();
  }, [layoutKey, measureTop]);

  function onTrackLayout(e: LayoutChangeEvent) {
    setSpan(Math.max(0, e.nativeEvent.layout.width - BIRD.width));
    measureTop();
  }

  const tap = () => {
    // she stays where she is for the jump and her line, which opens toward the middle of the card
    const now = clock.value;
    const current = plan.current;
    const f = standingAt(planned.current.hops, now);
    if (current && moving && !frozen) {
      const next = replanAfterTap(current.steps, current.pending, now, now + PLAN_MS, spanSV.value, Math.random);
      publish(next.steps, next.pending, now);
    }
    const line = lines[taps % lines.length]!;
    speechIds.current += 1;
    setSpeech({ id: speechIds.current, kind: "tap", text: line, side: bubbleSide(f) });
    setTaps((n) => n + 1);
    // a tap's line is announced; her cheers are decoration
    AccessibilityInfo.announceForAccessibility(line);
  };

  const moverStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: placeAt(events.value.hops, drawT.value) * spanSV.value }],
  }));
  const arcStyle = useAnimatedStyle(() => {
    const a = hopArc(hopProgress(events.value.hops, drawT.value));
    return { transform: [{ translateY: a.y }, { scaleX: a.sx }, { scaleY: a.sy }] };
  });
  const flipStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: facingAt(events.value.faces, drawT.value) }] }));
  const peckStyle = useAnimatedStyle(() => {
    const d = peckOffset(events.value.pecks, drawT.value);
    return { transform: [{ translateX: d }, { translateY: d }] };
  });
  const wingStyle = useAnimatedStyle(() => ({ opacity: hopWing(hopProgress(events.value.hops, drawT.value)) }));
  const chirpBack = taps > 0 && mood === "happy";
  const tokenSide = useAnimatedStyle(() => ({ transform: [{ translateX: facingAt(events.value.faces, drawT.value) < 0 ? 3 : 37 }] }));

  const hit = (
    <Pressable
      testID="crystal"
      accessibilityRole="button"
      accessibilityLabel="Say hi to Crystal"
      onPress={tap}
      style={{ width: BIRD.width, height: BIRD.height }}
    >
      {moving ? (
        <>
          <Once name={ARRIVE} ms={ARRIVE_MS} at={ARRIVE_AT}>
            <Once name={LAND} ms={ARRIVE_MS} at={ARRIVE_AT} easing="ease-out" style={{ transformOrigin: "50% 100%" }}>
              <Animated.View style={[{ transformOrigin: "50% 100%" }, arcStyle]}>
                <Animated.View style={flipStyle}>
                  <Animated.View style={peckStyle}>
                    <ReactJump key={taps} reacting={taps > 0}>
                      <Robin
                        scale={2}
                        mood={mood}
                        choreography={{
                          // the arrival's wing beats; after a tap, its flaps and chirp back (the robin is keyed per tap)
                          wingUp: taps === 0 ? [ARRIVE_WING] : [REACT_WING],
                          // only a chirping (happy) robin has the beak and marks the chirp back plays on
                          beak: chirpBack ? REACT_BEAK_MOVE : undefined,
                          beakOpen: chirpBack ? REACT_BEAK_OPEN_MOVE : undefined,
                          extra: chirpBack ? REACT_CHIRP_MOVE : undefined,
                          // the walk's hop wing: a UI-thread style, which Robin's layer applies as any view style
                          wingStyle: wingStyle as StyleProp<ViewStyle>,
                        }}
                      />
                    </ReactJump>
                  </Animated.View>
                </Animated.View>
              </Animated.View>
            </Once>
          </Once>
          {/* the arrival's landing puff */}
          {DUST.map((d, i) => (
            <Once key={`arrive-${d.left}`} name={DUST_KEYFRAMES[i]!} ms={DUST_MS} at={520} easing="ease-out" style={dustStyle(d.left)} />
          ))}
          <View key={taps} pointerEvents="none" style={{ position: "absolute", left: 0, top: 0 }}>
            {/* one-cell "+$" steps up from her beak on her chirps, 9.2s and 13.2s in, then every 16s */}
            {saving ? (
              // it follows her beak: 37px in facing right, 3px facing left
              <Animated.View style={tokenSide}>
                {[9200, 13200].map((ms) => (
                  <Token key={ms} at={ms} />
                ))}
              </Animated.View>
            ) : null}
            {taps > 0 ? (
              <>
                <View style={{ position: "absolute", left: 23, top: 6 }}>
                  {BURST.map((p, i) => (
                    <Once key={i} name={BURST_KEYFRAMES[i]!} ms={BURST_MS} at={p.t} style={{ position: "absolute", left: 0, top: 0, opacity: 0 }}>
                      <Cells cells={p.kind === "heart" ? HEART : SPARK} color={p.c ?? COLOR.signal} />
                    </Once>
                  ))}
                </View>
                {DUST.map((d, i) => (
                  <Once key={`tap-${d.left}`} name={DUST_KEYFRAMES[i]!} ms={DUST_MS} at={660} easing="ease-out" style={dustStyle(d.left)} />
                ))}
              </>
            ) : null}
          </View>
        </>
      ) : (
        <Robin mood={mood} scale={2} />
      )}
    </Pressable>
  );

  const middle = bubbleSide(ROAM.startF);
  return (
    // her track: the card's top edge (the hero places it); she walks it on the mover, which only ever translates
    <View
      ref={trackRef}
      testID="crystal-perch"
      pointerEvents="box-none"
      onLayout={onTrackLayout}
      collapsable={false}
      style={{ position: "absolute", left: 16, right: 16, top: -(BIRD.height - 2), height: BIRD.height }}
    >
      <Animated.View pointerEvents="box-none" style={[{ width: BIRD.width }, moving ? moverStyle : { transform: [{ translateX: span * ROAM.startF }] }]}>
        {!moving ? (
          // motion off: her note stays; a tap swaps in its line
          <SpeechBubble
            testID={speech ? "crystal-say-tap" : "crystal-say-note"}
            text={speech?.text ?? lines[0]!}
            side={speech?.side ?? middle}
            atMs={0}
            forMs={0}
            still
          />
        ) : speech ? (
          // a tap's line waits for her jump to land (it would hit a bubble above her)
          <SpeechBubble
            key={speech.id}
            testID={`crystal-say-${speech.kind}`}
            text={speech.text}
            side={speech.side}
            atMs={speech.kind === "tap" ? 850 : 0}
            forMs={speech.kind === "tap" ? 3000 : ROAM.cheerMs - 400}
          />
        ) : (
          <>
            <SpeechBubble testID="crystal-say-hello" text={hello} side={middle} atMs={700} forMs={2600} />
            <SpeechBubble testID="crystal-say-note" text={lines[0]!} side={middle} atMs={3300} forMs={4400} />
          </>
        )}
        {hit}
      </Animated.View>
    </View>
  );
}

const dustStyle = (left: number) => ({ position: "absolute" as const, bottom: 0, left, width: 3, height: 3, backgroundColor: COLOR.silver, opacity: 0 });

/** A tap's jump (`crystal-react`, 900ms, from her feet); nothing before the first tap. */
function ReactJump({ reacting, children }: { reacting: boolean; children: ReactNode }) {
  if (!reacting) return <View>{children}</View>;
  return (
    <Once name={REACT} ms={REACT_MS} at={0} style={{ transformOrigin: "50% 100%" }}>
      {children}
    </Once>
  );
}

/** "+$" in pixel type, rising in 3px steps (`crystal-token`, a 16s loop). */
function Token({ at }: { at: number }) {
  const timing = useMotionTiming(at);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -4,
        left: 0,
        opacity: 0,
        animationName: TOKEN,
        animationDuration: `${TOKEN_MS}ms`,
        animationIterationCount: "infinite",
        animationFillMode: "backwards",
        ...timing,
      }}
    >
      <Text variant="pxTagBold" color={COLOR.signal} style={{ lineHeight: 8, textTransform: "none", letterSpacing: 0 }}>
        +$
      </Text>
    </Animated.View>
  );
}
