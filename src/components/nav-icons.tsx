/** Shared line-icon set for navigation — bottom nav, desktop sidebar, and the
 * More hub all draw from this one glyph map so the icon language stays
 * consistent everywhere a destination is listed (design spec §"Navigation
 * icon system"). Same stroke weight/rounding as the brand guideline's nav
 * icon examples (home / insights / add / goals / settings). */
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
  | "back";

const common = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS: Record<NavGlyph, React.ReactNode> = {
  home: <path {...common} d="m3.5 10 8.5-7 8.5 7v9.5a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1Z" />,
  budgets: (
    <>
      <circle {...common} cx="12" cy="12" r="7.5" />
      <circle {...common} cx="12" cy="12" r="2" />
      <path {...common} d="m17.5 6.5 3-3" />
    </>
  ),
  activity: <path {...common} d="M4 18V9m5 9V5m5 13v-7m5 7V3" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  goals: (
    <>
      <path {...common} d="M6 3v18" />
      <path {...common} d="M6 4h11l-3 3.5L17 11H6" />
    </>
  ),
  accounts: (
    <>
      <path {...common} d="M4 7.5A1.5 1.5 0 0 1 5.5 6h11A1.5 1.5 0 0 1 18 7.5V9H4Z" />
      <path {...common} d="M4 9h16v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" />
      <circle cx="16" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  insights: (
    <>
      <path {...common} d="M4 17.5 9 12l3.5 3 6-6.5" />
      <path {...common} d="M14 8.5h4.5V13" />
    </>
  ),
  settings: (
    <>
      <circle {...common} cx="12" cy="12" r="2.7" />
      <path
        {...common}
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.05 2.05-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56v.09h-2.9v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06-2.05-2.05.06-.06A1.7 1.7 0 0 0 7.28 15a1.7 1.7 0 0 0-1.56-1.03h-.09v-2.9h.09A1.7 1.7 0 0 0 7.28 10a1.7 1.7 0 0 0-.34-1.87l-.06-.06 2.05-2.05.06.06A1.7 1.7 0 0 0 10.86 6a1.7 1.7 0 0 0 1.03-1.56v-.09h2.9v.09A1.7 1.7 0 0 0 15.82 6a1.7 1.7 0 0 0 1.87.34l.06-.06 2.05 2.05-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.56 1.03h.09v2.9h-.09A1.7 1.7 0 0 0 19.4 15Z"
      />
    </>
  ),
  help: (
    <>
      <circle {...common} cx="12" cy="12" r="8.5" />
      <path {...common} d="M9.6 9.3a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1 .8-1 1.7" />
      <circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  about: (
    <>
      <circle {...common} cx="12" cy="12" r="8.5" />
      <path {...common} d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  "connected-banks": (
    <>
      <path {...common} d="M4 10.5 12 5l8 5.5" />
      <path {...common} d="M5.5 10.5v7M18.5 10.5v7M9.5 10.5v7M14.5 10.5v7" />
      <path {...common} d="M4 19h16" />
    </>
  ),
  back: <path {...common} d="M14.5 5.5 8 12l6.5 6.5" />,
};

export function NavIcon({ glyph, className = "h-[18px] w-[18px]" }: { glyph: NavGlyph; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      {PATHS[glyph]}
    </svg>
  );
}
