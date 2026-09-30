import { useState, type ReactNode } from "react";
import { Text as RNText, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { COLOR, ROLE, type IconName } from "../../lib/brand/shared";
import { textStyle } from "../../lib/brand/type";
import { formatMoney } from "../../lib/home/format";
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
import { SCENE_HEIGHT } from "./tour-card";

/**
 * The vignette at the top of each welcome-guide card (web src/components/tour/scenes.tsx), built from the app's real
 * parts (category tiles, square-cell progress, the Money Left figure, the tab bar) so the guide previews what the user
 * will see. These are the web's resting frames (guide.module.css base styles: every scene's finished state, what it shows
 * with motion off); the motion is Task A4. Decorative: the card's heading and body carry the meaning.
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

// ─── Crystal introduces herself ─────────────────────────────────────────────

const SPARKLES = [
  { x: 0.16, y: 0.2, c: COLOR.signal },
  { x: 0.82, y: 0.16, c: COLOR.silver },
  { x: 0.1, y: 0.62, c: COLOR.silver },
  { x: 0.88, y: 0.56, c: COLOR.signal },
  { x: 0.26, y: 0.84, c: ROLE.ink },
];

/** `.sparkle`: a 3px cell and its four neighbours, a four-point pixel star. */
const SPARKLE_PATH = "M3 0h3v3h3v3h-3v3h-3v-3h-3v-3h3z";

const CRYSTAL_SIZE = 104;
const CRYSTAL_WIDTH = Math.round(CRYSTAL_SIZE * (26 / 22));

function CrystalScene() {
  const [width, setWidth] = useState<number | null>(null);
  return (
    <View
      testID="scene-crystal"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      {width
        ? SPARKLES.map((p, i) => (
            <Svg key={i} width={9} height={9} style={{ position: "absolute", left: p.x * width - 3, top: p.y * SCENE_HEIGHT - 3 }}>
              <Path d={SPARKLE_PATH} fill={p.c} />
            </Svg>
          ))
        : null}
      <View>
        <Robin size={CRYSTAL_SIZE} mood="happy" />
        <View style={{ position: "absolute", top: -20, left: 0.84 * CRYSTAL_WIDTH }}>
          <Chip>Hi!</Chip>
          <Tail />
        </View>
      </View>
      <View style={{ marginTop: 16, alignItems: "center", gap: 8 }}>
        <RNText style={[textStyle("pxTagBold"), { letterSpacing: 0, textTransform: "none", color: ROLE.ink }]}>CRYSTAL</RNText>
        <PixelLabel>Your budget buddy</PixelLabel>
      </View>
    </View>
  );
}

// ─── What Budgts does: Track · Plan · Grow ──────────────────────────────────

const PILLARS: { name: string; icon: IconName; tone: "gray" | "accent" }[] = [
  { name: "Track", icon: "activity", tone: "gray" },
  { name: "Plan", icon: "budgets", tone: "gray" },
  { name: "Grow", icon: "leaf", tone: "accent" },
];

function Dots({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: 4, height: 4, backgroundColor: COLOR.gray }} />
      ))}
    </>
  );
}

function WelcomeScene() {
  return (
    <View testID="scene-welcome" style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 12, paddingTop: 76 }}>
      {PILLARS.map(({ name, icon, tone }, p) => (
        <View key={name} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          {p > 0 ? (
            <View style={{ marginTop: 26, flexDirection: "row", gap: 4 }}>
              <Dots count={4} />
            </View>
          ) : null}
          <View style={{ alignItems: "center", gap: 12 }}>
            <IconTile name={icon} tone={tone} size={56} />
            <PixelLabel>{name}</PixelLabel>
          </View>
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

function CaptureScene({ currency }: { currency: string }) {
  return (
    <View testID="scene-auto-capture" style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
      <View style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
        <PixelLabel>Today</PixelLabel>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 6, height: 6, backgroundColor: ROLE.pos }} />
          <PixelLabel color={ROLE.pos}>Synced</PixelLabel>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        {FEED.map(({ merchant, category, via, icon, minor }) => (
          <PixelFrame
            key={merchant}
            frame="px-card"
            style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 6, paddingVertical: 4 }}
          >
            <CategoryIcon name={category} size={32} />
            <RowText name={merchant}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name={icon} size={12} color={ROLE.muted} />
                <RNText style={small(ROLE.muted)}>{via}</RNText>
              </View>
            </RowText>
            <Amount minor={-minor} currency={currency} />
          </PixelFrame>
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
      <Text
        testID="scene-currency-amount"
        variant="tNumXl"
        color={ROLE.text}
        style={{ fontSize: 40, lineHeight: 40, letterSpacing: -0.4 }}
      >
        {formatMoney(248000, currency)}
      </Text>
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
          <Dots count={8} />
          {/* the lock rests on a dot mid-link: left −8 + 36, centred on the 4px path */}
          <View style={{ position: "absolute", left: 28, top: -8, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
            <Svg width={20} height={20} style={{ position: "absolute", left: 0, top: 0 }}>
              <Path d={pixelCornersPath(20, 20)} fill={ROLE.primaryBtn} />
            </Svg>
            <Icon name="security" size={12} color={COLOR.white} />
          </View>
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

function SortScene({ currency }: { currency: string }) {
  return (
    <View testID="scene-auto-sort" style={{ flex: 1, justifyContent: "center", gap: 10, paddingHorizontal: 16 }}>
      <PixelFrame frame="px-card" style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 6, paddingVertical: 6 }}>
        {/* at rest the purchase is already sorted: its category tile covers the "?" */}
        <CategoryIcon name="Food / Groceries" size={40} />
        <RowText name="Whole Foods Market">
          <RNText style={small(ROLE.muted)}>Food / Groceries</RNText>
        </RowText>
        <Amount minor={-4218} currency={currency} />
        <View style={{ position: "absolute", right: -16, top: -16, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
          <Svg width={20} height={20} style={{ position: "absolute", left: 0, top: 0 }}>
            <Path d={pixelCornersPath(20, 20)} fill={ROLE.pos} />
          </Svg>
          <Icon name="check" size={12} color={COLOR.white} />
        </View>
      </PixelFrame>
      <PixelFrame frame="px-card" style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 6, paddingVertical: 4, opacity: 0.6 }}>
        <CategoryIcon name="Transportation" size={32} />
        <RowText name="Uber">
          <RNText style={small(ROLE.muted)}>Transportation</RNText>
        </RowText>
        <Amount minor={-1860} currency={currency} />
      </PixelFrame>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 4 }}>
        <Chip icon="bookmark">Remembered</Chip>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
          <View style={{ marginBottom: 28 }}>
            <Chip>Got it!</Chip>
            <Tail right />
          </View>
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
        {/* 32px figure, leading-none: the 40px reel line box pulled in to 32 */}
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
        {/* rises from the row's empty top-right corner, beside the GOAL label */}
        <Chip fill={ROLE.pos} style={{ position: "absolute", right: 12, top: 10 }}>{`+${m(5000)}`}</Chip>
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

function DoneScene() {
  // at rest the first tab is lit and captioned (guide.module.css `.tab:first-child .tabLit`, `.caption:first-child`)
  const first = TABS[0]!;
  return (
    <View testID="scene-done" style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 8 }}>
        <Robin size={64} mood="happy" />
        <View style={{ height: 20, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}>
          <RNText style={[textStyle("meta"), { lineHeight: lh(13), textAlign: "center", color: ROLE.muted }]}>
            <RNText style={{ fontFamily: textStyle("tHead").fontFamily, color: ROLE.text }}>{first.name}</RNText>
            {` · ${first.caption}`}
          </RNText>
        </View>
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: ROLE.hairline, backgroundColor: ROLE.surface }}>
        <View style={{ position: "absolute", left: 0, top: 0, width: "25%", alignItems: "center" }}>
          <View style={{ width: 24, height: 3, backgroundColor: COLOR.signal }} />
        </View>
        <View style={{ flexDirection: "row" }}>
          {TABS.map((t, k) => (
            <View key={t.name} style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 10 }}>
              <Icon name={t.glyph} color={k === 0 ? COLOR.signal : ROLE.muted} />
              <RNText style={[textStyle("caption"), { fontSize: 10, lineHeight: lh(10), color: ROLE.muted }]}>{t.name}</RNText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
