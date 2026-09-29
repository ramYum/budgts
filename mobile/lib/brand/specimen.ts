import type { IconName, IconSize, RobinMood, TypeRoleName } from "./shared";

/**
 * The brand specimen: every primitive at a fixed place, in px from the top
 * left of a 412px-wide canvas (the Android parity width). The dev screen
 * (app/dev/brand.tsx) draws it natively; the parity harness draws the same
 * list with the web's own CSS and markup, so the two captures line up
 * element for element. Pure data.
 */

export type SpecimenItem =
  | { kind: "frame"; id: string; frame: string; state?: string; raise?: boolean; x: number; y: number; w: number; h: number }
  | { kind: "robin"; id: string; mood: RobinMood; scale: number; x: number; y: number }
  | { kind: "icon"; id: string; name: IconName; size: IconSize; x: number; y: number }
  | { kind: "text"; id: string; role: TypeRoleName; text: string; x: number; y: number; w: number };

export const SPECIMEN_WIDTH = 412;

const frames: SpecimenItem[] = [
  { kind: "frame", id: "card", frame: "px-card", x: 24, y: 24, w: 172, h: 80 },
  { kind: "frame", id: "card-raised", frame: "px-card-raised", x: 216, y: 24, w: 172, h: 80 },
  { kind: "frame", id: "btn-primary", frame: "px-btn-primary", raise: true, x: 24, y: 128, w: 172, h: 44 },
  { kind: "frame", id: "btn", frame: "px-btn", x: 216, y: 128, w: 172, h: 44 },
  { kind: "frame", id: "field", frame: "px-field", x: 24, y: 192, w: 172, h: 44 },
  { kind: "frame", id: "field-focus", frame: "px-field", state: ":focus-within", x: 216, y: 192, w: 172, h: 44 },
  { kind: "frame", id: "chip", frame: "px-chip", x: 24, y: 256, w: 80, h: 32 },
  { kind: "frame", id: "chip-on", frame: "px-chip", state: "[aria-pressed='true']", x: 116, y: 256, w: 80, h: 32 },
  { kind: "frame", id: "badge-growth", frame: "px-badge-growth", x: 216, y: 260, w: 72, h: 24 },
  { kind: "frame", id: "tile-wash", frame: "px-tile-wash", x: 308, y: 256, w: 32, h: 32 },
  { kind: "frame", id: "tile-ink", frame: "px-tile-ink", x: 356, y: 256, w: 32, h: 32 },
  { kind: "frame", id: "wash", frame: "px-wash", x: 24, y: 308, w: 172, h: 60 },
  { kind: "frame", id: "card-quiet", frame: "px-card-quiet", x: 216, y: 308, w: 172, h: 60 },
];

const robins: SpecimenItem[] = [
  { kind: "robin", id: "robin-normal", mood: "normal", scale: 2, x: 24, y: 396 },
  { kind: "robin", id: "robin-happy", mood: "happy", scale: 3, x: 92, y: 396 },
  { kind: "robin", id: "robin-curious", mood: "curious", scale: 4, x: 186, y: 396 },
  { kind: "robin", id: "robin-sleepy", mood: "sleepy", scale: 2, x: 306, y: 396 },
];

const ICON_ROW: IconName[] = ["home", "budgets", "activity", "goals", "accounts", "insights", "settings", "more", "bank", "mail", "google", "warning"];

const icons: SpecimenItem[] = [
  ...ICON_ROW.map((name, i): SpecimenItem => ({ kind: "icon", id: `icon-${name}`, name, size: 24, x: 24 + i * 30, y: 508 })),
  ...([12, 24, 36, 48] as const).map(
    (size, i): SpecimenItem => ({ kind: "icon", id: `icon-size-${size}`, name: "budgets", size, x: 24 + [0, 24, 60, 108][i]!, y: 548 }),
  ),
];

const texts: SpecimenItem[] = [
  { kind: "text", id: "t-px-title", role: "pxTitle", text: "Savings goals", x: 24, y: 616, w: 364 },
  { kind: "text", id: "t-num-xl", role: "tNumXl", text: "$1,204.50", x: 24, y: 648, w: 364 },
  { kind: "text", id: "t-num-lg", role: "tNumLg", text: "$86.20", x: 24, y: 696, w: 172 },
  { kind: "text", id: "t-num", role: "tNum", text: "$3,400.00", x: 216, y: 698, w: 172 },
  { kind: "text", id: "t-head", role: "tHead", text: "Spending by category", x: 24, y: 732, w: 364 },
  { kind: "text", id: "t-body", role: "body", text: "Track spending against your budget.", x: 24, y: 760, w: 364 },
  { kind: "text", id: "t-meta", role: "meta", text: "Updated 2 minutes ago", x: 24, y: 788, w: 364 },
  { kind: "text", id: "t-label", role: "tLabel", text: "Came in", x: 24, y: 812, w: 172 },
  { kind: "text", id: "t-px-tag", role: "pxTagBold", text: "Track plan grow", x: 216, y: 814, w: 172 },
];

export const SPECIMEN: SpecimenItem[] = [...frames, ...robins, ...icons, ...texts];

export const SPECIMEN_HEIGHT = 848;
