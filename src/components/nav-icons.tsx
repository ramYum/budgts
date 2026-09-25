import {
  Bank,
  CaretLeft,
  ChartBar,
  ChartLineUp,
  ChatCircleDots,
  Coins,
  DotsThree,
  Flag,
  GearSix,
  House,
  Info,
  LockSimple,
  Palette,
  UserCircle,
  Question,
  Tag,
  Target,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon, IconWeight } from "@phosphor-icons/react";

/** One line-icon family (Phosphor, one stroke weight) for every destination:
 * bottom nav, desktop sidebar, More hub, help. `fill` weight marks the
 * active tab, so the selected state reads by shape as well as color. */
export type NavGlyph =
  | "home"
  | "budgets"
  | "activity"
  | "more"
  | "goals"
  | "accounts"
  | "insights"
  | "settings"
  | "help"
  | "about"
  | "connected-banks"
  | "back"
  | "categorize"
  | "review"
  | "money-left"
  | "profile"
  | "security"
  | "appearance";

const ICONS: Record<NavGlyph, Icon> = {
  home: House,
  budgets: Target,
  activity: ChartBar,
  more: DotsThree,
  goals: Flag,
  accounts: Wallet,
  insights: ChartLineUp,
  settings: GearSix,
  help: Question,
  about: Info,
  "connected-banks": Bank,
  back: CaretLeft,
  categorize: Tag,
  review: ChatCircleDots,
  "money-left": Coins,
  profile: UserCircle,
  security: LockSimple,
  appearance: Palette,
};

export function NavIcon({
  glyph,
  className = "h-5 w-5",
  weight = "regular",
}: {
  glyph: NavGlyph;
  className?: string;
  weight?: IconWeight;
}) {
  const Glyph = ICONS[glyph];
  return <Glyph aria-hidden className={className} weight={weight} />;
}
