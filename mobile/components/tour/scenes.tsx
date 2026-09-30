import { useMemo, useState, type ReactNode } from "react";
import { Text as RNText, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, { steps } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { COLOR, ROLE, type IconName } from "../../lib/brand/shared";
import { textStyle } from "../../lib/brand/type";
import { formatMoney } from "../../lib/shared";
import type { TourStepId } from "../../lib/tour/shared";
import { pixelCornersPath } from "../brand/brand-stage";
import { IconTile } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { ProgressBar } from "../kit/progress-bar";
import { CategoryIcon } from "../kit/tiles";
import { RollingAmount } from "../motion/rolling-amount";
import {
  AMOUNT_IN,
  BLINK,
  CARRY,
  COIN,
  DROP,
  EASE_OUT,
  FEED_LAND,
  FLIP_IN,
  FLOW,
  GOT_IT,
  HOP,
  POP,
  REMEMBER,
  RISE,
  SHOW_SORTED,
  SHOW_UNSORTED,
  SORTED_POP,
  SQUASH,
  STEP1,
  STEPS3,
  TRAIL,
  TWINKLE,
  burst,
  dust,
  feed,
  slot,
  tabsTour,
} from "./guide-keyframes";
import { useKeyframes, type AnimationOptions, type Keyframes } from "./motion";
import { SCENE_HEIGHT } from "./tour-card";

/**
 * The vignette at the top of each welcome-guide card (web src/components/tour/scenes.tsx), built from the app's real
 * parts (category tiles, square-cell progress, the Money Left figure, the tab bar) so the guide previews what the user
 * will see. Each acts out its feature with the web's keyframes (guide.module.css: Crystal drops in, purchases land, "?"
 * flips to its category, Money Left rolls up, a saving lands on a goal, confetti and the four tabs). Every base style is
 * the finished state, which is what shows with motion off. Decorative: the card's heading and body carry the meaning.
 *
 * The sample figures are fixed preview amounts in the user's currency, formatted for display only; Money Left's preview
 * is the web's own `IN - OUT`, so the arithmetic shown is the real rule.
 */
export function GuideScene({ id, currency }: { id: TourStepId; currency: string }) {
  switch (id) {
    case "crystal":
      return <CrystalScene />;
    case "welcome":
      return <WelcomeScene />;
    case "auto-capture":
      return <CaptureScene currency={currency} />;
    case "currency":
      return <CurrencyScene currency={currency} />;
    case "bank":
      return <BankScene />;
    case "auto-sort":
      return <SortScene currency={currency} />;
    case "money-left":
      return <MoneyLeftScene currency={currency} />;
    case "plan":
      return <PlanScene currency={currency} />;
    case "done":
      return <DoneScene />;
  }
}

// ─── shared parts ───────────────────────────────────────────────────────────

/** A view playing one of the guide's keyframes (or resting, with motion off). */
function Anim({ kf, o, style, testID, children }: { kf: Keyframes; o: AnimationOptions; style?: StyleProp<ViewStyle>; testID?: string; children?: ReactNode }) {
  const motion = useKeyframes(kf, o);
  return (
    <Animated.View testID={testID} pointerEvents="none" style={[style, motion]}>
      {children}
    </Animated.View>
  );
}

/** Arbitrary-size web text (`text-[13px]` and friends) inherits the page's 1.5 line height. */
const lh = (size: number) => size * 1.5;

/** `font-pixel text-[8px] uppercase text-muted`: Dogica Pixel, 0.06em tracking, its spaces untrimmed (not a title). */
function PixelLabel({ children, color = ROLE.muted, style }: { children: string; color?: string; style?: StyleProp<TextStyle> }) {
  return <RNText style={[textStyle("pxTag"), { letterSpacing: 0.48, lineHeight: 12, color }, style]}>{children}</RNText>;
}

/** `pixel-corners font-pixel-bold px-2 py-1.5 text-[8px] leading-none text-white`: a tag with 2px-stepped corners. */
function Chip({ children, fill = ROLE.ink, icon, style }: { children: string; fill?: string; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  function measure(e: LayoutChangeEvent) {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize((p) => (p && p.w === w && p.h === h ? p : { w, h }));
  }
  return (
    <View onLayout={measure} style={[{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 6, alignSelf: "flex-start" }, style]}>
      {size ? (
        <Svg width={size.w} height={size.h} style={{ position: "absolute", left: 0, top: 0 }}>
          <Path d={pixelCornersPath(size.w, size.h)} fill={fill} />
        </Svg>
      ) : null}
      {icon ? <Icon name={icon} size={12} color={COLOR.white} /> : null}
      <RNText style={[textStyle("pxTagBold"), { letterSpacing: 0, lineHeight: 8, textTransform: "none", color: COLOR.white }]}>{children}</RNText>
    </View>
  );
}

/** A square with 2px-stepped corners holding a 12px icon (the bank's lock, the sorted check). */
function Badge({ fill, icon }: { fill: string; icon: IconName }) {
  return (
    <View style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
      <Svg width={20} height={20} style={{ position: "absolute", left: 0, top: 0 }}>
        <Path d={pixelCornersPath(20, 20)} fill={fill} />
      </Svg>
      <Icon name={icon} size={12} color={COLOR.white} />
    </View>
  );
}

/** The speech tail under a bubble: a 4px ink cell and its stepped twin 2px down and out (web `.tail`, `.tailRight`). */
function Tail({ right = false }: { right?: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", bottom: -5, [right ? "right" : "left"]: 3, width: 6, height: 6 }}>
      <View style={{ position: "absolute", top: 0, [right ? "right" : "left"]: 2, width: 4, height: 4, backgroundColor: ROLE.ink }} />
      <View style={{ position: "absolute", top: 2, [right ? "right" : "left"]: 0, width: 4, height: 4, backgroundColor: ROLE.ink }} />
    </View>
  );
}

/** Signed amount in the app's style (web scenes `Amount`): "−" for money out, "+" for money in, 13px medium tabular. */
function Amount({ minor, currency, color = ROLE.text }: { minor: number; currency: string; color?: string }) {
  return (
    <Text variant="metaStrong" color={color} style={{ lineHeight: lh(13), letterSpacing: -0.13, fontVariant: ["tabular-nums"] }}>
      {`${minor < 0 ? "−" : "+"}${formatMoney(Math.abs(minor), currency)}`}
    </Text>
  );
}

/** A 13px name over an 11px line (a purchase row's two lines). */
function RowText({ name, children }: { name: string; children: ReactNode }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text variant="metaStrong" numberOfLines={1} style={{ lineHeight: lh(13) }}>
        {name}
      </Text>
      {children}
    </View>
  );
}

const small = (color: string): StyleProp<TextStyle> => [textStyle("caption"), { fontSize: 11, lineHeight: lh(11), color }];

/** A 4px path dot (`.dot`), gray, with its red light over it (`.dot::after`), dark at rest. */
function PathDot({ light }: { light: { kf: Keyframes; o: AnimationOptions } }) {
  return (
    <View style={{ width: 4, height: 4, backgroundColor: COLOR.gray }}>
      <Anim kf={light.kf} o={light.o} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: COLOR.signal, opacity: 0 }} />
    </View>
  );
}

/** The scene stage's measured width (the sparkles, confetti and tab pip are placed by it). */
function useWidth(): [number | null, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState<number | null>(null);
  return [width, (e) => setWidth(e.nativeEvent.layout.width)];
}

// ─── Crystal introduces herself ─────────────────────────────────────────────

const SPARKLES = [
  { x: 0.16, y: 0.2, c: COLOR.signal },
  { x: 0.82, y: 0.16, c: COLOR.silver },
  { x: 0.1, y: 0.62, c: COLOR.silver },
  { x: 0.88, y: 0.56, c: COLOR.signal },
  { x: 0.26, y: 0.84, c: ROLE.ink },
];
const DUST = [
  { x: 0.34, kf: dust(-16) },
  { x: 0.42, kf: dust(-7) },
  { x: 0.6, kf: dust(7) },
  { x: 0.68, kf: dust(16) },
];

/** `.sparkle`: a 3px cell and its four neighbours, a four-point pixel star. */
const SPARKLE_PATH = "M3 0h3v3h3v3h-3v3h-3v-3h-3v-3h3z";
const STEPS4 = steps(4, "jump-end");

const CRYSTAL_SIZE = 104;
const CRYSTAL_WIDTH = Math.round(CRYSTAL_SIZE * (26 / 22));

function CrystalScene() {
  const [width, measure] = useWidth();
  return (
    <View testID="scene-crystal" onLayout={measure} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      {width
        ? SPARKLES.map((p, i) => (
            <Anim
              key={i}
              kf={TWINKLE}
              o={{ duration: 2600, delay: i * 420 + 1150, easing: STEPS4, iterations: "infinite" }}
              style={{ position: "absolute", left: p.x * width - 3, top: p.y * SCENE_HEIGHT - 3, width: 9, height: 9 }}
            >
              <Svg width={9} height={9}>
                <Path d={SPARKLE_PATH} fill={p.c} />
              </Svg>
            </Anim>
          ))
        : null}
      <View>
        {/* a gravity drop, a squash on landing, one bounce, a dust puff */}
        <Anim testID="crystal-drop" kf={DROP} o={{ duration: 1150, delay: 150 }}>
          <Anim kf={SQUASH} o={{ duration: 1150, delay: 150, easing: "ease-out" }} style={{ transformOrigin: "50% 100%" }}>
            <Robin size={CRYSTAL_SIZE} mood="happy" />
          </Anim>
        </Anim>
        {DUST.map((d) => (
          <Anim
            key={d.x}
            kf={d.kf}
            o={{ duration: 620, delay: 560, easing: "ease-out" }}
            style={{ position: "absolute", bottom: 0, left: d.x * CRYSTAL_WIDTH, width: 4, height: 4, backgroundColor: COLOR.silver, opacity: 0 }}
          />
        ))}
        <Anim
          kf={POP}
          o={{ duration: 330, delay: 1000, easing: STEPS3 }}
          style={{ position: "absolute", top: -20, left: 0.84 * CRYSTAL_WIDTH, transformOrigin: "0% 100%" }}
        >
          <Chip>Hi!</Chip>
          <Tail />
        </Anim>
      </View>
      <Anim kf={RISE} o={{ duration: 520, delay: 1150, easing: EASE_OUT }} style={{ marginTop: 16, alignItems: "center", gap: 8 }}>
        <RNText style={[textStyle("pxTagBold"), { letterSpacing: 0, textTransform: "none", color: ROLE.ink }]}>CRYSTAL</RNText>
        <PixelLabel>Your budget buddy</PixelLabel>
      </Anim>
    </View>
  );
}

// ─── What Budgts does: Track · Plan · Grow ──────────────────────────────────

const PILLARS: { name: string; icon: IconName; tone: "gray" | "accent" }[] = [
  { name: "Track", icon: "activity", tone: "gray" },
  { name: "Plan", icon: "budgets", tone: "gray" },
  { name: "Grow", icon: "leaf", tone: "accent" },
];

function WelcomeScene() {
  return (
    <View testID="scene-welcome" style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 12, paddingTop: 76 }}>
      {PILLARS.map(({ name, icon, tone }, p) => (
        <View key={name} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          {p > 0 ? (
            <View style={{ marginTop: 26, flexDirection: "row", gap: 4 }}>
              {/* value flows along the path once the three ideas are in */}
              {Array.from({ length: 4 }, (_, i) => (
                <PathDot
                  key={i}
                  light={{ kf: FLOW, o: { duration: 2400, delay: ((p - 1) * 4 + i) * 120 + 1900, easing: STEP1, iterations: "infinite" } }}
                />
              ))}
            </View>
          ) : null}
          {/* the three ideas pop in turn */}
          <Anim kf={POP} o={{ duration: 360, delay: p * 520 + 250, easing: STEPS3 }} style={{ alignItems: "center", gap: 12 }}>
            <IconTile name={icon} tone={tone} size={56} />
            <PixelLabel>{name}</PixelLabel>
          </Anim>
        </View>
      ))}
    </View>
  );
}

// ─── Every purchase, tracked ────────────────────────────────────────────────

// The sample merchants are real, familiar store names on purpose: the owner chose to keep them (2026-09-29).
const FEED: { merchant: string; category: string; via: string; icon: IconName; minor: number }[] = [
  { merchant: "Blue Bottle Coffee", category: "Food / Groceries", via: "Phone tap", icon: "smartphone", minor: 540 },
  { merchant: "Shell", category: "Transportation", via: "Card", icon: "credit-card", minor: 4210 },
  { merchant: "Netflix", category: "Entertainment", via: "Online", icon: "globe", minor: 1549 },
];
const FEED_KF = FEED_LAND.map(feed);

function CaptureScene({ currency }: { currency: string }) {
  return (
    <View testID="scene-auto-capture" style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
      <View style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
        <PixelLabel>Today</PixelLabel>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Anim kf={BLINK} o={{ duration: 1200, easing: STEP1, iterations: "infinite", fill: "none" }} style={{ width: 6, height: 6, backgroundColor: ROLE.pos }} />
          <PixelLabel color={ROLE.pos}>Synced</PixelLabel>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        {/* purchases land one after another, then the list clears */}
        {FEED.map(({ merchant, category, via, icon, minor }, i) => (
          <Anim key={merchant} kf={FEED_KF[i]!} o={{ duration: 6400, easing: EASE_OUT, iterations: "infinite" }}>
            <PixelFrame frame="px-card" style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 6, paddingVertical: 4 }}>
              <CategoryIcon name={category} size={32} />
              <RowText name={merchant}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Icon name={icon} size={12} color={ROLE.muted} />
                  <RNText style={small(ROLE.muted)}>{via}</RNText>
                </View>
              </RowText>
              <Amount minor={-minor} currency={currency} />
            </PixelFrame>
          </Anim>
        ))}
      </View>
    </View>
  );
}

// ─── Pick your currency ─────────────────────────────────────────────────────

function CurrencyScene({ currency }: { currency: string }) {
  return (
    <View testID="scene-currency" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Chip style={{ alignSelf: "center" }}>This month</Chip>
      <Text variant="meta" color={ROLE.muted} style={{ lineHeight: lh(13) }}>
        Money Left
      </Text>
      {/* keyed on the currency: a new choice re-sets the figure in place */}
      <Anim key={currency} kf={AMOUNT_IN} o={{ duration: 460, easing: EASE_OUT }}>
        <Text testID="scene-currency-amount" variant="tNumXl" color={ROLE.text} style={{ fontSize: 40, lineHeight: 40, letterSpacing: -0.4 }}>
          {formatMoney(248000, currency)}
        </Text>
      </Anim>
      <View style={{ marginTop: 8, width: 176 }}>
        <ProgressBar pct={62} />
      </View>
    </View>
  );
}

// ─── Connect your bank ──────────────────────────────────────────────────────

function Tile({ name, frame, children }: { name: string; frame: "px-tile" | "px-tile-wash"; children: ReactNode }) {
  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <PixelFrame frame={frame} style={{ width: 56, height: 56, alignItems: "center", justifyContent: "center" }}>
        {children}
      </PixelFrame>
      <PixelLabel>{name}</PixelLabel>
    </View>
  );
}

function BankScene() {
  return (
    <View testID="scene-bank" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
        <Tile name="Your bank" frame="px-tile">
          <Icon name="bank" color={ROLE.ink} />
        </Tile>
        <View style={{ marginTop: 26, width: 88, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          {/* dot d lights as the lock reaches it */}
          {Array.from({ length: 8 }, (_, d) => (
            <PathDot key={d} light={{ kf: TRAIL, o: { duration: 2800, delay: d * 320 + 600, easing: STEP1, iterations: "infinite" } }} />
          ))}
          {/* a lock carries the connection across in 12px steps; at rest it sits on a dot mid-link (left −8, +36) */}
          <Anim
            testID="bank-lock"
            kf={CARRY}
            o={{ duration: 2800, delay: 600, easing: steps(7, "jump-end"), iterations: "infinite" }}
            style={{ position: "absolute", left: -8, top: -8, transform: [{ translateX: 36 }] }}
          >
            <Badge fill={ROLE.primaryBtn} icon="security" />
          </Anim>
        </View>
        <Tile name="Budgts" frame="px-tile-wash">
          <Robin size={30} />
        </Tile>
      </View>
      <PixelLabel>Secure link via Plaid</PixelLabel>
    </View>
  );
}

// ─── Sorted for you ─────────────────────────────────────────────────────────

const SORT = { duration: 5200, delay: 400, iterations: "infinite" as const };

function SortScene({ currency }: { currency: string }) {
  return (
    <View testID="scene-auto-sort" style={{ flex: 1, justifyContent: "center", gap: 10, paddingHorizontal: 16 }}>
      <PixelFrame frame="px-card" style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 6, paddingVertical: 6 }}>
        {/* "?" flips to the right category; at rest the purchase is already sorted */}
        <View style={{ width: 40, height: 40 }}>
          <PixelFrame frame="px-tile" style={{ position: "absolute", left: 0, top: 0, width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
            <Icon name="help" color={ROLE.muted} />
          </PixelFrame>
          <Anim kf={FLIP_IN} o={SORT} style={{ position: "absolute", left: 0, top: 0 }}>
            <CategoryIcon name="Food / Groceries" size={40} />
          </Anim>
        </View>
        <RowText name="Whole Foods Market">
          <View>
            <Anim kf={SHOW_SORTED} o={{ ...SORT, easing: STEP1 }}>
              <RNText style={small(ROLE.muted)}>Food / Groceries</RNText>
            </Anim>
            <Anim kf={SHOW_UNSORTED} o={{ ...SORT, easing: STEP1 }} style={{ position: "absolute", left: 0, top: 0, opacity: 0 }}>
              <RNText style={small(ROLE.warn)}>Needs a category</RNText>
            </Anim>
          </View>
        </RowText>
        <Amount minor={-4218} currency={currency} />
        <Anim kf={SORTED_POP} o={{ ...SORT, easing: STEPS3 }} style={{ position: "absolute", right: -16, top: -16 }}>
          <Badge fill={ROLE.pos} icon="check" />
        </Anim>
      </PixelFrame>
      <PixelFrame frame="px-card" style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 6, paddingVertical: 4, opacity: 0.6 }}>
        <CategoryIcon name="Transportation" size={32} />
        <RowText name="Uber">
          <RNText style={small(ROLE.muted)}>Transportation</RNText>
        </RowText>
        <Amount minor={-1860} currency={currency} />
      </PixelFrame>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 4 }}>
        {/* Crystal confirms, and it's remembered */}
        <Anim kf={REMEMBER} o={{ ...SORT, easing: EASE_OUT }}>
          <Chip icon="bookmark">Remembered</Chip>
        </Anim>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
          <Anim kf={GOT_IT} o={{ ...SORT, easing: STEPS3 }} style={{ marginBottom: 28, transformOrigin: "100% 100%" }}>
            <Chip>Got it!</Chip>
            <Tail right />
          </Anim>
          <Robin size={36} />
        </View>
      </View>
    </View>
  );
}

// ─── Know what's left ───────────────────────────────────────────────────────

// came in − went out = Money Left, so the preview's arithmetic is the real rule (the web's own sample figures)
const IN = 302821;
const OUT = 135748;

function MoneyLeftScene({ currency }: { currency: string }) {
  return (
    <View testID="scene-money-left" style={{ flex: 1, justifyContent: "center", paddingHorizontal: 20 }}>
      <PixelFrame frame="px-card" style={{ padding: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="caption" color={ROLE.muted} style={{ lineHeight: lh(12) }}>
            Money Left
          </Text>
          <Chip>This month</Chip>
        </View>
        {/* 32px figure, leading-none: the 40px reel line box pulled in to 32; it rolls up like Home's */}
        <View style={{ marginTop: 8, height: 32, justifyContent: "center" }}>
          <RollingAmount value={IN - OUT} currency={currency} variant="tNumXl" color={ROLE.text} />
        </View>
        <View style={{ marginTop: 12, flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <RNText style={small(ROLE.muted)}>Came in</RNText>
            <Amount minor={IN} currency={currency} color={ROLE.pos} />
          </View>
          <View style={{ flex: 1 }}>
            <RNText style={small(ROLE.muted)}>Went out</RNText>
            <Amount minor={-OUT} currency={currency} />
          </View>
        </View>
        <View style={{ marginTop: 14 }}>
          <ProgressBar pct={55} />
        </View>
      </PixelFrame>
    </View>
  );
}

// ─── Budgets and goals ──────────────────────────────────────────────────────

function PlanRow({ icon, kind, name, figure, pct, children }: { icon: ReactNode; kind: string; name: string; figure: string; pct: number; children?: ReactNode }) {
  return (
    <PixelFrame frame="px-card" style={{ paddingHorizontal: 6, paddingVertical: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {icon}
        <View style={{ flex: 1, minWidth: 0 }}>
          <PixelLabel>{kind}</PixelLabel>
          <View style={{ marginTop: 4, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <Text variant="metaStrong" numberOfLines={1} style={{ flexShrink: 1, lineHeight: lh(13) }}>
              {name}
            </Text>
            <RNText style={[small(ROLE.muted), { flexShrink: 0, fontVariant: ["tabular-nums"], letterSpacing: -0.11 }]}>{figure}</RNText>
          </View>
        </View>
      </View>
      <View style={{ marginTop: 10 }}>
        <ProgressBar pct={pct} />
      </View>
      {children}
    </PixelFrame>
  );
}

function PlanScene({ currency }: { currency: string }) {
  const m = (minor: number) => formatMoney(minor, currency);
  return (
    <View testID="scene-plan" style={{ flex: 1, justifyContent: "center", gap: 10, paddingHorizontal: 16 }}>
      <PlanRow icon={<CategoryIcon name="Food / Groceries" size={32} />} kind="Budget" name="Food / Groceries" figure={`${m(21150)} / ${m(40000)}`} pct={53} />
      <PlanRow icon={<IconTile name="goals" size={32} />} kind="Goal" name="Trip fund" figure={`${m(125000)} / ${m(300000)}`} pct={42}>
        {/* a saving lands on the goal, again and again, rising from the row's empty top-right corner */}
        <Anim kf={COIN} o={{ duration: 3200, delay: 1400, easing: EASE_OUT, iterations: "infinite" }} style={{ position: "absolute", right: 12, top: 10 }}>
          <Chip fill={ROLE.pos}>{`+${m(5000)}`}</Chip>
        </Anim>
      </PlanRow>
    </View>
  );
}

// ─── You're all set: the four tabs ──────────────────────────────────────────

const TABS: { glyph: IconName; name: string; caption: string }[] = [
  { glyph: "home", name: "Home", caption: "What's left this month" },
  { glyph: "budgets", name: "Budgets", caption: "Your plan, by category" },
  { glyph: "activity", name: "Activity", caption: "Every purchase, in one list" },
  { glyph: "more", name: "More", caption: "Goals, insights and settings" },
];
const SLOTS = TABS.map((_, k) => slot(k));
const TOUR = { duration: 6000, easing: STEP1, iterations: "infinite" as const, fill: "none" as const };

const CONFETTI_COLORS = [COLOR.signal, ROLE.ink, COLOR.silver, COLOR.growth];
// A fixed fan of 20 pieces (no randomness), the web's own.
const CONFETTI = Array.from({ length: 20 }, (_, i) => {
  const angle = (i / 20) * Math.PI * 2;
  const reach = 70 + ((i * 37) % 5) * 12;
  const x = Math.round(Math.cos(angle) * reach * 1.5);
  const y = Math.round(Math.sin(angle) * reach * 0.8 - 20);
  const r = ((i * 53) % 7) * 45 - 135;
  return { kf: burst(x, y, r), c: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!, t: 250 + (i % 4) * 40 };
});

function DoneScene() {
  const [width, measure] = useWidth();
  const pipTour = useMemo(() => (width ? tabsTour(width / 4) : null), [width]);
  return (
    <View testID="scene-done" onLayout={measure} style={{ flex: 1 }}>
      {/* confetti bursts from 50% / 42% of the stage (a burst only exists mid-motion) */}
      {width
        ? CONFETTI.map((p, i) => (
            <Anim
              key={i}
              kf={p.kf}
              o={{ duration: 1700, delay: p.t }}
              style={{ position: "absolute", left: width / 2 - 2.5, top: SCENE_HEIGHT * 0.42 - 2.5, width: 5, height: 5, backgroundColor: p.c, opacity: 0 }}
            />
          ))
        : null}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 8 }}>
        <Anim kf={HOP} o={{ duration: 900, delay: 200 }}>
          <Robin size={64} mood="happy" />
        </Anim>
        <View style={{ height: 20, alignSelf: "stretch" }}>
          {TABS.map((t, k) => (
            <Anim
              key={t.name}
              kf={SLOTS[k]!}
              o={TOUR}
              style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "center", opacity: k === 0 ? 1 : 0 }}
            >
              <RNText style={[textStyle("meta"), { lineHeight: lh(13), textAlign: "center", color: ROLE.muted }]}>
                <RNText style={{ fontFamily: textStyle("tHead").fontFamily, color: ROLE.text }}>{t.name}</RNText>
                {` · ${t.caption}`}
              </RNText>
            </Anim>
          ))}
        </View>
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: ROLE.hairline, backgroundColor: ROLE.surface }}>
        {pipTour ? (
          <Anim kf={pipTour} o={TOUR} style={{ position: "absolute", left: 0, top: 0, width: "25%", alignItems: "center" }}>
            <View style={{ width: 24, height: 3, backgroundColor: COLOR.signal }} />
          </Anim>
        ) : (
          <View style={{ position: "absolute", left: 0, top: 0, width: "25%", alignItems: "center" }}>
            <View style={{ width: 24, height: 3, backgroundColor: COLOR.signal }} />
          </View>
        )}
        <View style={{ flexDirection: "row" }}>
          {TABS.map((t, k) => (
            <View key={t.name} style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 10 }}>
              <View style={{ width: 24, height: 24 }}>
                <Icon name={t.glyph} color={ROLE.muted} />
                <Anim kf={SLOTS[k]!} o={TOUR} style={{ position: "absolute", left: 0, top: 0, opacity: k === 0 ? 1 : 0 }}>
                  <Icon name={t.glyph} color={COLOR.signal} />
                </Anim>
              </View>
              <RNText style={[textStyle("caption"), { fontSize: 10, lineHeight: lh(10), color: ROLE.muted }]}>{t.name}</RNText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
