import { Fragment, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";
import { RollingAmount } from "@/components/rolling-amount";
import { Robin } from "@/components/mascot";
import { CategoryIcon, ProgressBar } from "@/components/ui";
import { formatMoney } from "@/lib/budget/money";
import type { TourStepId } from "@/lib/tour/steps";
import s from "./guide.module.css";

/** The animated vignette at the top of each welcome-guide card
 * (docs/specs/2026-09-25-welcome-guide-design.md). Each one is built from the
 * app's real parts (category tiles, square-cell progress, the Money Left
 * figure, the tab bar), so the guide previews exactly what the user will
 * see. Decorative: the card's heading and body carry the meaning, so the
 * scene slot is aria-hidden. With motion off each scene shows its finished
 * state (guide.module.css). */
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

const vars = (v: Record<string, string | number>) => v as CSSProperties;

const label = "font-pixel text-[8px] uppercase text-muted";
const chip = "pixel-corners font-pixel-bold px-2 py-1.5 text-[8px] leading-none text-white";

// ─── Crystal introduces herself ─────────────────────────────────────────────

const SPARKLES = [
  { x: "16%", y: "20%", c: "var(--signal)" },
  { x: "82%", y: "16%", c: "var(--silver)" },
  { x: "10%", y: "62%", c: "var(--silver)" },
  { x: "88%", y: "56%", c: "var(--signal)" },
  { x: "26%", y: "84%", c: "var(--ink)" },
];
const DUST = [
  { x: "34%", dx: -16 },
  { x: "42%", dx: -7 },
  { x: "60%", dx: 7 },
  { x: "68%", dx: 16 },
];

function CrystalScene() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      {SPARKLES.map((p, i) => (
        <span key={i} className={s.sparkle} style={vars({ left: p.x, top: p.y, color: p.c, "--s": i })} />
      ))}
      <div className="relative">
        <div className={s.drop}>
          <div className={s.squash}>
            <Robin size={104} mood="happy" />
          </div>
        </div>
        {DUST.map((d) => (
          <span key={d.x} className={s.dust} style={vars({ left: d.x, "--dx": `${d.dx}px` })} />
        ))}
        <span className={`${s.bubble} absolute -top-5 left-[84%]`}>
          <span className={`${chip} block bg-ink`}>Hi!</span>
          <span className={s.tail} />
        </span>
      </div>
      <div className={`${s.plate} mt-4 flex flex-col items-center gap-2`}>
        <span className="font-pixel-bold text-[8px] text-ink">CRYSTAL</span>
        <span className={label}>Your budget buddy</span>
      </div>
    </div>
  );
}

// ─── What Budgts does: Track · Plan · Grow ──────────────────────────────────

const PILLARS: { name: string; icon: IconName; tile: string }[] = [
  { name: "Track", icon: "activity", tile: "px-tile text-ink" },
  { name: "Plan", icon: "budgets", tile: "px-tile text-ink" },
  { name: "Grow", icon: "leaf", tile: "px-tile-accent text-white" },
];

function WelcomeScene() {
  return (
    <div className="flex h-full items-start justify-center gap-3 pt-[76px]">
      {PILLARS.map(({ name, icon, tile }, p) => (
        <Fragment key={name}>
          {p > 0 ? (
            <span className="mt-[26px] flex gap-1">
              {Array.from({ length: 4 }, (_, i) => (
                <span key={i} className={s.dot} style={vars({ "--d": (p - 1) * 4 + i })} />
              ))}
            </span>
          ) : null}
          <span className={`${s.pillar} flex flex-col items-center gap-3`} style={vars({ "--p": p })}>
            <span className={`flex h-14 w-14 items-center justify-center ${tile}`}>
              <Icon name={icon} />
            </span>
            <span className={label}>{name}</span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

// ─── Every purchase, tracked ────────────────────────────────────────────────

const FEED: { merchant: string; category: string; via: string; icon: IconName; minor: number }[] = [
  { merchant: "Blue Bottle Coffee", category: "Food / Groceries", via: "Phone tap", icon: "smartphone", minor: 540 },
  { merchant: "Shell", category: "Transportation", via: "Card", icon: "credit-card", minor: 4210 },
  { merchant: "Netflix", category: "Entertainment", via: "Online", icon: "globe", minor: 1549 },
];
const FEED_CLASS = [s.feed0, s.feed1, s.feed2];

function CaptureScene({ currency }: { currency: string }) {
  return (
    <div className="flex h-full flex-col justify-center px-4">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <span className={label}>Today</span>
        <span className="font-pixel flex items-center gap-1.5 text-[8px] uppercase text-pos">
          <span className={`${s.syncing} h-1.5 w-1.5 bg-pos`} />
          Synced
        </span>
      </div>
      <ul className="space-y-2">
        {FEED.map(({ merchant, category, via, icon, minor }, i) => (
          <li
            key={merchant}
            className={`${FEED_CLASS[i]} px-card flex items-center gap-3 px-1.5 py-1`}
          >
            <CategoryIcon name={category} size={32} />
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px] font-medium text-text">{merchant}</span>
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <Icon name={icon} size={12} />
                {via}
              </span>
            </span>
            <Amount minor={-minor} currency={currency} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Pick your currency ─────────────────────────────────────────────────────

function CurrencyScene({ currency }: { currency: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <span className={`${chip} bg-ink`}>This month</span>
      <span className="text-[13px] text-muted">Money Left</span>
      {/* keyed on the currency: a new choice re-sets the figure in place */}
      <span key={currency} className={`${s.amount} tnum text-[40px] font-semibold leading-none tracking-tight text-text`}>
        {formatMoney(248000, currency)}
      </span>
      <ProgressBar pct={62} className="mt-2 w-44" />
    </div>
  );
}

// ─── Connect your bank ──────────────────────────────────────────────────────

function Tile({ name, tone, children }: { name: string; tone: string; children: ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-3">
      <span className={`flex h-14 w-14 items-center justify-center ${tone}`}>{children}</span>
      <span className={label}>{name}</span>
    </span>
  );
}

function BankScene() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="flex items-start gap-4">
        <Tile name="Your bank" tone="px-tile text-ink">
          <Icon name="bank" />
        </Tile>
        <span className={`${s.linkPath} mt-[26px]`}>
          {Array.from({ length: 8 }, (_, d) => (
            <span key={d} className={s.dot} style={vars({ "--d": d })} />
          ))}
          <span className={`${s.lock} pixel-corners flex h-5 w-5 items-center justify-center bg-primary-btn text-white`}>
            <Icon name="security" size={12} />
          </span>
        </span>
        <Tile name="Budgts" tone="px-tile-wash">
          <Robin size={30} />
        </Tile>
      </div>
      <span className={label}>Secure link via Plaid</span>
    </div>
  );
}

// ─── Sorted for you ─────────────────────────────────────────────────────────

function SortScene({ currency }: { currency: string }) {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5 px-4">
      <div className="px-card relative flex items-center gap-3 px-1.5 py-1.5">
        <span className={`${s.stack} h-10 w-10 shrink-0`}>
          <span className="px-tile flex items-center justify-center text-muted">
            <Icon name="help" />
          </span>
          <span className={s.known}>
            <CategoryIcon name="Food / Groceries" size={40} />
          </span>
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-medium text-text">Whole Foods Market</span>
          <span className={`${s.stack} text-[11px]`}>
            <span className={`${s.unknownMeta} text-warn`}>Needs a category</span>
            <span className={`${s.knownMeta} text-muted`}>Food / Groceries</span>
          </span>
        </span>
        <Amount minor={-4218} currency={currency} />
        <span className={`${s.check} pixel-corners absolute -right-4 -top-4 flex h-5 w-5 items-center justify-center bg-pos text-white`}>
          <Icon name="check" size={12} />
        </span>
      </div>
      <div className="px-card flex items-center gap-3 px-1.5 py-1 opacity-60">
        <CategoryIcon name="Transportation" size={32} />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-medium text-text">Uber</span>
          <span className="block text-[11px] text-muted">Transportation</span>
        </span>
        <Amount minor={-1860} currency={currency} />
      </div>
      <div className="flex items-end justify-between px-1">
        <span className={`${s.remember} ${chip} flex items-center gap-1.5 bg-ink`}>
          <Icon name="bookmark" size={12} />
          Remembered
        </span>
        <span className="flex items-end gap-1.5">
          <span className={`${s.gotIt} relative mb-7`}>
            <span className={`${chip} block bg-ink`}>Got it!</span>
            <span className={`${s.tail} ${s.tailRight}`} />
          </span>
          <Robin size={36} />
        </span>
      </div>
    </div>
  );
}

// ─── Know what's left ───────────────────────────────────────────────────────

// came in − went out = Money Left, so the preview's arithmetic is the real rule
const IN = 302821;
const OUT = 135748;

function MoneyLeftScene({ currency }: { currency: string }) {
  return (
    <div className="flex h-full flex-col justify-center px-5">
      <div className="px-card p-2 text-left">
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-muted">Money Left</span>
          <span className={`${chip} bg-ink`}>This month</span>
        </div>
        <p className="tnum mt-2 text-[32px] font-semibold leading-none tracking-tight text-text">
          <RollingAmount value={IN - OUT} currency={currency} />
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
          <span>
            <span className="block text-muted">Came in</span>
            <Amount minor={IN} currency={currency} className="text-pos" />
          </span>
          <span>
            <span className="block text-muted">Went out</span>
            <Amount minor={-OUT} currency={currency} />
          </span>
        </div>
        <ProgressBar pct={55} className="mt-3.5" />
      </div>
    </div>
  );
}

// ─── Budgets and goals ──────────────────────────────────────────────────────

function PlanRow({
  icon,
  kind,
  name,
  figure,
  pct,
  children,
}: {
  icon: ReactNode;
  kind: string;
  name: string;
  figure: string;
  pct: number;
  children?: ReactNode;
}) {
  return (
    <div className="px-card relative px-1.5 py-1.5 text-left">
      <div className="flex items-center gap-3">
        {icon}
        <span className="min-w-0 flex-1">
          <span className={`${label} block`}>{kind}</span>
          <span className="mt-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-text">{name}</span>
            <span className="tnum shrink-0 text-[11px] text-muted">{figure}</span>
          </span>
        </span>
      </div>
      <ProgressBar pct={pct} className="mt-2.5" />
      {children}
    </div>
  );
}

function PlanScene({ currency }: { currency: string }) {
  const m = (minor: number) => formatMoney(minor, currency);
  return (
    <div className="flex h-full flex-col justify-center gap-2.5 px-4">
      <PlanRow
        icon={<CategoryIcon name="Food / Groceries" size={32} />}
        kind="Budget"
        name="Food / Groceries"
        figure={`${m(21150)} / ${m(40000)}`}
        pct={53}
      />
      <PlanRow
        icon={
          <span className="px-tile flex h-8 w-8 items-center justify-center text-ink">
            <Icon name="goals" />
          </span>
        }
        kind="Goal"
        name="Trip fund"
        figure={`${m(125000)} / ${m(300000)}`}
        pct={42}
      >
        {/* rises from the row's empty top-right corner, beside the GOAL label */}
        <span className={`${s.coin} ${chip} absolute right-3 top-2.5 bg-pos`}>+{m(5000)}</span>
      </PlanRow>
    </div>
  );
}

// ─── You're all set: the four tabs ──────────────────────────────────────────

const TABS: { glyph: IconName; name: string; caption: string }[] = [
  { glyph: "home", name: "Home", caption: "What's left this month" },
  { glyph: "budgets", name: "Budgets", caption: "Your plan, by category" },
  { glyph: "activity", name: "Activity", caption: "Every purchase, in one list" },
  { glyph: "more", name: "More", caption: "Goals, insights and settings" },
];

const CONFETTI_COLORS = ["var(--signal)", "var(--ink)", "var(--silver)", "var(--growth)"];
// A fixed fan of 20 pieces (no randomness, so server and client agree).
const CONFETTI = Array.from({ length: 20 }, (_, i) => {
  const angle = (i / 20) * Math.PI * 2;
  const reach = 70 + ((i * 37) % 5) * 12;
  return {
    x: Math.round(Math.cos(angle) * reach * 1.5),
    y: Math.round(Math.sin(angle) * reach * 0.8 - 20),
    r: ((i * 53) % 7) * 45 - 135,
    c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    t: 250 + (i % 4) * 40,
  };
});

function DoneScene() {
  return (
    <div className="flex h-full flex-col">
      {CONFETTI.map((p, i) => (
        <span
          key={i}
          className={s.confetti}
          style={vars({ "--x": `${p.x}px`, "--y": `${p.y}px`, "--r": `${p.r}deg`, "--c": p.c, "--t": `${p.t}ms` })}
        />
      ))}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 pt-2">
        <span className={s.hop}>
          <Robin size={64} mood="happy" />
        </span>
        <span className="relative block h-5 w-full">
          {TABS.map((t, k) => (
            <span
              key={t.name}
              className={`${s.caption} absolute inset-0 text-center text-[13px]`}
              style={vars({ "--k": k })}
            >
              <span className="font-semibold text-text">{t.name}</span>
              <span className="text-muted"> · {t.caption}</span>
            </span>
          ))}
        </span>
      </div>
      <div className="relative border-t border-hairline bg-surface">
        <span className={`${s.navPip} absolute left-0 top-0 flex justify-center`}>
          <span className="h-[3px] w-6 bg-signal" />
        </span>
        <div className="grid grid-cols-4">
          {TABS.map((t, k) => (
            <span key={t.name} className={`${s.tab} flex flex-col items-center gap-1 py-2.5`} style={vars({ "--k": k })}>
              <span className="relative h-6 w-6">
                <Icon name={t.glyph} className="absolute inset-0 text-muted" />
                <span className={`${s.tabLit} absolute inset-0 text-signal`}>
                  <Icon name={t.glyph} />
                </span>
              </span>
              <span className="text-[10px] text-muted">{t.name}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── shared ─────────────────────────────────────────────────────────────────

/** Signed amount in the app's style: "−" for money out, "+" for money in. */
function Amount({ minor, currency, className }: { minor: number; currency: string; className?: string }) {
  return (
    <span className={`tnum text-[13px] font-medium ${className ?? "text-text"}`}>
      {minor < 0 ? "−" : "+"}
      {formatMoney(Math.abs(minor), currency)}
    </span>
  );
}
