import type { JSX, SVGProps } from "react";
import { Analytics } from "pixelarticons/react/Analytics";
import { Archive } from "pixelarticons/react/Archive";
import { ArrowLeft } from "pixelarticons/react/ArrowLeft";
import { ArrowRight } from "pixelarticons/react/ArrowRight";
import { Bell } from "pixelarticons/react/Bell";
import { Bookmark } from "pixelarticons/react/Bookmark";
import { Briefcase } from "pixelarticons/react/Briefcase";
import { Bulletlist } from "pixelarticons/react/Bulletlist";
import { Car } from "pixelarticons/react/Car";
import { ChartLine } from "pixelarticons/react/ChartLine";
import { Check } from "pixelarticons/react/Check";
import { ChevronDown } from "pixelarticons/react/ChevronDown";
import { ChevronLeft } from "pixelarticons/react/ChevronLeft";
import { ChevronRight } from "pixelarticons/react/ChevronRight";
import { ChevronUp } from "pixelarticons/react/ChevronUp";
import { CircleInfo } from "pixelarticons/react/CircleInfo";
import { CircleQuestion } from "pixelarticons/react/CircleQuestion";
import { Close } from "pixelarticons/react/Close";
import { Coins } from "pixelarticons/react/Coins";
import { ColorsSwatch } from "pixelarticons/react/ColorsSwatch";
import { Copy } from "pixelarticons/react/Copy";
import { CreditCard } from "pixelarticons/react/CreditCard";
import { Download } from "pixelarticons/react/Download";
import { Eye } from "pixelarticons/react/Eye";
import { Flag } from "pixelarticons/react/Flag";
import { Gamepad } from "pixelarticons/react/Gamepad";
import { Globe } from "pixelarticons/react/Globe";
import { Google } from "pixelarticons/react/Google";
import { Heart } from "pixelarticons/react/Heart";
import { Home } from "pixelarticons/react/Home";
import { Hourglass } from "pixelarticons/react/Hourglass";
import { Key } from "pixelarticons/react/Key";
import { Label } from "pixelarticons/react/Label";
import { Leaf } from "pixelarticons/react/Leaf";
import { Lightbulb } from "pixelarticons/react/Lightbulb";
import { Lock } from "pixelarticons/react/Lock";
import { Logout } from "pixelarticons/react/Logout";
import { Mail } from "pixelarticons/react/Mail";
import { Minus } from "pixelarticons/react/Minus";
import { Pencil } from "pixelarticons/react/Pencil";
import { Play } from "pixelarticons/react/Play";
import { Plus } from "pixelarticons/react/Plus";
import { Receipt } from "pixelarticons/react/Receipt";
import { Reload } from "pixelarticons/react/Reload";
import { Repeat } from "pixelarticons/react/Repeat";
import { Search } from "pixelarticons/react/Search";
import { SettingsCog } from "pixelarticons/react/SettingsCog";
import { Shield } from "pixelarticons/react/Shield";
import { ShoppingCart } from "pixelarticons/react/ShoppingCart";
import { Smartphone } from "pixelarticons/react/Smartphone";
import { Target } from "pixelarticons/react/Target";
import { TrendingUp } from "pixelarticons/react/TrendingUp";
import { University } from "pixelarticons/react/University";
import { Unlink } from "pixelarticons/react/Unlink";
import { User } from "pixelarticons/react/User";
import { Wallet } from "pixelarticons/react/Wallet";
import { WarningDiamond } from "pixelarticons/react/WarningDiamond";

type Glyph = (props: SVGProps<SVGSVGElement>) => JSX.Element;

/** Drawn on the set's own grid (24 units, 2-unit cells) where its glyph reads
 * wrong at size: Pixelarticons' "more" is three hollow diamonds, which read
 * as "◇◇◇", not as an overflow menu. Three solid cells do. */
function squares(d: string): Glyph {
  function Squares(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d={d} />
      </svg>
    );
  }
  return Squares;
}
const MoreDots = squares("M2 10h4v4H2zm8 0h4v4h-4zm8 0h4v4h-4z");
const MoreKebab = squares("M10 2h4v4h-4zm0 8h4v4h-4zm0 8h4v4h-4z");

/** Every icon in Budgts: one pixel set (Pixelarticons, MIT), one 12-cell grid.
 * Named by what the icon means here, so a glyph can change in one place. */
const GLYPHS = {
  // destinations
  home: Home,
  budgets: Target,
  activity: Analytics,
  goals: Flag,
  accounts: Wallet,
  insights: ChartLine,
  settings: SettingsCog,
  more: MoreDots,
  help: CircleQuestion,
  about: CircleInfo,
  bank: University,
  profile: User,
  security: Lock,
  appearance: ColorsSwatch,
  categories: Label,
  // categories and account kinds
  cart: ShoppingCart,
  car: Car,
  gamepad: Gamepad,
  heart: Heart,
  shield: Shield,
  briefcase: Briefcase,
  "trending-up": TrendingUp,
  transfer: Repeat,
  tag: Label,
  wallet: Wallet,
  "credit-card": CreditCard,
  coins: Coins,
  // actions and marks
  back: ArrowLeft,
  forward: ArrowRight,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  plus: Plus,
  minus: Minus,
  close: Close,
  check: Check,
  search: Search,
  bell: Bell,
  idea: Lightbulb,
  warning: WarningDiamond,
  info: CircleInfo,
  copy: Copy,
  edit: Pencil,
  archive: Archive,
  download: Download,
  "sign-out": Logout,
  disconnect: Unlink,
  sync: Reload,
  pending: Hourglass,
  key: Key,
  eye: Eye,
  play: Play,
  list: Bulletlist,
  receipt: Receipt,
  menu: MoreKebab,
  mail: Mail,
  google: Google,
  // welcome-guide scenes
  leaf: Leaf,
  smartphone: Smartphone,
  globe: Globe,
  bookmark: Bookmark,
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;

/**
 * A pixel icon. Sizes are whole multiples of the 12-cell grid (12 / 24 / 36 /
 * 48), so every cell lands on whole pixels; the line box around an icon is
 * sized to it, not the other way round. Decorative (aria-hidden): whatever
 * holds it carries the accessible name.
 */
export function Icon({
  name,
  size = 24,
  className,
  ...rest
}: { name: IconName; size?: 12 | 24 | 36 | 48; className?: string } & Omit<
  SVGProps<SVGSVGElement>,
  "name" | "width" | "height"
>) {
  const Glyph = GLYPHS[name];
  return (
    <Glyph
      width={size}
      height={size}
      className={`shrink-0 ${className ?? ""}`}
      shapeRendering="crispEdges"
      aria-hidden
      focusable="false"
      {...rest}
    />
  );
}
