import type { SVGProps } from "react";
import { ICONS, ICON_VIEWBOX, type IconName, type IconSize } from "@/lib/brand/icons";

export type { IconName };

/**
 * A pixel icon from the one icon table (src/lib/brand/icons.ts), which the
 * native apps draw from too. Sizes are whole multiples of the 12-cell grid
 * (12 / 24 / 36 / 48), so every cell lands on whole pixels; the line box
 * around an icon is sized to it, not the other way round. Decorative
 * (aria-hidden): whatever holds it carries the accessible name.
 */
export function Icon({
  name,
  size = 24,
  className,
  ...rest
}: { name: IconName; size?: IconSize; className?: string } & Omit<
  SVGProps<SVGSVGElement>,
  "name" | "width" | "height"
>) {
  return (
    <svg
      viewBox={ICON_VIEWBOX}
      width={size}
      height={size}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className ?? ""}`}
      shapeRendering="crispEdges"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {ICONS[name].d.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
